import { cn } from "cn";
import { List, MoreHorizontal, PawPrint } from "lucide-react";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { type MobileView, useUiStore } from "@/mobile/ui-store";

type TabView = Extract<MobileView, "pet" | "stream" | "settings">;

const TABS: ReadonlyArray<{ view: TabView; label: string; Icon: typeof PawPrint }> = [
  { view: "pet", label: "宠物", Icon: PawPrint },
  { view: "stream", label: "动态", Icon: List },
  { view: "settings", label: "更多", Icon: MoreHorizontal },
];

/** 录音中禁止切页：底部三档禁用，并提示为什么点不动。 */
export const TAB_BLOCKED_TEXT = "录音中 · 松手后再切页";

type MobileTabBarProps = {
  active: TabView;
  /** 宠物页用 pet 舞台令牌；其它页面用页面壳层令牌。 */
  tone?: "page" | "stage";
};

export function MobileTabBar({ active, tone = "page" }: MobileTabBarProps) {
  const setView = useUiStore((state) => state.setView);
  const recording = useMicStore(
    (state) =>
      state.phase === "arming" || state.phase === "listening" || state.phase === "processing",
  );
  const stage = tone === "stage";

  return (
    <div
      className={cn(
        "flex-none border-t pb-[env(safe-area-inset-bottom)]",
        stage ? "border-pet-border bg-pet-bg" : "border-border bg-card",
      )}
    >
      {recording && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "pt-1.5 text-center font-mono text-[10px] tracking-[0.06em]",
            stage ? "text-pet-muted" : "text-muted-foreground",
          )}
        >
          {TAB_BLOCKED_TEXT}
        </p>
      )}
      <nav aria-label="主导航" className="flex h-[62px] items-stretch gap-1 px-2 pt-1">
        {TABS.map(({ view, label, Icon }) => {
          const selected = view === active;
          return (
            <button
              key={view}
              type="button"
              aria-current={selected ? "page" : undefined}
              aria-label={label}
              disabled={recording}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-[10px] text-[10px] transition-colors",
                "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
                stage
                  ? "text-pet-muted hover:bg-pet-wash focus-visible:ring-pet-signal focus-visible:ring-offset-pet-bg"
                  : "text-muted-foreground hover:bg-wash focus-visible:ring-signal focus-visible:ring-offset-background",
                selected && (stage ? "text-pet-signal" : "text-signal"),
                selected &&
                  "before:absolute before:inset-x-[26%] before:top-0 before:h-0.5 before:rounded-full before:bg-current",
              )}
              onClick={() => setView(view)}
            >
              <Icon aria-hidden="true" className="size-5" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
