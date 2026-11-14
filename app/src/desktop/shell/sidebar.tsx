import { cn } from "cn";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useCloudAsrStore } from "@/desktop/features/models/cloud-asr-store";
import { useAccessibilityStore } from "@/desktop/features/settings/accessibility-store";
import {
  DESKTOP_NAV,
  DESKTOP_PRIMARY_NAV,
  type DesktopView,
  type SettingsSection,
} from "@/desktop/lib/desktop-nav";
import { useDesktopStatusStore } from "@/desktop/lib/desktop-status-store";
import { SPRING_SLIDE } from "@/desktop/lib/motion";
import type { DesktopConnection } from "@/desktop/use-desktop-connection";
import { visibleSessions } from "@/shared/lib/sessions";
import { SignalDot, type SignalStatus } from "@/shared/ui/signal-dot";

type SidebarProps = {
  view: DesktopView;
  section: SettingsSection;
  onSelect: (view: DesktopView) => void;
  onOpenSettings: (section: SettingsSection) => void;
  connection: DesktopConnection;
};

/**
 * 侧栏（224）：Liquid Glass 导航层 —— 顶部 38 留给 mac 交通灯，
 * 下面 logo + 5 个一级入口（剪贴板/备忘录/用量/语音/英语角，白色滑块用 spring
 * 在入口之间 morph），底部设置 + **只在需要出手时出现**的状态行。
 *
 * D143：状态区「沉默即正常」。服务端口、手机台数、AI 正在工作都不是用户要读的
 * 信息（看一眼不会改变动作），所以常态整块不显示；只有两种真正需要出手的情况
 * 才出现一行：服务没起来（要排查）、AI 停下等你决定（要去 DSH）。
 * 配置没完成的（语音未配置、自动输入未授权）用导航项上的琥珀点，不占正文。
 */
export function Sidebar({ view, section, onSelect, onOpenSettings, connection }: SidebarProps) {
  const sessionList = useDesktopStatusStore((state) => state.sessionList);
  const cloudStatus = useCloudAsrStore((state) => state.status);
  const autoInput = useAccessibilityStore((state) => state.info);

  const asking = visibleSessions(sessionList, {}).find((row) => row.display === "asking") ?? null;
  const serviceDown = connection.status === "error";
  const autoInputOff = autoInput !== null && !autoInput.trusted;
  const showStatus = serviceDown || asking !== null;

  return (
    <aside className="dsl-sidebar relative flex w-[224px] shrink-0 flex-col">
      <div data-tauri-drag-region="deep" className="h-[38px] shrink-0" />

      <div className="flex items-center gap-2 px-4 pb-4">
        <img src="/logo-icon.svg" alt="" className="size-[22px]" />
        <span className="text-[15px] leading-none font-semibold tracking-[-0.015em]">Sidekick</span>
      </div>

      <nav aria-label="主导航" className="flex flex-col gap-1 px-2.5">
        {DESKTOP_PRIMARY_NAV.map((item) => (
          <NavItem
            key={item.id}
            label={item.label}
            shortcut={item.shortcut}
            icon={<item.icon aria-hidden="true" className="size-[17px]" strokeWidth={2.1} />}
            active={view === item.id}
            badge={item.id === "voice" && cloudStatus !== null && !cloudStatus.configured}
            badgeHint="未配置"
            onClick={() => onSelect(item.id)}
          />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 px-2.5 pb-3">
        <NavItem
          label="设置"
          shortcut={DESKTOP_NAV.find((nav) => nav.id === "settings")?.shortcut}
          icon={<SettingsIcon />}
          active={view === "settings"}
          badge={autoInputOff}
          badgeHint="自动输入未开启"
          onClick={() => onOpenSettings("root")}
        />

        {showStatus && (
          <div className="mt-2 flex flex-col gap-0.5 border-t border-border/70 pt-2">
            {serviceDown && (
              <StatusLine
                level="error"
                label="服务"
                value="未启动"
                onClick={() => onOpenSettings("connection")}
              />
            )}
            {asking && (
              <StatusLine
                level="waiting"
                label="AI"
                value="等你决定"
                onClick={() => connection.requestFocus(asking.id)}
              />
            )}
          </div>
        )}
      </div>
      <span className="sr-only">当前页：{view === "settings" ? `设置/${section}` : view}</span>
    </aside>
  );
}

/** 设置项图标与一级导航共用同一个 lucide 组件，避免两处硬编码。 */
function SettingsIcon() {
  const Icon = DESKTOP_NAV.find((item) => item.id === "settings")?.icon;
  return Icon ? <Icon aria-hidden="true" className="size-[17px]" strokeWidth={2.1} /> : null;
}

function NavItem({
  label,
  shortcut,
  icon,
  active,
  badge = false,
  badgeHint,
  onClick,
}: {
  label: string;
  shortcut?: string;
  icon: ReactNode;
  active: boolean;
  /** 配置未完成时的 6px 琥珀点（语音未配置 / 自动输入未开启）。 */
  badge?: boolean;
  /** 琥珀点的补充说明，只进 title 与读屏，不占版面。 */
  badgeHint?: string;
  onClick: () => void;
}) {
  const reduced = useReducedMotion();

  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      title={`${shortcut ? `${label} · ${shortcut}` : label}${badge && badgeHint ? ` · ${badgeHint}` : ""}`}
      onClick={onClick}
      data-active={active ? "true" : "false"}
      className="dsl-nav-item"
    >
      {active && (
        <motion.span
          layoutId="dsl-nav-active"
          className="dsl-nav-thumb"
          transition={reduced ? { duration: 0 } : SPRING_SLIDE}
        />
      )}
      <span className={cn("relative z-10 shrink-0", active ? "text-signal" : "opacity-90")}>
        {icon}
      </span>
      <span className="relative z-10 truncate">{label}</span>
      {badge && (
        <span
          aria-hidden="true"
          className="relative z-10 ml-auto size-[6px] shrink-0 rounded-full bg-[var(--ios-orange)]"
        />
      )}
    </button>
  );
}

function StatusLine({
  level,
  label,
  value,
  onClick,
}: {
  level: SignalStatus;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}：${value}`}
      title={`${label}：${value}`}
      className="flex h-[26px] w-full items-center gap-2 rounded-[8px] px-2.5 text-[12px] leading-none text-muted-foreground transition-colors outline-none hover:bg-[var(--sidebar-item-hover)] hover:text-foreground"
    >
      <SignalDot status={level} pulse={false} className="size-[7px]" />
      <span className="shrink-0">{label}</span>
      <span className="ml-auto truncate text-foreground/75 tabular-nums">{value}</span>
    </button>
  );
}
