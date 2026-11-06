import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** 汇总数字换区间时的过渡：iOS 的松弛落定，400ms 内跑完，不做循环动画。 */
const NUMBER_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const NUMBER_DURATION = 0.4;

/**
 * 数值过渡（只动数字本身，不动布局）。
 *
 * - 首帧直接显示最终值：不在进入页面时从 0 数上去，避免和 `dsl-page-in` 打架，
 *   也让首屏读数是可断言的最终值；
 * - 之后目标值变化（切区间 / 刷新重读）才用 Motion 补间；
 * - `useReducedMotion()` 时直接跳变；
 * - 补间中途换目标从「当前显示值」续上，不跳回上一个目标。
 */
export function useAnimatedNumber(target: number): number {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      displayRef.current = target;
      setDisplay(target);
      return;
    }
    if (reduced || !Number.isFinite(target) || displayRef.current === target) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    const from = displayRef.current;
    const controls = animate(from, target, {
      duration: NUMBER_DURATION,
      ease: NUMBER_EASE,
      onUpdate: (value) => {
        displayRef.current = value;
        setDisplay(value);
      },
    });
    return () => controls.stop();
  }, [target, reduced]);

  return display;
}

/**
 * 会过渡的数字文本：`value` 为 null / 非有限数时显示 `fallback`（如「—」），
 * 其余情况用 `format` 把补间中的数值格式化成最终文案。
 */
export function AnimatedNumber({
  value,
  format,
  fallback = "—",
  className,
}: {
  value: number | null | undefined;
  format: (value: number) => string;
  fallback?: string;
  className?: string;
}) {
  const numeric = value != null && Number.isFinite(value) ? value : null;
  const animated = useAnimatedNumber(numeric ?? 0);
  return <span className={className}>{numeric == null ? fallback : format(animated)}</span>;
}
