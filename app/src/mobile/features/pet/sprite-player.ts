import type { SpriteFrame, SpriteLoopMode } from "./sprite-manifest";

/** 容器可能不是正方形（`.petSlot` 被 max-width 卡成竖长），取较短边做格子并居中。 */
export function fitCellSize(width: number, height: number, fallback: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return fallback;
  }
  return Math.min(width, height);
}

export type FrameStep = {
  index: number;
  /** 当前帧内已播放的毫秒数。 */
  elapsedInFrame: number;
};

/**
 * 根据「进入当前状态后经过的毫秒数」算出应该播第几帧。
 *
 * - `loop`：无限循环，取模。
 * - `once`：播完停在最后一帧（done 的 1.5 秒定格由该帧的 duration 表达，
 *   至于状态何时结束由上层状态机决定）。
 */
export function advanceFrames(
  frames: readonly SpriteFrame[],
  elapsedMs: number,
  mode: SpriteLoopMode,
): FrameStep {
  if (frames.length === 0) return { index: 0, elapsedInFrame: 0 };

  const total = frames.reduce((sum, frame) => sum + frame.duration, 0);
  if (total <= 0) return { index: 0, elapsedInFrame: 0 };

  let t = elapsedMs;
  if (mode === "loop") {
    t = ((t % total) + total) % total;
  } else if (t >= total) {
    const last = frames[frames.length - 1];
    return { index: frames.length - 1, elapsedInFrame: last?.duration ?? 0 };
  } else if (t < 0) {
    t = 0;
  }

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (!frame) break;
    if (t < frame.duration) return { index, elapsedInFrame: t };
    t -= frame.duration;
  }

  const lastIndex = frames.length - 1;
  return { index: lastIndex, elapsedInFrame: frames[lastIndex]?.duration ?? 0 };
}
