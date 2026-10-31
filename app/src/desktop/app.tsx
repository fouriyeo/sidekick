import { ChatPanel } from "./features/chat/components/chat-panel";
import { ConnectionPanel } from "./features/connect/components/connection-panel";
import { useDesktopConnection } from "./use-desktop-connection";

export function DesktopApp() {
  const { status, info, error, sendText, retry } = useDesktopConnection();

  return (
    <main className="grid h-dvh min-h-0 grid-cols-[minmax(300px,360px)_minmax(0,1fr)] gap-3.5 overflow-hidden bg-background p-3.5 text-foreground">
      <ConnectionPanel info={info} status={status} error={error} onRetry={retry} />
      <ChatPanel onSend={sendText} />
    </main>
  );
}
