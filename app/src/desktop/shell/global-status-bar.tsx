import {
  deviceCountFromClients,
  useDesktopClientsStore,
} from "@/desktop/lib/desktop-clients-store";
import { useDesktopStatusStore } from "@/desktop/lib/desktop-status-store";
import type { DesktopConnection } from "@/desktop/use-desktop-connection";
import type { StatusState } from "@/protocol/messages";
import { sessionTitle, visibleSessions } from "@/shared/lib/sessions";
import { AI_STATE_LABEL, AI_STATE_LEVEL, AI_STATE_TONE } from "@/shared/lib/status";
import { StatusChip } from "@/shared/ui/status-chip";

type GlobalStatusBarProps = {
  connection: DesktopConnection;
  onOpenConnection: () => void;
  onOpenSessions: () => void;
};

type ServiceSegment = {
  label: string;
  level: 1 | 2 | 3;
  tone: "muted" | "signal" | "danger";
};

function serviceSegment(connection: DesktopConnection): ServiceSegment {
  switch (connection.status) {
    case "connected":
      return { label: "服务正常", level: 3, tone: "signal" };
    case "loading":
    case "connecting":
      return { label: "服务连接中…", level: 2, tone: "muted" };
    case "disconnected":
      return { label: "服务重连中", level: 2, tone: "muted" };
    default:
      return { label: "服务没起来", level: 1, tone: "danger" };
  }
}

/**
 * 顶部全局状态条（48，跨页一致）：服务 / 手机 / AI 三段固定位置、都可点。
 *
 * - 服务：本机 WS 服务状态（端口与发现端口只在「系统 › 连接」里出现）；
 * - 手机：由服务端广播的客户端数推导。文案统一「台设备」并注明口径：
 *   数字 = 客户端总数 − 1（桌面窗口），含网页预览，手机台数为近似值；
 * - AI：`status` 聚合态 + 当前会话标题（等你决定 > 工作中）。
 */
export function GlobalStatusBar({
  connection,
  onOpenConnection,
  onOpenSessions,
}: GlobalStatusBarProps) {
  const status = useDesktopStatusStore((state) => state.status);
  const sessionList = useDesktopStatusStore((state) => state.sessionList);
  const clients = useDesktopClientsStore((state) => state.clients);

  const service = serviceSegment(connection);
  const devices = deviceCountFromClients(clients);
  const phoneConnected = devices > 0;
  const rows = visibleSessions(sessionList, {});
  const current =
    rows.find((row) => row.display === "asking") ??
    rows.find((row) => row.display === "working") ??
    null;
  const aiState: StatusState = status?.state ?? "idle";
  const aiDetail = current
    ? `· ${sessionTitle(current)}`
    : status
      ? "· 没有进行中的会话"
      : "· 还没开启联动";

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 overflow-hidden border-b border-border bg-card px-3.5">
      <div className="flex shrink-0 items-center gap-2 pr-2.5">
        <img src="/logo-icon.svg" alt="" className="size-[18px]" />
        <strong className="text-[12.5px] font-semibold tracking-[0.01em]">小跟班</strong>
        <span className="font-mono text-[10px] text-muted-foreground">v0.1</span>
      </div>

      <span aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />

      <StatusChip
        label={service.label}
        level={service.level}
        tone={service.tone}
        detail={service.tone === "signal" ? "· 局域网直连" : undefined}
        ariaLabel={`服务状态：${service.label}`}
        title="本机 WebSocket 服务；端口与发现端口在「系统 › 连接」里查看"
        className="h-8 rounded-full border-0 bg-transparent"
        onClick={onOpenConnection}
      />

      <StatusChip
        label={phoneConnected ? "已连接" : "未连接"}
        level={phoneConnected ? 3 : 1}
        tone={phoneConnected ? "signal" : "muted"}
        detail={`· ${devices} 台设备`}
        ariaLabel={`手机连接：${phoneConnected ? "已连接" : "未连接"}，约 ${devices} 台设备`}
        title="在线设备数 = 服务端客户端总数 − 1（含本机窗口与网页预览），手机台数为近似值"
        className="h-8 rounded-full border-0 bg-transparent"
        onClick={onOpenConnection}
      />

      <StatusChip
        label={AI_STATE_LABEL[aiState]}
        level={AI_STATE_LEVEL[aiState]}
        tone={AI_STATE_TONE[aiState]}
        detail={aiDetail}
        ariaLabel={`AI 状态：${AI_STATE_LABEL[aiState]}`}
        title="AI 状态来自 DeepSeek Harness 联动；点开看会话详情"
        className="h-8 min-w-0 rounded-full border-0 bg-transparent"
        onClick={onOpenSessions}
      />

      <span className="ml-auto hidden shrink-0 font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase lg:inline">
        局域网直连 · 数据只在本机
      </span>
    </header>
  );
}
