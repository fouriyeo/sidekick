import { cn } from "cn";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { type ConnectionStatus, useConnectionStore } from "../connection-store";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  disconnected: "未连接",
  connecting: "连接中…",
  connected: "已连接",
  error: "未连接",
};

type ConnectionBarProps = {
  onError?: (message: string) => void;
};

export function ConnectionBar({ onError }: ConnectionBarProps) {
  const addr = useConnectionStore((state) => state.addr);
  const status = useConnectionStore((state) => state.status);
  const setAddr = useConnectionStore((state) => state.setAddr);
  const connect = useConnectionStore((state) => state.connect);
  const connected = status === "connected";

  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src="/logo-icon.svg"
            alt=""
            aria-hidden="true"
            className="size-7 shrink-0 rounded-lg"
          />
          <h1 className="text-xl font-semibold tracking-tight">Sidekick</h1>
          <span className="text-xs text-muted-foreground">手机端</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn("size-2 rounded-full", connected ? "bg-success" : "bg-warning")}
          />
          <span role="status" aria-live="polite">
            {STATUS_LABELS[status]}
          </span>
        </div>
      </header>

      <form
        className="mt-4 flex shrink-0 gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!addr.trim()) return;
          void connect(addr).then((message) => {
            if (message) onError?.(message);
          });
        }}
      >
        <Input
          aria-label="电脑地址"
          placeholder="电脑地址，如 192.168.1.5:8848"
          value={addr}
          onChange={(event) => setAddr(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-11 flex-1 text-[15px]"
        />
        <Button type="submit" size="lg" className="h-11 px-4">
          连接
        </Button>
      </form>
    </>
  );
}
