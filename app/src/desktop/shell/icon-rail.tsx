import { cn } from "cn";
import { DESKTOP_NAV, type DesktopNavItem, type DesktopView } from "@/desktop/lib/desktop-nav";

type IconRailProps = {
  view: DesktopView;
  onSelect: (view: DesktopView) => void;
};

/**
 * 极窄导航（72）：图标 19 + 文字 9.5；选中 = wash 底 + 1px signal 边 + 左侧 2px 指示条。
 * 一级只有 5 项，设置与上面 4 项用分隔线分开。
 */
export function IconRail({ view, onSelect }: IconRailProps) {
  const primary = DESKTOP_NAV.slice(0, 4);
  const settings = DESKTOP_NAV[4];

  return (
    <nav
      aria-label="主导航"
      className="flex w-[72px] shrink-0 flex-col items-center gap-[3px] border-r border-border bg-card px-2 pt-3 pb-2.5"
    >
      <div
        className="mb-3 grid size-[38px] shrink-0 place-items-center rounded-xl border border-border bg-popover text-signal"
        title="小跟班 Sidekick · 局域网直连"
      >
        <img src="/logo-icon.svg" alt="" className="size-[22px]" />
      </div>

      {primary.map((item) => (
        <RailItem
          key={item.id}
          item={item}
          active={view === item.id}
          onClick={() => onSelect(item.id)}
        />
      ))}

      <div className="mt-auto flex w-full flex-col items-center gap-2">
        <span aria-hidden="true" className="h-px w-7 bg-border" />
        <RailItem
          item={settings}
          active={view === settings.id}
          onClick={() => onSelect(settings.id)}
        />
        <span className="text-center font-mono text-[8.5px] leading-[1.35] tracking-[0.06em] text-muted-foreground/75">
          v0.1
          <br />
          深海声呐
        </span>
      </div>
    </nav>
  );
}

function RailItem({
  item,
  active,
  onClick,
}: {
  item: DesktopNavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      aria-label={`${item.label}（${item.shortcut}）`}
      aria-current={active ? "page" : undefined}
      title={`${item.label} · ${item.shortcut}`}
      onClick={onClick}
      className={cn(
        "relative flex w-[52px] shrink-0 flex-col items-center gap-[3px] rounded-[10px] pt-[7px] pb-[5px] text-muted-foreground transition-colors outline-none hover:bg-wash hover:text-foreground focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active && "bg-wash text-signal shadow-[inset_0_0_0_1px_var(--border)]",
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute top-[11px] bottom-[11px] -left-2 w-0.5 rounded-full bg-signal"
        />
      )}
      <Icon aria-hidden="true" className="size-[19px]" />
      <span className="text-[9.5px] leading-none tracking-[0.02em]">{item.label}</span>
    </button>
  );
}
