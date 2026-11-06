import { cn } from "cn";
import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { SPRING_SLIDE } from "@/desktop/lib/motion";

type TabOption<T extends string> = { value: T; label: string };

/**
 * 用量页的下划线 tab（D97）：区间与分组共用。
 *
 * 语义用 `aria-pressed`（和 SegmentedControl 一致），不是 tablist；
 * 指示条在按钮内用 layoutId 在选项间 spring 滑动，少了测量 DOM 的脏活。
 */
export function UsageTabs<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<TabOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}) {
  const indicatorId = useId();
  const reduced = useReducedMotion();

  return (
    <fieldset aria-label={label} className={cn("dsl-usage-tabs", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className="dsl-usage-tab"
          >
            {active && (
              <motion.span
                layoutId={indicatorId}
                className="dsl-usage-tab-ind"
                transition={reduced ? { duration: 0 } : SPRING_SLIDE}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
