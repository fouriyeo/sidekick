import { cn } from "cn";
import { useState } from "react";
import { ClipboardPanel } from "@/desktop/features/clipboard/components/clipboard-panel";
import { ConnectionPanel } from "@/desktop/features/connect/components/connection-panel";
import { HookPanel } from "@/desktop/features/hook/components/hook-panel";
import { MicStatusOverlay } from "@/desktop/features/mic-receiver/mic-status-overlay";
import { ModelsPanel } from "@/desktop/features/models/models-panel";
import { SettingsSheet } from "@/desktop/features/settings/components/settings-sheet";
import { useMotionPause } from "@/shared/hooks/use-motion-pause";
import { ChatPanel } from "./features/chat/components/chat-panel";
import { useDesktopConnection } from "./use-desktop-connection";

type DesktopView = "chat" | "clipboard" | "hook" | "models";

const VIEWS: ReadonlyArray<{ id: DesktopView; label: string }> = [
  { id: "chat", label: "聊天" },
  { id: "clipboard", label: "剪贴板" },
  { id: "hook", label: "AI 联动" },
  { id: "models", label: "模型" },
];

/** 浏览器开发时可用 ?view=hook|clipboard|models 直接打开对应页；生产构建恒为聊天。 */
function initialView(): DesktopView {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (
      requested === "chat" ||
      requested === "clipboard" ||
      requested === "hook" ||
      requested === "models"
    ) {
      return requested;
    }
  }
  return "chat";
}

export function DesktopApp() {
  const { status, info, error, sendText, cancelMic, retry } = useDesktopConnection();
  const [view, setView] = useState<DesktopView>(initialView);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useMotionPause();

  return (
    <main className="grid h-dvh min-h-0 grid-cols-[320px_minmax(0,1fr)] gap-6 overflow-hidden bg-background p-8 text-foreground">
      <ConnectionPanel
        info={info}
        status={status}
        error={error}
        onRetry={retry}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <section className="flex min-h-0 min-w-0 flex-col gap-6">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <nav
            aria-label="桌面视图"
            className="flex shrink-0 items-center gap-0.5 rounded-xl border border-border bg-popover p-1"
          >
            {VIEWS.map((item) => (
              <ViewTab
                key={item.id}
                active={view === item.id}
                label={item.label}
                onClick={() => setView(item.id)}
              />
            ))}
          </nav>

          <div className="flex min-w-0 items-center gap-3 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {info && <span>WS · {info.port}</span>}
            {info?.discoveryPort != null && <span>UDP · {info.discoveryPort}</span>}
            <span className="hidden sm:inline">局域网直连</span>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {view === "chat" ? (
            <ChatPanel onSend={sendText} />
          ) : view === "clipboard" ? (
            <ClipboardPanel />
          ) : view === "hook" ? (
            <HookPanel />
          ) : (
            <ModelsPanel />
          )}
        </div>
      </section>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
      <MicStatusOverlay onCancel={cancelMic} />
    </main>
  );
}

function ViewTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center rounded-lg px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "bg-wash text-signal shadow-[inset_0_0_0_1px_var(--border)]"
          : "text-muted-foreground hover:bg-wash/60 hover:text-foreground",
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
