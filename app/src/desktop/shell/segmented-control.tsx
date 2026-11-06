import { cn } from "cn";
import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { SPRING_SLIDE } from "@/desktop/lib/motion";

type SegmentedOption<T extends string> = { value: T; label: string };

/**
 * iOS 26 分段控件：胶囊玻璃轨道 + 白色滑块，滑块在选项之间 spring morph。
 * 选中语义用 `aria-pressed`（不是 tab），颜色只做视觉强化。
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}) {
  const thumbId = useId();
  const reduced = useReducedMotion();

  return (
    <fieldset
      data-slot="segmented"
      className={cn("m-0 grid gap-0.5", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className="relative rounded-full px-3 text-nowrap outline-none"
          >
            {active && (
              <motion.span
                layoutId={thumbId}
                className="dsl-seg-thumb"
                transition={reduced ? { duration: 0 } : SPRING_SLIDE}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
