import { cn } from "cn";
import { Clipboard, MessageCircle } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ClipboardPanel } from "@/desktop/features/clipboard/components/clipboard-panel";
import { ConnectionPanel } from "@/desktop/features/connect/components/connection-panel";
import { MicStatusOverlay } from "@/desktop/features/mic-receiver/mic-status-overlay";
import { SettingsSheet } from "@/desktop/features/settings/components/settings-sheet";
import { ChatPanel } from "./features/chat/components/chat-panel";
import { useDesktopConnection } from "./use-desktop-connection";

type DesktopView = "chat" | "clipboard";

export function DesktopApp() {
  const { status, info, error, sendText, retry } = useDesktopConnection();
  const [view, setView] = useState<DesktopView>("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <main className="grid h-dvh min-h-0 grid-cols-[minmax(300px,360px)_minmax(0,1fr)] gap-3.5 overflow-hidden bg-background p-3.5 text-foreground">
      <ConnectionPanel
        info={info}
        status={status}
        error={error}
        onRetry={retry}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <section className="flex min-h-0 min-w-0 flex-col gap-3">
        <nav
          aria-label="桌面视图"
          className="flex shrink-0 items-center gap-1 self-start rounded-xl border border-border bg-card p-1"
        >
          <ViewTab
            active={view === "chat"}
            icon={<MessageCircle className="size-3.5" />}
            label="聊天"
            onClick={() => setView("chat")}
          />
          <ViewTab
            active={view === "clipboard"}
            icon={<Clipboard className="size-3.5" />}
            label="剪贴板"
            onClick={() => setView("clipboard")}
          />
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {view === "chat" ? <ChatPanel onSend={sendText} /> : <ClipboardPanel />}
        </div>
      </section>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
      <MicStatusOverlay />
    </main>
  );
}

function ViewTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
