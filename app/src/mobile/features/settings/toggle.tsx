import { cn } from "cn";

type ToggleProps = {
  id?: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/**
 * 手机设置页开关（v16）：轨道 51×31、滑块 27、44dp 触控热区。
 *
 * 不用 shadcn Switch：它用 Tailwind 的 `translate-x-*`（编译成 CSS `translate` 属性），
 * 安卓 WebView 103 不支持，真机上滑块不会动。这里用 `left` 定位。
 */
export function Toggle({ id, label, checked, onCheckedChange }: ToggleProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="flex h-11 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      onClick={() => onCheckedChange(!checked)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative block h-[31px] w-[51px] shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] size-[27px] rounded-full bg-white transition-colors",
            checked ? "left-[22px]" : "left-[2px]",
          )}
        />
      </span>
    </button>
  );
}
