import { create } from "zustand";
import { renderCopy } from "./copy";
import { createHaptics, type Haptics } from "./haptics";
import { defaultPetState, normalizeName, parsePetSave, petSaveFromState } from "./persistence";
import { reducePet } from "./state-machine";
import { createTauriPetStorage } from "./tauri-pet-storage";
import type {
  Bubble,
  CopyId,
  GestureEvent,
  HeartBurst,
  PetEffect,
  PetEvent,
  PetSaveV1,
  PetSettings,
  PetState,
  PetStorage,
  PetStoreState,
  Posture,
  RiveSignal,
} from "./types";

type PetStoreDeps = {
  storage: PetStorage;
  haptics: Haptics;
  now: () => number;
};

const BUBBLE_COOLDOWN_MS = 30_000;
const BUBBLE_DURATION_MS = 4000;
const HEART_DURATION_MS = 1200;
const SAVE_DEBOUNCE_MS = 500;
const PETTING_COMPLETE_MS = 3000;

export function createPetStore(deps: PetStoreDeps) {
  let hydratePromise: Promise<void> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  let heartTimer: ReturnType<typeof setTimeout> | null = null;
  let pettingTimer: ReturnType<typeof setTimeout> | null = null;
  let writeChain: Promise<void> = Promise.resolve();
  let lastBubbleAt = 0;
  let bubbleId = 0;
  let heartId = 0;
  let riveId = 0;

  return create<PetStoreState>((set, get) => {
    function scheduleSave() {
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        void get().flush();
      }, SAVE_DEBOUNCE_MS);
    }

    function clearPettingTimer() {
      if (pettingTimer === null) return;
      clearTimeout(pettingTimer);
      pettingTimer = null;
    }

    function showBubble(copyId: CopyId, durationMs = BUBBLE_DURATION_MS) {
      const now = deps.now();
      const bypass =
        copyId === "named" ||
        copyId === "corrupted" ||
        copyId === "returning" ||
        copyId === "returning_long";

      if (!bypass && lastBubbleAt > 0 && now - lastBubbleAt < BUBBLE_COOLDOWN_MS) return;

      lastBubbleAt = now;
      bubbleId += 1;
      if (bubbleTimer !== null) clearTimeout(bubbleTimer);

      const bubble: Bubble = {
        id: bubbleId,
        copyId,
        text: renderCopy(copyId, get().pet.name),
      };
      set({ bubble });

      bubbleTimer = setTimeout(() => {
        bubbleTimer = null;
        set({ bubble: null });
      }, durationMs);
    }

    function processEffects(effects: PetEffect[], pet: PetState) {
      const bubbleEffect = effects.find((effect) => effect.type === "bubble");
      if (bubbleEffect && pet.phase !== "listening") {
        showBubble(bubbleEffect.copyId, bubbleEffect.durationMs);
      }

      const heartsEffect = effects.find((effect) => effect.type === "hearts");
      if (heartsEffect) {
        heartId += 1;
        if (heartTimer !== null) clearTimeout(heartTimer);
        const burst: HeartBurst = { id: heartId, count: Math.min(6, heartsEffect.count) };
        set({ heartBurst: burst });
        heartTimer = setTimeout(() => {
          heartTimer = null;
          set({ heartBurst: null });
        }, HEART_DURATION_MS);
      }

      const riveEffect = effects.find((effect) => effect.type === "rive");
      if (riveEffect) {
        riveId += 1;
        const signal: RiveSignal = { id: riveId, trigger: riveEffect.trigger };
        set({ riveSignal: signal });
      }

      if (pet.settings.haptics) {
        for (const effect of effects) {
          if (effect.type === "haptic") deps.haptics[effect.style]();
        }
      }
    }

    return {
      pet: defaultPetState(deps.now()),
      hydrated: false,
      saveStatus: "idle",
      bubble: null,
      heartBurst: null,
      riveSignal: null,

      hydrate: () => {
        if (get().hydrated) return Promise.resolve();
        if (hydratePromise) return hydratePromise;

        hydratePromise = (async () => {
          let raw: unknown = null;
          let loadFailed = false;

          try {
            const result = await deps.storage.load();
            raw = result.raw;
          } catch {
            loadFailed = true;
          }

          const now = deps.now();
          const parsed = parsePetSave(raw, now);
          const { state, effects } = reducePet(get().pet, {
            type: "BOOT",
            now,
            save: parsed.save,
            corrupted: parsed.corrupted,
          });

          set({ pet: state, hydrated: true, saveStatus: loadFailed ? "error" : "idle" });
          processEffects(effects, state);

          if (!loadFailed) scheduleSave();
        })();

        return hydratePromise;
      },

      dispatch: (event: PetEvent) => {
        const { state, effects } = reducePet(get().pet, event);
        set({ pet: state });
        processEffects(effects, state);

        if (event.type === "VISIBILITY" && !event.visible) {
          void get().flush();
        } else {
          scheduleSave();
        }
      },

      handleGesture: (event: GestureEvent) => {
        switch (event.type) {
          case "pet-start": {
            clearPettingTimer();
            const startedAt = event.at;
            get().dispatch({ type: "PET_START", now: startedAt });
            pettingTimer = setTimeout(() => {
              pettingTimer = null;
              get().dispatch({
                type: "PET_PROGRESS",
                now: startedAt + PETTING_COMPLETE_MS,
              });
            }, PETTING_COMPLETE_MS);
            break;
          }
          case "pet-progress":
          case "pet-complete": {
            get().dispatch({ type: "PET_PROGRESS", now: event.at });
            break;
          }
          case "pet-end": {
            clearPettingTimer();
            get().dispatch({ type: "PET_END", now: event.at });
            break;
          }
          case "poke": {
            get().dispatch({ type: "POKE", now: event.at });
            break;
          }
        }
      },

      setName: async (name: string) => {
        const normalized = normalizeName(name);
        if (!normalized) return false;

        const now = deps.now();
        const { state, effects } = reducePet(get().pet, {
          type: "NAME_SET",
          now,
          name: normalized,
          skipped: false,
        });
        set({ pet: state });
        processEffects(effects, state);
        await get().flush();

        return get().saveStatus !== "error";
      },

      setPosture: async (posture: Posture) => {
        return get().updateSettings({ posture });
      },

      updateSettings: async (patch: Partial<PetSettings>) => {
        const previous = get().pet;
        const next = {
          ...previous,
          settings: { ...previous.settings, ...patch },
        };
        set({ pet: next });
        await get().flush();

        if (get().saveStatus === "error") {
          set({ pet: previous });
          return false;
        }

        return true;
      },

      resetPet: async () => {
        const now = deps.now();
        const current = get().pet;
        const base = defaultPetState(now);

        set({
          pet: {
            ...base,
            settings: { ...current.settings },
            visible: current.visible,
            overlayOpen: current.overlayOpen,
          },
          bubble: null,
          heartBurst: null,
        });
        await get().flush();
      },

      flush: async () => {
        if (saveTimer !== null) {
          clearTimeout(saveTimer);
          saveTimer = null;
        }

        const save: PetSaveV1 = petSaveFromState(get().pet, deps.now());
        set({ saveStatus: "saving" });

        writeChain = writeChain.then(async () => {
          try {
            await deps.storage.save(save);
            set({ saveStatus: "idle" });
          } catch {
            set({ saveStatus: "error" });
          }
        });

        await writeChain;
      },
    };
  });
}

export const usePetStore = createPetStore({
  storage: createTauriPetStorage(),
  haptics: createHaptics(),
  now: () => Date.now(),
});
