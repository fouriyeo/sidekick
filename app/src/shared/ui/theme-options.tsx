import { setThemePreference, type ThemePreference, useTheme } from "@/shared/lib/theme";
import { cn } from "@/shared/lib/utils";

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

/**
 * 外观三选一。桌面设置 Sheet 与手机宠物设置共用；
 * 只改本机界面，不改变宠物舞台的深海底色。
 */
export function ThemeOptions({ className }: { className?: string }) {
  const { preference } = useTheme();

  return (
    <fieldset
      className={cn(
        "m-0 grid min-w-0 grid-cols-3 gap-1 rounded-xl border border-border bg-muted p-1",
        className,
      )}
    >
      <legend className="sr-only">外观</legend>
      {OPTIONS.map((option) => {
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => setThemePreference(option.value)}
            className={cn(
              "h-9 rounded-lg text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
