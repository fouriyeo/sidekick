/**
 * 桌面端弹簧令牌（D89）。
 *
 * 阻尼比 ζ = c / (2·√(k·m))：滑块 ≈ 0.59、图标 ≈ 0.57，对应 10%–12% 过冲，
 * 松手后只回弹一次、约 0.27s 静定。调参时用 `motion.test.ts` 的公式守住区间。
 *
 * 页面转场不用这套弹簧：内容列整体回弹会晕，fade / push 仍按
 * `docs/engineering/desktop-ios-ui.md` §6 的曲线走。
 */
export const SPRING_SLIDE = { type: "spring", stiffness: 520, damping: 24, mass: 0.8 } as const;

/** 小图标 pop（复制成功的勾）：更轻，过冲约 12%。 */
export const SPRING_POP = { type: "spring", stiffness: 520, damping: 20, mass: 0.6 } as const;
