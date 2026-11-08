/**
 * 手机备忘录录音条的 C 双模手势（D124）。
 *
 * 没有「模式开关」：
 * - 按住 ≥400ms 松手 = 保存；
 * - 轻点 ≤400ms 松手 = 锁定，继续录，再点一下结束；
 * - 按住上滑 ≥80dp = 取消区，松手取消；回退到 <32dp 退出取消区。
 *
 * 纯函数只负责“松手该怎么处理”，pointer/计时/录音由 `memo-record-bar` 编排，
 * 这样阈值与去重规则可以单测。
 */

/** 轻点 / 按住的分界。 */
export const TAP_MAX_MS = 400;
/** 明确停止时，短于此且没有声音的录音丢弃。 */
export const SHORT_RECORDING_MS = 600;
/** 峰值低于此值视为没听到声音（0–1）。 */
export const SILENCE_PEAK = 0.03;
/** 上滑多少进入取消区。 */
export const CANCEL_ENTER_PX = 80;
/** 回退到多少退出取消区（滞回，避免抖）。 */
export const CANCEL_EXIT_PX = 32;
/** pointerup 后合成 click 的去重窗口。 */
export const CLICK_DEDUPE_MS = 600;

export type ReleaseIntent = "lock" | "save" | "cancel";

/** 松手时该做什么。锁定态下再按一次 = 结束保存。 */
export function releaseIntent(input: {
  heldMs: number;
  cancelArmed: boolean;
  locked: boolean;
}): ReleaseIntent {
  if (input.cancelArmed) return "cancel";
  if (input.locked) return "save";
  return input.heldMs < TAP_MAX_MS ? "lock" : "save";
}

/** 是否忽略 pointerup 后浏览器补发的 click（TalkBack 没有 pointer，必须放行）。 */
export function shouldIgnoreClick(lastPointerAt: number, now: number): boolean {
  return now - lastPointerAt < CLICK_DEDUPE_MS;
}

/** 明确停止时：太短且没声音 → 丢弃，避免存下 0.2 秒的误触。 */
export function shouldDiscardShort(elapsedMs: number, peak: number): boolean {
  return elapsedMs < SHORT_RECORDING_MS && peak < SILENCE_PEAK;
}

/**
 * 取消区滞回：`dy` 为负表示手指上移。
 * 进入需要 ≥80，退出要回到 <32；中间抖动保持原状态。
 */
export function cancelArmedAfter(dy: number, armed: boolean): boolean {
  const movedUp = -dy;
  if (armed) return movedUp >= CANCEL_EXIT_PX;
  return movedUp >= CANCEL_ENTER_PX;
}
