import { cn } from "cn";
import { Settings } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import {
  CONNECTION_SIGNAL_STATUS,
  CONNECTION_STATUS_TEXT,
  type DesktopConnectionStatus,
} from "@/desktop/lib/connection-status";
import type { ServerInfo } from "@/protocol/messages";
import { Button } from "@/shared/ui/button";
import { SignalDot } from "@/shared/ui/signal-dot";

type ConnectionPanelProps = {
  info: ServerInfo | null;
  status: DesktopConnectionStatus;
  error: string | null;
  onRetry: () => void;
  onOpenSettings: () => void;
};

/** 仪器盘装饰：同心声呐环 + 三个信号点，纯静态、无动画。 */
function SonarDial() {
  return (
    <svg
      viewBox="0 0 72 72"
      aria-hidden="true"
      className="size-16 shrink-0 text-border"
      fill="none"
    >
      <circle cx="36" cy="36" r="33" stroke="currentColor" strokeDasharray="1 5" opacity="0.75" />
      <circle cx="36" cy="36" r="23" stroke="currentColor" />
      <circle cx="36" cy="36" r="13" stroke="currentColor" strokeDasharray="2 4" />
      <circle cx="36" cy="36" r="3.4" fill="var(--signal)" />
      <circle cx="50" cy="23" r="2.2" fill="var(--whale)" />
      <circle cx="24" cy="46" r="1.8" fill="var(--decide)" />
    </svg>
  );
}

export function ConnectionPanel({
  info,
  status,
  error,
  onRetry,
  onOpenSettings,
}: ConnectionPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [qrErrorUrl, setQrErrorUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const url = info?.url ?? null;
  const discoveryPort = info?.discoveryPort ?? null;
  const qrFailed = url !== null && qrErrorUrl === url;
  const connected = status === "connected";
  const signalStatus = CONNECTION_SIGNAL_STATUS[status];

  // 二维码只在展开后懒生成，面板默认不常驻大二维码。
  useEffect(() => {
    if (!detailsOpen || !url) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    QRCode.toCanvas(canvas, url, { width: 160, margin: 1 })
      .then(() => {
        if (!cancelled) setQrErrorUrl(null);
      })
      .catch(() => {
        if (!cancelled) setQrErrorUrl(url);
      });

    return () => {
      cancelled = true;
    };
  }, [detailsOpen, url]);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    };
  }, []);

  async function handleCopy() {
    if (!url) return;

    if (copyTimer.current !== null) {
      clearTimeout(copyTimer.current);
      copyTimer.current = null;
    }
    setCopyFailed(false);

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      copyTimer.current = setTimeout(() => {
        setCopied(false);
        copyTimer.current = null;
      }, 1200);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  function toggleDetails() {
    setQrErrorUrl(null);
    setDetailsOpen((open) => !open);
  }

  return (
    <aside className="flex min-h-0 min-w-0 flex-col gap-5 overflow-y-auto rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2.5">
        <img src="/logo-icon.svg" alt="" className="size-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] leading-tight font-semibold tracking-[0.01em]">
            小跟班
          </h1>
          <p className="mt-0.5 font-mono text-[9.5px] tracking-[0.2em] text-muted-foreground uppercase">
            Sidekick
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <SignalDot status={signalStatus} />
          <span role="status" className="min-w-0 truncate text-[13px] font-medium">
            {CONNECTION_STATUS_TEXT[status]}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
            {connected ? "LINK · OK" : signalStatus === "error" ? "LINK · ERR" : "LINK · …"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <code
            className="min-w-0 flex-1 truncate rounded-[10px] border border-border bg-popover px-3 py-2.5 font-mono text-[12px] tracking-[0.02em]"
            title={url ?? undefined}
          >
            {info ? (
              <>
                {info.ip}
                <span className="text-muted-foreground">:</span>
                <span className="text-signal">{info.port}</span>
              </>
            ) : (
              "…"
            )}
          </code>
          <Button
            type="button"
            size="lg"
            className="h-11 shrink-0 px-4 text-[13px]"
            disabled={!url}
            onClick={() => {
              void handleCopy();
            }}
          >
            {copied ? "已复制" : "复制"}
          </Button>
        </div>

        {copyFailed && (
          <p role="alert" className="text-[11px] leading-relaxed text-destructive">
            复制失败，请手动选择地址
          </p>
        )}
      </div>

      {status === "error" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs font-medium text-destructive">获取连接信息失败</p>
          <p className="max-w-full text-[11px] leading-relaxed break-all text-muted-foreground">
            {error}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={onRetry}
          >
            重试
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-popover px-3 py-2.5">
            <SonarDial />
            <div className="min-w-0">
              <p className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
                Discovery
              </p>
              <p className="mt-0.5 text-[13px]">自动发现</p>
              <p
                className={cn(
                  "mt-0.5 text-[11px] leading-relaxed",
                  discoveryPort !== null ? "text-signal" : "text-muted-foreground",
                )}
              >
                {discoveryPort !== null
                  ? `UDP ${discoveryPort} · 手机打开 App 自动找到这台电脑`
                  : "未开启，请用二维码或手动地址"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 self-start"
              aria-expanded={detailsOpen}
              onClick={toggleDetails}
            >
              {detailsOpen ? "收起二维码" : "手机连接"}
            </Button>

            {detailsOpen && (
              <div className="flex flex-col gap-2">
                {url && !qrFailed && (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-popover p-3">
                    <span className="shrink-0 rounded-[6px] border border-border bg-white p-1.5">
                      <canvas
                        ref={canvasRef}
                        width={160}
                        height={160}
                        role="img"
                        aria-label="手机连接二维码"
                        className="block size-[76px]"
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">扫码打开</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        同一局域网 · 下载 App 后启动会自动连接
                      </p>
                    </div>
                  </div>
                )}

                {qrFailed && url && (
                  <div className="w-full rounded-lg border border-dashed border-border p-3">
                    <p className="text-[11px] text-muted-foreground">
                      二维码生成失败，请手动输入地址：
                    </p>
                    <p className="mt-1 font-mono text-[11px] break-all text-foreground">{url}</p>
                  </div>
                )}

                {!url && <p className="text-xs text-muted-foreground">正在获取连接信息…</p>}

                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  手机扫码打开页面，点「下载 App」安装后，同一 Wi-Fi 下打开 App 会自动发现这台电脑。
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
        <button
          type="button"
          className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={onOpenSettings}
        >
          <Settings className="size-3.5" />
          设置
        </button>
        <span className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
          v0.1 · 深海
        </span>
      </div>
    </aside>
  );
}
