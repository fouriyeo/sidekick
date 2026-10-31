import { cn } from "cn";
import { useEffect, useState } from "react";
import type { DiscoveredServer } from "@/protocol/discovery";
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

type DeviceCardProps = {
  device: DiscoveredServer;
  status: ConnectionStatus;
  error: string | null;
  onConnect: () => void;
};

function DeviceCard({ device, status, error, onConnect }: DeviceCardProps) {
  const connected = status === "connected";
  const connecting = status === "connecting";

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{device.name}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{device.addr}</p>
        <p className={cn("text-xs", connected ? "text-success" : "text-muted-foreground")}>
          {connected ? "已连接，可以开始聊天" : connecting ? "正在连接…" : "准备连接"}
        </p>
        {status === "error" && error && (
          <p role="alert" className="mt-0.5 text-xs break-words text-destructive">
            {error}
          </p>
        )}
      </div>
      {!connected && !connecting && (
        <Button type="button" size="sm" className="shrink-0" onClick={onConnect}>
          连接
        </Button>
      )}
    </div>
  );
}

export function ConnectionBar({ onError }: ConnectionBarProps) {
  const addr = useConnectionStore((state) => state.addr);
  const status = useConnectionStore((state) => state.status);
  const error = useConnectionStore((state) => state.error);
  const setAddr = useConnectionStore((state) => state.setAddr);
  const connect = useConnectionStore((state) => state.connect);
  const devices = useConnectionStore((state) => state.devices);
  const discovering = useConnectionStore((state) => state.discovering);
  const hasDiscovered = useConnectionStore((state) => state.hasDiscovered);
  const discoverError = useConnectionStore((state) => state.discoverError);
  const discover = useConnectionStore((state) => state.discover);
  const [manualOpen, setManualOpen] = useState(false);
  const connected = status === "connected";
  const connectingAddr = status === "connecting" ? addr : null;

  // 打开聊天页时如果启动阶段还没搜过（或启动搜索尚未开始），补搜一次。
  useEffect(() => {
    if (hasDiscovered || discovering) return;
    void discover();
  }, [discover, discovering, hasDiscovered]);

  function handleConnect(rawAddr: string) {
    void connect(rawAddr).then((message) => {
      if (message) onError?.(message);
    });
  }

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

      <section className="mt-4 shrink-0" aria-label="自动发现电脑">
        {discovering ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full bg-warning motion-safe:animate-pulse"
            />
            <span role="status" aria-live="polite">
              正在找电脑…
            </span>
            <span className="min-w-0 truncate text-xs">请确保手机和电脑在同一个 Wi-Fi</span>
          </div>
        ) : devices.length === 1 ? (
          <DeviceCard
            device={devices[0]}
            status={status}
            error={error}
            onConnect={() => handleConnect(devices[0].addr)}
          />
        ) : devices.length > 1 ? (
          <div>
            <p className="text-xs text-muted-foreground">
              找到 {devices.length} 台电脑，点一台连接：
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {devices.map((device) => (
                <li key={device.addr}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted"
                    onClick={() => handleConnect(device.addr)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{device.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {device.addr}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {connectingAddr === device.addr ? "连接中…" : "连接"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : hasDiscovered && !discoverError ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-3">
            <p className="text-sm font-medium">没找到电脑</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-muted-foreground">
              <li>手机和电脑连同一个 Wi-Fi</li>
              <li>电脑端 Sidekick 已打开</li>
              <li>允许防火墙接收 Sidekick 的连接</li>
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void discover()}
            >
              重新搜索
            </Button>
          </div>
        ) : null}

        {discoverError && !discovering && (
          <div
            role="alert"
            className="mt-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-3"
          >
            <p className="text-sm break-words text-destructive">{discoverError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void discover()}
            >
              重新搜索
            </Button>
          </div>
        )}
      </section>

      <div className="mt-2 flex shrink-0 flex-col">
        <button
          type="button"
          aria-expanded={manualOpen}
          className="self-start text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => setManualOpen((open) => !open)}
        >
          手动输入地址
        </button>
        {manualOpen && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!addr.trim()) return;
              handleConnect(addr);
            }}
          >
            <Input
              aria-label="电脑地址"
              placeholder="电脑地址，如 192.168.1.5:47810"
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
        )}
      </div>
    </>
  );
}
