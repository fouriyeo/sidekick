import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
import { clearPetReaction, firePetReaction } from "./pet-reaction";
import { usePetStore } from "./pet-store";

/**
 * 把「非宠物」的状态源接到瞬态反应总线（D133）。
 *
 * 全部边沿触发：只在状态真的翻转时放动作，首帧、重连补发的批量快照都不会误触发。
 * 用引用计数保证 StrictMode 双挂载 / 多次进入宠物页时只有一套订阅。
 */
type Unsubscribe = () => void;

const SURPRISE_COOLDOWN_MS = 5_000;
/** 一次补发里新增超过这个数量，当成「重连后的整表快照」，不当成逐个新会话。 */
const SURPRISE_MAX_BATCH = 2;

let activeInstalls = 0;
let teardown: (() => void) | null = null;

function subscribeAll(): () => void {
  const unsubscribers: Unsubscribe[] = [];
  let lastSurpriseAt = 0;

  unsubscribers.push(
    useMicStore.subscribe((state, prev) => {
      if (state.phase === prev.phase) return;
      // 上屏 / 失败是边沿事件；arming/listening/processing 由 pet-action 当保持态读。
      if (state.phase === "delivered") firePetReaction("affirm", 1600);
      else if (state.phase === "error") firePetReaction("failure", 2000);
    }),
  );

  // 首连不算「重连」：只有掉过线再连回来才点头。
  let everOnline = useConnectionStore.getState().status === "connected";

  unsubscribers.push(
    useConnectionStore.subscribe((state, prev) => {
      if (state.status === prev.status) return;
      const wasLive = prev.status === "connected" || prev.status === "connecting";
      if (state.status === "connected") {
        if (everOnline) firePetReaction("affirm", 1600);
        everOnline = true;
        return;
      }
      if (wasLive && (state.status === "disconnected" || state.status === "error")) {
        firePetReaction("failure", 2000);
      }
    }),
  );

  unsubscribers.push(
    useSessionStore.subscribe((state, prev) => {
      if (state.raw === prev.raw) return;
      // 第一份快照只做基线：整表都是「新」的，不是新会话。
      if (!prev.hasBaseline) return;
      const known = new Set(prev.raw.map((session) => session.id));
      const added = state.raw.filter((session) => !known.has(session.id)).length;
      if (added === 0 || added > SURPRISE_MAX_BATCH) return;

      const now = Date.now();
      if (now - lastSurpriseAt < SURPRISE_COOLDOWN_MS) return;
      lastSurpriseAt = now;
      firePetReaction("surprise", 1200, now);
    }),
  );

  unsubscribers.push(
    usePetStore.subscribe((state, prev) => {
      const bubble = state.bubble;
      if (!bubble || bubble.id === prev.bubble?.id) return;
      if (bubble.copyId === "returning" || bubble.copyId === "returning_long") {
        firePetReaction("love", 2400);
      }
    }),
  );

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

/** 宠物页挂载时调用；返回退订函数。 */
export function installPetReactions(): () => void {
  if (activeInstalls === 0) {
    clearPetReaction();
    teardown = subscribeAll();
  }
  activeInstalls += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeInstalls = Math.max(0, activeInstalls - 1);
    if (activeInstalls === 0) {
      teardown?.();
      teardown = null;
      clearPetReaction();
    }
  };
}
