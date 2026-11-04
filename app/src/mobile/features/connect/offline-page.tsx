import { cn } from "cn";
import { ChevronDown, ChevronUp, Loader2, QrCode, RefreshCw, RotateCw, Wifi } from "lucide-react";
import { useState } from "react";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { useUiStore } from "@/mobile/ui-store";
import type { DiscoveredServer } from "@/protocol/discovery";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { SignalBars } from "@/shared/ui/signal-bars";
import { useConnectionStore } from "./connection-store";
import { useRetryCountdown } from "./connection-view";

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[14px] border border-border bg-card", className)}>
      {children}
    </section>
  );
}

function CardHead({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 px-3">
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-foreground">{title}</span>
        {meta && (
          <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
            {meta}
          </span>
        )}
      </span>
      {action}
    </div>
  );
}

/**
 * 连接页（offline）：连不上电脑时的唯一主入口。
 *
 * 扫码是主按钮（不依赖局域网广播）；手动地址同屏可展开；自动发现给真实状态；
 * 上次地址一键直连；Android 16+ 局域网权限给出可执行提示。
 */
export function OfflinePage() {
  const status = useConnectionStore((state) => state.status);
  const error = useConnectionStore((state) => state.error);
  const addr = useConnectionStore((state) => state.addr);
  const devices = useConnectionStore((state) => state.devices);
  const discovering = useConnectionStore((state) => state.discovering);
  const hasDiscovered = useConnectionStore((state) => state.hasDiscovered);
  const discoverError = useConnectionStore((state) => state.discoverError);
  const retrying = useConnectionStore((state) => state.retrying);
  const retryAttempt = useConnectionStore((state) => state.retryAttempt);
  const retryAt = useConnectionStore((state) => state.retryAt);
  const setAddr = useConnectionStore((state) => state.setAddr);
  const connect = useConnectionStore((state) => state.connect);
  const discover = useConnectionStore((state) => state.discover);
  const retryNow = useConnectionStore((state) => state.retryNow);
  const closeOffline = useUiStore((state) => state.closeOffline);
  const setScanOpen = useUiStore((state) => state.setScanOpen);

  const [manualOpen, setManualOpen] = useState(false);
  const retrySeconds = useRetryCountdown(retryAt);

  const connected = status === "connected";
  const connecting = status === "connecting";
  const noDevices = hasDiscovered && !discovering && devices.length === 0;

  function handleConnect(target: string) {
    void connect(target);
  }

  return (
    <MobilePage aria-label="连接">
      <PageHeader
        title="连接"
        sub="局域网直连"
        onBack={closeOffline}
        backLabel="返回上一页"
        right={
          connected ? (
            <SignalBars level={3} tone="signal" />
          ) : connecting ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <SignalBars level={1} tone="muted" />
          )
        }
      />

      <PageScroll>
        <Card className="px-3.5 py-3">
          {connected ? (
            <>
              <div className="flex items-center gap-2">
                <SignalBars level={3} tone="signal" />
                <span className="text-sm font-medium text-foreground">已连接 · 电脑</span>
              </div>
              {addr && (
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {addr} · 局域网直连
                </p>
              )}
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                连接正常；断线后会自动重连，也可以重新扫码换一台电脑。
              </p>
            </>
          ) : connecting ? (
            <>
              <div className="flex items-center gap-2">
                <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
                <span role="status" className="text-sm font-medium text-foreground">
                  正在连接…
                </span>
              </div>
              {addr && (
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{addr}</p>
              )}
            </>
          ) : status === "error" && error ? (
            <>
              <div className="flex items-center gap-2">
                <SignalBars level={1} tone="danger" />
                <span className="text-sm font-medium text-destructive">连不上电脑</span>
              </div>
              <p role="alert" className="mt-1 text-xs leading-relaxed break-words text-foreground">
                {error}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                下一步：确认电脑端 Sidekick 正在运行，且与手机在同一 Wi-Fi。
              </p>
            </>
          ) : discovering ? (
            <>
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full bg-muted-foreground motion-safe:animate-pulse"
                />
                <span role="status" className="text-sm font-medium text-foreground">
                  正在找电脑…
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                同一 Wi-Fi 下通常 1–2 秒完成；找不到时可以直接扫码。
              </p>
            </>
          ) : hasDiscovered ? (
            <>
              <div className="flex items-center gap-2">
                <SignalBars level={1} tone="muted" />
                <span className="text-sm font-medium text-foreground">附近没有电脑</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                已搜索，没有电脑回应局域网广播。可以扫码或手动输入地址。
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <SignalBars level={1} tone="muted" />
                <span className="text-sm font-medium text-foreground">准备搜索电脑…</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                自动发现会先试一次；找不到时用扫码或手动地址。
              </p>
            </>
          )}

          <p className="mt-2 font-mono text-[9.5px] tracking-[0.06em] text-muted-foreground uppercase">
            首选 · 不依赖广播
          </p>
          <Button
            type="button"
            className="mt-1.5 h-12 w-full rounded-[12px] text-sm"
            onClick={() => setScanOpen(true)}
          >
            <QrCode className="size-4" />
            扫码连接
          </Button>

          <button
            type="button"
            aria-expanded={manualOpen}
            aria-controls="manual-address"
            className="mt-1 flex min-h-11 w-full items-center gap-1 text-xs font-medium text-muted-foreground"
            onClick={() => setManualOpen((open) => !open)}
          >
            手动输入地址
            {manualOpen ? (
              <ChevronUp aria-hidden="true" className="size-4" />
            ) : (
              <ChevronDown aria-hidden="true" className="size-4" />
            )}
          </button>

          {manualOpen && (
            <form
              id="manual-address"
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!addr.trim() || connecting) return;
                handleConnect(addr);
              }}
            >
              <Input
                aria-label="电脑地址"
                placeholder="如 192.168.1.5:47810"
                value={addr}
                onChange={(event) => setAddr(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-11 flex-1 rounded-[12px] font-mono text-[15px]"
              />
              <Button
                type="submit"
                size="lg"
                className="h-11 rounded-[12px] px-4"
                disabled={!addr.trim() || connecting}
              >
                连接
              </Button>
            </form>
          )}
        </Card>

        <Card className="mt-2.5">
          <CardHead
            title="自动发现 · UDP 47820"
            meta={
              discovering
                ? "正在监听局域网广播…"
                : hasDiscovered
                  ? `监听中 · 已发现 ${devices.length} 台`
                  : "等待搜索"
            }
            action={
              <button
                type="button"
                aria-label="重新搜索电脑"
                disabled={discovering}
                className="flex min-h-11 shrink-0 items-center gap-1 rounded-[10px] px-2 text-xs font-medium text-signal disabled:opacity-40"
                onClick={() => void discover()}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn("size-3.5", discovering && "animate-spin")}
                />
                搜索
              </button>
            }
          />

          <div className="border-t border-border px-3 py-2.5">
            {devices.length > 0 ? (
              <ul className="flex list-none flex-col gap-2 p-0">
                {devices.map((device: DiscoveredServer) => (
                  <li key={device.addr}>
                    <button
                      type="button"
                      aria-label={`连接 ${device.name}`}
                      disabled={connecting}
                      className="flex min-h-12 w-full items-center justify-between gap-2 rounded-[12px] border border-border bg-popover px-3 py-2 text-left disabled:opacity-50"
                      onClick={() => handleConnect(device.addr)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {device.name}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">
                          {device.addr}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-signal">
                        {connecting ? "连接中…" : "连接 →"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : discoverError ? (
              <p role="alert" className="text-xs leading-relaxed break-words text-destructive">
                {discoverError}
              </p>
            ) : discovering ? (
              <p className="text-xs leading-relaxed text-muted-foreground">正在监听局域网广播…</p>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-foreground">
                  {hasDiscovered ? "0 台电脑回应：" : "还没搜索："}
                  确认同一 Wi-Fi、电脑端开着、防火墙放行。
                </p>
                {noDevices && (
                  <p className="mt-1.5 rounded-[10px] border border-border px-2.5 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                    Android 16+ 需要允许「附近的设备」权限，否则自动发现会一直是 0 台；可在系统设置
                    → 应用 → Sidekick → 权限里允许，回到这里重新搜索。
                  </p>
                )}
              </>
            )}
          </div>
        </Card>

        {addr && !connected && (
          <Card className="mt-2.5 px-3.5 py-3">
            <p className="text-xs font-medium text-foreground">上次连过</p>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{addr}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-2 h-11 w-full rounded-[12px]"
              disabled={connecting}
              onClick={() => handleConnect(addr)}
            >
              直接连接
            </Button>
            <p className="mt-1.5 font-mono text-[9.5px] leading-relaxed text-muted-foreground">
              地址会记在本机，下次启动自动重连。
            </p>
          </Card>
        )}

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span
            role="status"
            aria-live="polite"
            className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground"
          >
            {retrying
              ? `正在自动重连（第 ${retryAttempt} 次）…`
              : retrySeconds !== null
                ? `${retrySeconds} 秒后自动重连（第 ${retryAttempt} 次）`
                : "自动重连已开启：断线后 1 秒起，最长 30 秒一次。"}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {!retrying && (
              <button
                type="button"
                className="flex min-h-11 items-center gap-1 rounded-[10px] px-2 text-xs font-medium text-signal"
                onClick={retryNow}
              >
                <RotateCw aria-hidden="true" className="size-3.5" />
                立即重连
              </button>
            )}
            <button
              type="button"
              className="flex min-h-11 items-center gap-1 rounded-[10px] border border-border px-2 text-xs font-medium text-foreground disabled:opacity-40"
              disabled={discovering || retrying}
              onClick={() => void discover()}
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
              重新搜索
            </button>
          </span>
        </div>

        <p className="mt-2.5 flex items-start gap-1.5 px-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
          <Wifi aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          公司网络可能不转发广播，自动发现会一直是 0 台；用扫码或手动地址最可靠。
        </p>
      </PageScroll>
    </MobilePage>
  );
}
