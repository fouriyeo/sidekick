import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef } from "react";

/** 露出的清除按钮宽度（px），与行内按钮的 `w-[72px]` 保持一致。 */
export const SWIPE_ACTION_WIDTH = 72;
/** 松手后判定展开所需的位移比例。 */
export const SWIPE_OPEN_RATIO = 0.4;
/** 快速左滑展开的速度阈值（px/ms，向左为负）。 */
export const SWIPE_FLICK_VELOCITY = -0.4;
/** 超过该位移才认为用户在滑动，而不是点按。 */
export const SWIPE_ENGAGE_PX = 8;
/** 快速滑动展开的最小位移，避免轻点误判。 */
const FLICK_MIN_PX = 12;
/** 拖过边界后的橡皮筋阻尼。 */
const RUBBER = 0.25;

/**
 * 松手后是否停在展开态。
 *
 * 只看「行内容最终位移」而不是原始 dx：行已经展开时，用户往左再拖一点
 * 仍应保持展开，往右拖过阈值才收起。
 */
export function resolveSwipeOpen({
  offset,
  velocity,
  actionWidth = SWIPE_ACTION_WIDTH,
}: {
  /** 松手时行内容的最终位移（-actionWidth..0）。 */
  offset: number;
  /** 水平速度（px/ms，向左为负）。 */
  velocity: number;
  actionWidth?: number;
}): boolean {
  if (offset >= 0) return false;
  const distance = -offset;
  const passed = distance >= actionWidth * SWIPE_OPEN_RATIO;
  const flick = velocity <= SWIPE_FLICK_VELOCITY && distance >= FLICK_MIN_PX;
  return passed || flick;
}

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  base: number;
  engaged: boolean;
  revealed: boolean;
  lastX: number;
  lastT: number;
  velocity: number;
};

type UseSwipeRowOptions = {
  /** 当前是否展开（受控，由 SessionFeed 保证一次只开一行）。 */
  open: boolean;
  actionWidth?: number;
  onOpenChange: (open: boolean) => void;
  /** 拖动越过展开阈值时回调一次（触感用）。 */
  onReveal?: () => void;
};

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * 行左滑手势：只做位移与开合判定，不碰 DOM 结构、不写业务状态。
 *
 * 关键约束（见 AGENTS.md「WebView 103 兼容」）：
 * - 位移只写 `transform: translate3d(...)`，不用 CSS `translate` / Tailwind `translate-x-*`；
 * - 拖动期间直接改 style，不走 setState，保证 5 行也不掉帧；
 * - 水平位移超过阈值后才 setPointerCapture，避免 Chrome 把 click 重定向到捕获元素。
 */
export function useSwipeRow({
  open,
  actionWidth = SWIPE_ACTION_WIDTH,
  onOpenChange,
  onReveal,
}: UseSwipeRowOptions) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const gestureRef = useRef<Gesture | null>(null);
  const suppressClickRef = useRef(false);

  const applyOffset = useCallback((offset: number, animate: boolean) => {
    const element = contentRef.current;
    if (!element) return;
    if (animate) {
      element.removeAttribute("data-dragging");
      // 先让 transition 恢复再改 transform；同一帧内改可能被当成无过渡。
      void element.offsetWidth;
    } else {
      element.setAttribute("data-dragging", "true");
    }
    element.style.transform = `translate3d(${offset}px, 0, 0)`;
  }, []);

  // 外部展开态变化（打开另一行 / 点外部 / 自动隐藏）时归位；拖动中不打断。
  useEffect(() => {
    if (gestureRef.current?.engaged) return;
    applyOffset(open ? -actionWidth : 0, true);
  }, [open, actionWidth, applyOffset]);

  const settle = useCallback(
    (nextOpen: boolean) => {
      applyOffset(nextOpen ? -actionWidth : 0, true);
      onOpenChange(nextOpen);
    },
    [actionWidth, applyOffset, onOpenChange],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (gestureRef.current) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      suppressClickRef.current = false;
      gestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        base: openRef.current ? -actionWidth : 0,
        engaged: false,
        revealed: openRef.current,
        lastX: event.clientX,
        lastT: nowMs(),
        velocity: 0,
      };
    },
    [actionWidth],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (!gesture.engaged) {
        if (Math.abs(dx) < SWIPE_ENGAGE_PX) return;
        // 纵向优先：明显在上下拖时交给页面，不抢手势。
        if (Math.abs(dx) <= Math.abs(dy)) return;
        gesture.engaged = true;
        suppressClickRef.current = true;
        try {
          contentRef.current?.setPointerCapture?.(event.pointerId);
        } catch {
          // 合成事件 / 指针已失效时 capture 会抛 NotFoundError；不影响后续逻辑。
        }
      }

      const time = nowMs();
      const dt = Math.max(1, time - gesture.lastT);
      gesture.velocity = (event.clientX - gesture.lastX) / dt;
      gesture.lastX = event.clientX;
      gesture.lastT = time;

      let next = gesture.base + dx;
      if (next > 0) next *= RUBBER;
      else if (next < -actionWidth) next = -actionWidth + (next + actionWidth) * RUBBER;

      const element = contentRef.current;
      if (element) {
        element.setAttribute("data-dragging", "true");
        element.style.transform = `translate3d(${next}px, 0, 0)`;
      }

      const revealAt = actionWidth * SWIPE_OPEN_RATIO;
      if (!gesture.revealed && -next >= revealAt) {
        gesture.revealed = true;
        onReveal?.();
      } else if (gesture.revealed && -next < revealAt) {
        gesture.revealed = false;
      }
    },
    [actionWidth, onReveal],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      try {
        contentRef.current?.releasePointerCapture?.(event.pointerId);
      } catch {
        // 没有 capture 时释放会抛 NotFoundError，忽略。
      }

      // 没到滑动阈值：如果是点按，交给行内容；行已展开时点内容先收起。
      if (!gesture.engaged) {
        if (openRef.current) {
          // 吞掉这次 click，避免 asking 行在收起的同时跳转。
          suppressClickRef.current = true;
          settle(false);
        }
        return;
      }

      const dx = event.clientX - gesture.startX;
      const offset = Math.max(-actionWidth, Math.min(0, gesture.base + dx));
      settle(resolveSwipeOpen({ offset, velocity: gesture.velocity, actionWidth }));
    },
    [actionWidth, settle],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      try {
        contentRef.current?.releasePointerCapture?.(event.pointerId);
      } catch {
        // 没有 capture 时释放会抛 NotFoundError，忽略。
      }
      settle(openRef.current);
    },
    [settle],
  );

  /** 手势产生的 click 只吞一次；没拖动时返回 false。 */
  const consumeClickSuppression = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  return {
    contentRef,
    consumeClickSuppression,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
