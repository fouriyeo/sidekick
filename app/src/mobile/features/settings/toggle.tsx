import { cn } from "cn";

type ToggleProps = {
  id?: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/**
 * 手机设置页开关。
 *
 * 不用 shadcn Switch：它用 Tailwind 的 `translate-x-*`（编译成 CSS `translate` 属性），
 * 安卓 WebView 103 不支持，真机上滑块不会动。这里用 `left` 定位，44dp 触控热区。
 */
export function Toggle({ id, label, checked, onCheckedChange }: ToggleProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      onClick={() => onCheckedChange(!checked)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative block h-6 w-11 rounded-full border transition-colors",
          checked ? "border-signal bg-primary" : "border-input bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] size-4 rounded-full transition-colors",
            checked ? "left-[24px] bg-primary-foreground" : "left-[2px] bg-foreground",
          )}
        />
      </span>
    </button>
  );
}
