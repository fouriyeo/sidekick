import { create } from "zustand";
import type { StatusMessage } from "@/protocol/messages";
import {
  AI_WORK_CAPTION_MS,
  type AiState,
  type AiStatus,
  aiCaptionCopyId,
  createIdleAiStatus,
  finishCompleted,
  applyAiStatus as reduceAiStatus,
  settleAiStatus,
} from "./ai-status";
import { renderCopy } from "./copy";
import { createHaptics, type Haptics } from "./haptics";
import { defaultPetState, normalizeName, parsePetSave, petSaveFromState } from "./persistence";
import { createPetSounds, type PetSoundGates } from "./sound";
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
} from "./types";

/** AI 联动只用到声音播放器的一小部分；测试里可以注入假实现。 */
export type PetStoreSounds = {
  unlock: () => void;
  playWork: () => boolean;
  playComplete: () => boolean;
  startAsking: () => void;
  stopAsking: () => void;
};

type PetStoreDeps = {
  storage: PetStorage;
  haptics: Haptics;
  now: () => number;
  /** 可选的合成音效；缺省静音（测试/浏览器无 Web Audio 时）。 */
  sounds?: PetStoreSounds;
  /** App 是否在前台；缺省读 document.visibilityState。 */
  isAppVisible?: () => boolean;
};

const BUBBLE_COOLDOWN_MS = 30_000;
const BUBBLE_DURATION_MS = 4000;
const HEART_DURATION_MS = 1200;
const SAVE_DEBOUNCE_MS = 500;
const PETTING_COMPLETE_MS = 3000;

function defaultAppVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

/**
 * 音效门禁的唯一接线点：声音开关 + App 前台 + 宠物页可见 + 录音中。
 * 「宠物页可见」= App 可见且没打开聊天/设置（overlayOpen）。
 */
export function createPetSoundGates(
  getState: () => Pick<PetStoreState, "pet" | "micListening">,
  appVisible: () => boolean,
): PetSoundGates {
  return {
    enabled: () => getState().pet.settings.sound,
    visible: () => appVisible(),
    petVisible: () => {
      const pet = getState().pet;
      return pet.visible && !pet.overlayOpen;
    },
    micListening: () => getState().micListening,
  };
}

