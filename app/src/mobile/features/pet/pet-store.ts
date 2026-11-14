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
import { defaultPetState, parsePetSave, petSaveFromState } from "./persistence";
import { createPetSounds, type PetSoundGates } from "./sound";
import { reducePet } from "./state-machine";
import { createTauriPetStorage } from "./tauri-pet-storage";
import type {
  Bubble,
  CopyId,
  PetEffect,
  PetEvent,
  PetSaveV1,
  PetSettings,
  PetState,
  PetStorage,
  PetStoreState,
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
const SAVE_DEBOUNCE_MS = 500;
/** 开工音限流：任一会话新开工，最多每 5 秒响一次（多会话并行时避免连响）。 */
const WORK_START_MIN_GAP_MS = 5_000;
/** 录音中漏掉的完成音：麦克风释放后再等 3 秒补一声（只补最近一次）。 */
const DEFERRED_COMPLETE_DELAY_MS = 3_000;

function defaultAppVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

/** 手机端排查用：日志走 WebView console → adb logcat 的 Tauri/Console。 */
function log(message: string): void {
  console.info(`[pet-ai] ${message}`);
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
  let completedTimer: ReturnType<typeof setTimeout> | null = null;
  let captionTimer: ReturnType<typeof setTimeout> | null = null;
  let writeChain: Promise<void> = Promise.resolve();
  let lastBubbleAt = 0;
  let bubbleId = 0;
  let captionId = 0;
  /** 上一份快照里处于 working 的会话 id；null = 还没收到过带列表的快照。 */
  let workingSessionIds: Set<string> | null = null;
  /** 开工音上次播放时间；跨会话共享的 5 秒限流。 */
  let lastWorkStartAt = 0;
  /** 录音期间收到的完成音；等麦克风释放后补播一次，多次完成只补一声。 */
  let deferredCompletePending = false;
  let deferredCompleteTimer: ReturnType<typeof setTimeout> | null = null;

  return create<PetStoreState>((set, get) => {
    function scheduleSave() {
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        void get().flush();
      }, SAVE_DEBOUNCE_MS);
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

    function clearDeferredCompleteTimer() {
      if (deferredCompleteTimer === null) return;
      clearTimeout(deferredCompleteTimer);
      deferredCompleteTimer = null;
    }

    function clearDeferredComplete(reason: string) {
      const hadPending = deferredCompletePending || deferredCompleteTimer !== null;
      clearDeferredCompleteTimer();
      deferredCompletePending = false;
      if (hadPending) log(`defer canceled: ${reason}`);
    }

    /**
     * 录音中收到完成：先静音，等麦克风释放 3 秒后补一声。
     * 补音期间又开录时只暂停计时，pending 保留；下次释放再重新等 3 秒。
     */
    function scheduleDeferredComplete() {
      clearDeferredCompleteTimer();
      deferredCompletePending = true;
      log("defer armed: 3000ms after mic release");
      deferredCompleteTimer = setTimeout(() => {
        deferredCompleteTimer = null;
        if (!deferredCompletePending) return;
        if (get().micListening) {
          log("defer skipped: mic started again");
          return;
        }
        deferredCompletePending = false;
        log("defer fire: play complete");
        deps.sounds?.playComplete();
      }, DEFERRED_COMPLETE_DELAY_MS);
    }

    function appVisible(): boolean {
      return deps.isAppVisible ? deps.isAppVisible() : defaultAppVisible();
    }

    function showBubble(copyId: CopyId, durationMs = BUBBLE_DURATION_MS) {
      const now = deps.now();
      const bypass =
        copyId === "corrupted" || copyId === "returning" || copyId === "returning_long";

      if (!bypass && lastBubbleAt > 0 && now - lastBubbleAt < BUBBLE_COOLDOWN_MS) return;

      lastBubbleAt = now;
      bubbleId += 1;
      if (bubbleTimer !== null) clearTimeout(bubbleTimer);

      const bubble: Bubble = {
        id: bubbleId,
        copyId,
        text: renderCopy(copyId),
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
            text: renderCopy(copyId),
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

        // completed 结束回到静态/工作时不补新文案（工作文案只在真正开工时出现）。
        clearCaptionTimer();
        set({ aiCaption: null });
      }, delay);
    }

    /**
     * 开工音：任一会话新进入 working 都算，但 5 秒内最多响一次。
     * 仍然复用 sounds.playWork 的四道门（声音开关/前台/宠物页/录音）与解锁态；
     * 门没开时 playWork 返回 false，不占用限流窗口。
     */
    function playWorkStart(now: number) {
      if (lastWorkStartAt > 0 && now - lastWorkStartAt < WORK_START_MIN_GAP_MS) return;
      if (deps.sounds?.playWork()) lastWorkStartAt = now;
    }

    function applyAiSignals(
      transition: { from: AiState; to: AiState },
      visible: boolean,
      mic: boolean,
      now: number,
    ) {
      log(
        `signal ${transition.from}->${transition.to} visible=${visible} petPage=${get().pet.visible && !get().pet.overlayOpen} mic=${mic} sound=${get().pet.settings.sound ? "on" : "off"}`,
      );
      if (transition.to === "asking") {
        // 提问优先于完成：取消还没补的完成音，避免几声叠在一起。
        log("asking priority: cancel deferred complete");
        clearDeferredComplete("asking");
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
        if (mic) {
          // 录音中保持静音；只记下这次完成，等麦克风释放 3 秒后补一声。
          log("completed muted by mic: defer 3s after release");
          clearDeferredCompleteTimer();
          deferredCompletePending = true;
        } else {
          log("completed: play now");
          clearDeferredComplete("new completed");
          deps.sounds?.playComplete();
        }
        return;
      }

      if (transition.to === "working") {
        if (transition.from === "completed" || transition.from === "asking") {
          // 从 completed/等待直接切到工作时不补开工音，避免连续三声响。
          deps.sounds?.stopAsking();
          return;
        }
        playWorkStart(now);
        return;
      }

      // 回到静态：不再提醒。
      deps.sounds?.stopAsking();
    }

    function processEffects(effects: PetEffect[], pet: PetState) {
      const bubbleEffect = effects.find((effect) => effect.type === "bubble");
      if (bubbleEffect) {
        showBubble(bubbleEffect.copyId, bubbleEffect.durationMs);
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

        if (event.type === "OVERLAY" && event.open) {
          // 离开宠物页后不再补音；回宠物页也不重播。
          log("overlay opened: cancel deferred complete");
          clearDeferredComplete("leave pet page");
        }

        if (event.type === "VISIBILITY" && !event.visible) {
          // 切后台时立刻结束 completed 姿态：回前台/重连不重播完成动画。
          clearCompletedTimer();
          clearCaptionTimer();
          log("visibility hidden: cancel deferred complete");
          clearDeferredComplete("background");
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

      applyAiStatus: (message: StatusMessage, options = {}) => {
        const now = options.now ?? deps.now();
        const micListening = options.micListening ?? get().micListening;
        const visible = options.visible ?? appVisible();
        const listCount = Array.isArray(message.sessionList) ? message.sessionList.length : -1;
        log(
          `recv state=${message.state} sessions=${message.sessions} resume=${message.resume ?? "-"} remainingMs=${message.remainingMs ?? "-"} list=${listCount} tsLag=${now - message.ts}ms mic=${micListening} visible=${visible}`,
        );

        // 开工音按会话判定：任一会话从非 working 变为 working 就触发一次，
        // 由 playWorkStart 做 5 秒限流。首份带列表的快照只建基线，不重复补响。
        const sessionList = message.sessionList;
        if (Array.isArray(sessionList)) {
          const working = new Set<string>();
          for (const session of sessionList) {
            if (session.state === "working") working.add(session.id);
          }
          if (workingSessionIds !== null) {
            let started = false;
            for (const id of working) {
              if (!workingSessionIds.has(id)) {
                started = true;
                break;
              }
            }
            if (started) playWorkStart(now);
          }
          workingSessionIds = working;
        }

        if (options.micListening !== undefined && options.micListening !== get().micListening) {
          set({ micListening: options.micListening });
        }

        const { status, transition, stale } = reduceAiStatus(get().ai, message, { now });
        if (stale) {
          log(`stale: ${message.state} tsLag=${now - message.ts}ms`);
          return;
        }
        if (transition) {
          log(
            `transition ${transition.from}->${transition.to} completedMs=${transition.completedMs ?? "-"}`,
          );
        }

        set({ ai: status });
        scheduleCompletedTimer(status);

        if (!transition) return;

        updateAiCaption(status, now, true);
        applyAiSignals(transition, visible, micListening, now);
      },

      setMicListening: (listening: boolean) => {
        if (get().micListening === listening) return;
        set({ micListening: listening });
        log(`micListening=${listening} pending=${deferredCompletePending}`);
        if (listening) {
          // 录音时不播放提醒，并把排队中的第二次提醒停掉；补音计时也暂停。
          deps.sounds?.stopAsking();
          clearDeferredCompleteTimer();
          return;
        }
        // 麦克风释放：录音中漏掉的完成音在 3 秒后补一声。
        if (deferredCompletePending) {
          log("mic released: re-arm deferred complete");
          scheduleDeferredComplete();
        }
      },

      unlockSound: () => {
        deps.sounds?.unlock();
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
