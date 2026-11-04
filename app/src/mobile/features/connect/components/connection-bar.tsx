import { cn } from "cn";
import { useEffect, useState } from "react";
import { useUiStore } from "@/mobile/ui-store";
import type { DiscoveredServer } from "@/protocol/discovery";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { SignalDot } from "@/shared/ui/signal-dot";
import { type ConnectionStatus, useConnectionStore } from "../connection-store";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  disconnected: "未连接",
  connecting: "连接中…",
  connected: "已连接",
  error: "未连接",
};

/** 每 500ms 刷新一次，用于「N 秒后自动重连」倒计时；没有排期时不开计时器。 */
function useRetryCountdown(retryAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (retryAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [retryAt]);

  if (retryAt === null) return null;
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

type ConnectionBarProps = {
  onError?: (message: string) => void;
};

type DeviceCardProps = {
  device: DiscoveredServer;
  status: ConnectionStatus;
  error: string | null;
  onConnect: () => void;
};

/** 设备卡：名字 + mono 地址 + 状态点，连接按钮 44px。 */
function DeviceCard({ device, status, error, onConnect }: DeviceCardProps) {
  const connected = status === "connected";
  const connecting = status === "connecting";

  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <SignalDot status={connected ? "connected" : connecting ? "waiting" : "idle"} />
          <p className="truncate text-sm font-medium">{device.name}</p>
        </div>
        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{device.addr}</p>
        <p className={cn("mt-0.5 text-xs", connected ? "text-success" : "text-muted-foreground")}>
          {connected ? "已连接，可以开始聊天" : connecting ? "正在连接…" : "准备连接"}
        </p>
        {status === "error" && error && (
          <p role="alert" className="mt-0.5 text-xs break-words text-destructive">
            {error}
          </p>
        )}
      </div>
      {!connected && !connecting && (
        <Button type="button" size="lg" className="h-11 shrink-0" onClick={onConnect}>
          连接
        </Button>
      )}
    </div>
  );
}

export function ConnectionBar({ onError }: ConnectionBarProps) {
  const setScanOpen = useUiStore((state) => state.setScanOpen);
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
  const retryAttempt = useConnectionStore((state) => state.retryAttempt);
  const retryAt = useConnectionStore((state) => state.retryAt);
  const retrying = useConnectionStore((state) => state.retrying);
  const retryNow = useConnectionStore((state) => state.retryNow);
  const retrySeconds = useRetryCountdown(retryAt);
  const [manualOpen, setManualOpen] = useState(false);
  const connected = status === "connected";
  const connecting = status === "connecting";
  const connectingAddr = connecting ? addr : null;
  const showRetryRow = !connected && !connecting && !discovering;

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
      <header className="flex min-h-11 shrink-0 items-center justify-between gap-3 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src="/logo-icon.svg"
            alt=""
            aria-hidden="true"
            className="size-7 shrink-0 rounded-[10px]"
          />
          <div className="flex min-w-0 items-baseline gap-1.5">
            <h1 className="truncate text-base font-semibold tracking-[-0.01em]">小跟班</h1>
            <span className="hidden shrink-0 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground min-[360px]:inline">
              SIDEKICK · PHONE
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SignalDot status={connected ? "connected" : connecting ? "waiting" : "idle"} />
          <span
            role="status"
            aria-live="polite"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
          >
            {STATUS_LABELS[status]}
          </span>
        </div>
      </header>

      <section className="mt-4 shrink-0" aria-label="自动发现电脑">
        {discovering ? (
          <div className="flex items-center gap-2.5 rounded-[14px] border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full bg-decide motion-safe:animate-pulse"
            />
            <span role="status" aria-live="polite">
              正在找电脑…
            </span>
            <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.1em]">
              同一 Wi-Fi
            </span>
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
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              找到 {devices.length} 台电脑，点一台连接
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {devices.map((device) => (
                <li key={device.addr}>
                  <button
                    type="button"
                    className="flex min-h-12 w-full items-center justify-between gap-2 rounded-[14px] border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-signal focus-visible:border-signal"
                    onClick={() => handleConnect(device.addr)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{device.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {device.addr}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {connectingAddr === device.addr ? "连接中…" : "连接 →"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : hasDiscovered && !discoverError ? (
          <div className="rounded-[14px] border border-dashed border-border bg-muted/30 px-3 py-3">
            <p className="text-sm font-medium">没找到电脑</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-muted-foreground">
              <li>手机和电脑连同一个 Wi-Fi</li>
              <li>电脑端 Sidekick 已打开</li>
              <li>允许防火墙接收 Sidekick 的连接</li>
            </ul>
            <Button
              type="button"
              size="sm"
              className="mt-3 h-11 w-full rounded-[10px] text-xs"
              onClick={() => setScanOpen(true)}
            >
              扫电脑上的二维码
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-11 w-full rounded-[10px] text-xs"
              onClick={() => setManualOpen(true)}
            >
              手动输入电脑地址
            </Button>
          </div>
        ) : null}

        {discoverError && !discovering && (
          <div
            role="alert"
            className="mt-2 rounded-[14px] border border-destructive/40 bg-destructive/5 px-3 py-3"
          >
            <p className="text-sm break-words text-destructive">{discoverError}</p>
          </div>
        )}
      </section>

      {showRetryRow && (
        <div className="mt-3 flex min-h-11 shrink-0 items-center justify-between gap-2">
          <span
            role="status"
            aria-live="polite"
            className="min-w-0 truncate font-mono text-[10px] tracking-[0.04em] text-muted-foreground"
          >
            {retrying
              ? `正在自动重连（第 ${retryAttempt} 次）…`
              : retrySeconds !== null
                ? `${retrySeconds} 秒后自动重连（第 ${retryAttempt} 次）`
                : "未连接"}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {!retrying && (
              <Button
                type="button"
                variant="ghost"
                className="h-11 px-2.5 text-xs text-signal hover:bg-wash hover:text-signal"
                onClick={retryNow}
              >
                立即重连
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 rounded-[10px] px-3 text-xs"
              disabled={discovering || retrying}
              onClick={() => void discover()}
            >
              重新搜索
            </Button>
          </span>
        </div>
      )}

      <div className="mt-1 flex shrink-0 flex-col">
        <button
          type="button"
          aria-expanded={manualOpen}
          className="flex min-h-11 items-center gap-1 self-start font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          onClick={() => setManualOpen((open) => !open)}
        >
          手动输入地址 <span aria-hidden="true">{manualOpen ? "−" : "+"}</span>
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
              autoFocus
              className="h-11 flex-1 rounded-[12px] font-mono text-[15px]"
            />
            <Button type="submit" size="lg" className="h-11 rounded-[12px] px-4">
              连接
            </Button>
          </form>
        )}
      </div>
    </>
  );
}
