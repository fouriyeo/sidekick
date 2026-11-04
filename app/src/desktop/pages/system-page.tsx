import { useState } from "react";
import { useChatStore } from "@/desktop/features/chat/chat-store";
import { ChatSection } from "@/desktop/features/chat/components/chat-section";
import { ConnectionSection } from "@/desktop/features/connect/components/connection-section";
import { HookSection } from "@/desktop/features/hook/components/hook-section";
import {
  describeHookStatus,
  type HookStatusTone,
  useHookStore,
} from "@/desktop/features/hook/hook-store";
import { useCloudAsrStore } from "@/desktop/features/models/cloud-asr-store";
import { ModelsSection } from "@/desktop/features/models/models-section";
import { useUsageStore } from "@/desktop/features/models/usage-store";
import {
  deviceCountFromClients,
  useDesktopClientsStore,
} from "@/desktop/lib/desktop-clients-store";
import {
  type DesktopNav,
  SYSTEM_SECTION_TITLE,
  type SystemSection,
} from "@/desktop/lib/desktop-nav";
import { PageChip, type PageTone } from "@/desktop/shell/page-chips";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageShell } from "@/desktop/shell/page-shell";
import { SystemSegments } from "@/desktop/shell/system-segments";
import type { DesktopConnection } from "@/desktop/use-desktop-connection";
import { Button } from "@/shared/ui/button";

const HOOK_TONE: Record<HookStatusTone, PageTone> = {
  connected: "signal",
  waiting: "decide",
  error: "danger",
  muted: "muted",
};

const SECTION_DESCRIPTION: Record<SystemSection, string> = {
  connection:
    "手机和这台电脑在同一个 Wi-Fi 时自动发现最快；企业网广播可能被限制，用扫码或手动地址。",
  voice: "按住说话时，电脑把音频实时发给百炼；最终文本只输入一次，录音不保存。",
  hook: "把 DeepSeek Harness 的工作状态同步到手机；只发状态和会话标题，不发提示词、回复或工具内容。",
  chat: "电脑与手机之间的往来消息和系统事件；定位是通道调试，不是主工作区。",
};

type SystemPageProps = {
  connection: DesktopConnection;
  section: SystemSection;
  onSectionChange: (section: SystemSection) => void;
  nav: DesktopNav;
};

/**
 * 系统：连接 / 语音 / 联动 / 消息 4 段共用同一个外壳与分段条，
 * 配置与排障全部收在这里；每段只有内容不同，页头位置固定。
 */
export function SystemPage({ connection, section, onSectionChange, nav }: SystemPageProps) {
  const [qrOpen, setQrOpen] = useState(false);
  const clients = useDesktopClientsStore((state) => state.clients);
  const cloudStatus = useCloudAsrStore((state) => state.status);
  const hookStatus = useHookStore((state) => state.status);
  const devices = deviceCountFromClients(clients);
  const connected = connection.status === "connected";
  const hookSummary = describeHookStatus(hookStatus);
  const configured = cloudStatus?.configured ?? false;

  const chips =
    section === "connection" ? (
      <>
        <PageChip
          label={connected ? `服务在跑 · ${connection.info?.port ?? "…"}` : "服务没起来"}
          tone={connected ? "signal" : "danger"}
        />
        <PageChip
          label={devices > 0 ? `${devices} 台设备已连接` : "手机未连接"}
          tone={devices > 0 ? "signal" : "muted"}
          title="设备数 = 服务端客户端总数 − 1（含本机窗口与网页预览），手机台数为近似值"
        />
      </>
    ) : section === "voice" ? (
      <PageChip label={configured ? "已配置" : "未配置"} tone={configured ? "signal" : "muted"} />
    ) : section === "hook" ? (
      <PageChip label={hookSummary.label} tone={HOOK_TONE[hookSummary.tone]} />
    ) : (
      <PageChip label={connected ? "已连接" : "未连接"} tone={connected ? "signal" : "muted"} />
    );

  const actions =
    section === "connection" ? (
      <>
        <Button type="button" variant="outline" size="sm" onClick={connection.retry}>
          重新搜索
        </Button>
        <Button
          type="button"
          size="sm"
          aria-expanded={qrOpen}
          onClick={() => setQrOpen((open) => !open)}
        >
          {qrOpen ? "收起二维码" : "显示二维码"}
        </Button>
      </>
    ) : section === "voice" ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void useCloudAsrStore.getState().load();
          void useUsageStore.getState().load();
        }}
      >
        刷新
      </Button>
    ) : section === "hook" ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void useHookStore.getState().refresh();
        }}
      >
        刷新
      </Button>
    ) : (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => useChatStore.getState().clear()}
      >
        清空
      </Button>
    );

  return (
    <PageShell>
      <PageHeader
        title={SYSTEM_SECTION_TITLE[section]}
        description={SECTION_DESCRIPTION[section]}
        chips={chips}
        actions={actions}
      />
      <SystemSegments section={section} onChange={onSectionChange} />
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        {section === "connection" && (
          <ConnectionSection
            info={connection.info}
            status={connection.status}
            error={connection.error}
            onRetry={connection.retry}
            qrOpen={qrOpen}
            onToggleQr={() => setQrOpen((open) => !open)}
          />
        )}
        {section === "voice" && <ModelsSection />}
        {section === "hook" && <HookSection onOpenSessions={() => nav.go("sessions")} />}
        {section === "chat" && (
          <ChatSection
            onSend={connection.sendText}
            info={connection.info}
            status={connection.status}
            onOpenOverview={() => nav.go("overview")}
            onOpenConnection={() => onSectionChange("connection")}
          />
        )}
      </div>
    </PageShell>
  );
}
