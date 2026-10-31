import { cn } from "cn";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import {
  CONNECTION_STATUS_TEXT,
  type DesktopConnectionStatus,
} from "@/desktop/lib/connection-status";
import type { ServerInfo } from "@/protocol/messages";
import { Button } from "@/shared/ui/button";

type ConnectionPanelProps = {
  info: ServerInfo | null;
  status: DesktopConnectionStatus;
  error: string | null;
  onRetry: () => void;
};

export function ConnectionPanel({ info, status, error, onRetry }: ConnectionPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qrErrorUrl, setQrErrorUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const url = info?.url ?? null;
  const qrFailed = url !== null && qrErrorUrl === url;
  const connected = status === "connected";

  useEffect(() => {
    if (!url) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    QRCode.toCanvas(canvas, url, { width: 220, margin: 1 })
      .then(() => {
        if (!cancelled) setQrErrorUrl(null);
      })
      .catch(() => {
        if (!cancelled) setQrErrorUrl(url);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

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

  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <img src="/logo-icon.svg" alt="" className="size-8 self-center" />
        <h1 className="text-[22px] font-bold tracking-[0.3px]">Sidekick</h1>
        <span className="min-w-0 truncate text-xs text-muted-foreground">电脑端 · 局域网测试</span>
      </div>

      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span
          aria-hidden="true"
          className={cn("size-2.5 rounded-full", connected ? "bg-success" : "bg-warning")}
        />
        <span role="status">{CONNECTION_STATUS_TEXT[status]}</span>
      </div>

      <div className="flex items-center gap-2">
        <code
          className="min-w-0 flex-1 truncate rounded-[8px] border border-border bg-background px-2.5 py-2 font-mono text-[13px]"
          title={url ?? undefined}
        >
          {url ?? "…"}
        </code>
        <Button
          type="button"
          size="lg"
          className="shrink-0 px-3.5 text-[13px]"
          disabled={!url}
          onClick={() => {
            void handleCopy();
          }}
        >
          {copied ? "已复制" : "复制"}
        </Button>
      </div>

      {copyFailed && (
        <p role="alert" className="text-xs text-destructive">
          复制失败，请手动选择地址
        </p>
      )}

      {status === "error" ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center">
          <p className="text-sm text-destructive">获取连接信息失败</p>
          <p className="max-w-full break-all text-xs text-muted-foreground">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            重试
          </Button>
        </div>
      ) : (
        <>
          <div
            className={cn("mx-auto rounded-lg bg-white p-2.5", !url || qrFailed ? "hidden" : "")}
          >
            <canvas
              ref={canvasRef}
              width={220}
              height={220}
              role="img"
              aria-label="手机连接二维码"
              className="block"
            />
          </div>

          {qrFailed && url && (
            <div className="mx-auto flex min-h-[220px] w-full max-w-[220px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">二维码生成失败，请手动输入地址：</p>
              <p className="break-all font-mono text-xs text-foreground">{url}</p>
            </div>
          )}

          {!url && (
            <div
              aria-hidden="true"
              className="mx-auto size-[220px] rounded-lg border border-dashed border-border bg-muted/30 motion-safe:animate-pulse"
            />
          )}
        </>
      )}

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        手机扫码打开页面，点“下载 App”安装后，输入上面的地址（同一 Wi-Fi）。
      </p>
    </section>
  );
}