export function createPetStore(deps: PetStoreDeps) {
  let hydratePromise: Promise<void> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  let heartTimer: ReturnType<typeof setTimeout> | null = null;
  let pettingTimer: ReturnType<typeof setTimeout> | null = null;
  let completedTimer: ReturnType<typeof setTimeout> | null = null;
  let captionTimer: ReturnType<typeof setTimeout> | null = null;
  let writeChain: Promise<void> = Promise.resolve();
  let lastBubbleAt = 0;
  let bubbleId = 0;
  let heartId = 0;
  let captionId = 0;

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

    function clearCompletedTimer() {
      if (completedTimer === null) return;
      clearTimeout(completedTimer);
      completedTimer = null;
    }

    function clearCaptionTimer() {
      if (captionTimer === null) return;
      clearTimeout(captionTimer);
      captionTimer = null;
    }

    function appVisible(): boolean {
      return deps.isAppVisible ? deps.isAppVisible() : defaultAppVisible();
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

    /** AI 状态文案与闲聊气泡共用槽位；这里只维护「当前该显示哪条」。 */
    function updateAiCaption(status: AiStatus, now: number, force = false) {
      const copyId = aiCaptionCopyId(status, now);
      clearCaptionTimer();

      if (!copyId) {
        if (get().aiCaption !== null) set({ aiCaption: null });
        return;
      }

      const current = get().aiCaption;
      if (force || current === null || current.copyId !== copyId) {
        captionId += 1;
        set({
          aiCaption: {
            id: captionId,
            copyId,
            text: renderCopy(copyId, get().pet.name),
          },
        });
      }

      if (status.state === "working") {
        // 工作文案只陪 5 秒，之后只保留忙碌动作。
        const remaining = Math.max(0, AI_WORK_CAPTION_MS - (now - status.enteredAt));
        captionTimer = setTimeout(() => {
          captionTimer = null;
          set({ aiCaption: null });
        }, remaining);
      }
    }

    function scheduleCompletedTimer(status: AiStatus) {
      clearCompletedTimer();
      if (status.state !== "completed" || status.completedUntil === null) return;

      const delay = Math.max(0, status.completedUntil - deps.now());
      completedTimer = setTimeout(() => {
        completedTimer = null;
        const now = deps.now();
        const settled = settleAiStatus(get().ai, now);
        set({ ai: settled });

        if (settled.state === "completed") {
          // 计时器被提前触发（系统时间跳跃）时按剩余时间再排一次。
          scheduleCompletedTimer(settled);
          return;
        }

        if (settled.state === "asking") {
          updateAiCaption(settled, now, true);
          return;
        }

        // 庆祝结束回到静态/工作时不补新文案（工作文案只在真正开工时出现）。
        clearCaptionTimer();
        set({ aiCaption: null });
      }, delay);
    }

    function applyAiSignals(
      transition: { from: AiState; to: AiState },
      visible: boolean,
      mic: boolean,
    ) {
      if (transition.to === "asking") {
        if (get().pet.settings.haptics && visible && !mic) {
          // 进入「等你决定」：两次短促轻震，只响一次。
          deps.haptics.light();
          deps.haptics.light();
        }
        deps.sounds?.startAsking();
        return;
      }

      if (transition.to === "completed") {
        if (get().pet.settings.haptics && visible && !mic) {
          deps.haptics.success();
        }
        deps.sounds?.stopAsking();
        deps.sounds?.playComplete();
        return;
      }

      if (transition.to === "working") {
        if (transition.from === "completed" || transition.from === "asking") {
          // 从庆祝/等待直接切到工作时不补开工音，避免连续三声响。
          deps.sounds?.stopAsking();
          return;
        }
        deps.sounds?.playWork();
        return;
      }

      // 回到静态：不再提醒。
      deps.sounds?.stopAsking();
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
      ai: createIdleAiStatus(),
      aiCaption: null,
      micListening: false,

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
          // 切后台时立刻结束 completed 姿态：回前台/重连不重播庆祝。
          clearCompletedTimer();
          clearCaptionTimer();
          deps.sounds?.stopAsking();

          set({ ai: finishCompleted(get().ai, event.now), aiCaption: null });
          void get().flush();
        } else {
          scheduleSave();

          // asking 会一直保留：切后台再回来时恢复文案，并补一次提问音（SPEC §2.5）。
          const ai = get().ai;
          if (event.type === "VISIBILITY" && event.visible && ai.state === "asking") {
            updateAiCaption(ai, event.now, true);
            deps.sounds?.startAsking();
          }
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

      applyAiStatus: (message: StatusMessage, options = {}) => {
        const now = options.now ?? deps.now();
        const micListening = options.micListening ?? get().micListening;
        const visible = options.visible ?? appVisible();

        if (options.micListening !== undefined && options.micListening !== get().micListening) {
          set({ micListening: options.micListening });
        }

        const { status, transition, stale } = reduceAiStatus(get().ai, message, { now });
        if (stale) return;

        set({ ai: status });
        scheduleCompletedTimer(status);

        if (!transition) return;

        updateAiCaption(status, now, true);
        applyAiSignals(transition, visible, micListening);
      },

      setMicListening: (listening: boolean) => {
        if (get().micListening === listening) return;
        set({ micListening: listening });
        // 录音时不播放提醒，并把排队中的第二次提醒停掉。
        if (listening) deps.sounds?.stopAsking();
      },

      unlockSound: () => {
        deps.sounds?.unlock();
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
  isAppVisible: defaultAppVisible,
  sounds: createPetSounds(() =>
    createPetSoundGates(() => usePetStore.getState(), defaultAppVisible),
  ),
});
