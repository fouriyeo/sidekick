import { cn } from "cn";
import { Cable, Copy, QrCode, RefreshCw, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { DesktopConnectionStatus } from "@/desktop/lib/connection-status";
import {
  deviceCountFromClients,
  useDesktopClientsStore,
} from "@/desktop/lib/desktop-clients-store";
import { Card, CardHint, MetaRow } from "@/desktop/shell/card";
import { type PageTone, StateTag } from "@/desktop/shell/page-chips";
import type { ServerInfo } from "@/protocol/messages";
import { Button } from "@/shared/ui/button";

type ConnectionSectionProps = {
  info: ServerInfo | null;
  status: DesktopConnectionStatus;
  error: string | null;
  onRetry: () => void;
  qrOpen: boolean;
  onToggleQr: () => void;
};

const STATUS_TONE: Record<DesktopConnectionStatus, PageTone> = {
  loading: "muted",
  connecting: "muted",
  connected: "signal",
  disconnected: "muted",
  error: "danger",
};

const STATUS_TEXT: Record<DesktopConnectionStatus, string> = {
  loading: "读取连接信息…",
  connecting: "服务连接中…",
  connected: "服务在跑",
  disconnected: "服务重连中",
  error: "服务没起来",
};

/**
 * 系统 › 连接：三种连接方式按推荐度排序（01 自动发现 / 02 扫码 / 03 手动地址），
 * 二维码按需展开、复制有反馈；右侧放局域网直连读数与排障。
 */
export function ConnectionSection({
  info,
  status,
  error,
  onRetry,
  qrOpen,
  onToggleQr,
}: ConnectionSectionProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qrErrorUrl, setQrErrorUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const clients = useDesktopClientsStore((state) => state.clients);

  const url = info?.url ?? null;
  const address = info ? `${info.ip}:${info.port}` : null;
  const discoveryPort = info?.discoveryPort ?? null;
  const devices = deviceCountFromClients(clients);
  const connected = status === "connected";
  const qrFailed = url !== null && qrErrorUrl === url;

  useEffect(() => {
    if (!qrOpen || !url) return;

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
  }, [qrOpen, url]);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    };
  }, []);

  async function handleCopy(value: string) {
    if (copyTimer.current !== null) {
      clearTimeout(copyTimer.current);
      copyTimer.current = null;
    }
    setCopyFailed(false);

    try {
      await navigator.clipboard.writeText(value);
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
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto pr-0.5 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
        <Card
          title={
            <>
              <Cable aria-hidden="true" />
              三种连接方式
            </>
          }
          subtitle="按推荐度排序 · 企业网优先扫码"
          pill={
            <StateTag
              label={connected ? "自动发现监听中" : STATUS_TEXT[status]}
              tone={STATUS_TONE[status]}
            />
          }
        >
          {status === "error" && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
              <p className="text-xs font-medium text-destructive">获取连接信息失败</p>
              <p className="mt-0.5 text-[11px] leading-relaxed break-all text-muted-foreground">
                {error}
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
                重试
              </Button>
            </div>
          )}

          <Method
            no="01"
            title="自动发现"
            tag={{ label: "推荐", tone: "signal" }}
            desc="手机打开小跟班，同一网段会自动找到这台电脑，不需要输入任何地址。"
            actions={
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw />
                重新搜索
              </Button>
            }
          >
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <StateTag
                label={discoveryPort !== null ? `UDP ${discoveryPort} 监听中` : "自动发现未开启"}
                tone={discoveryPort !== null ? "signal" : "muted"}
              />
              <span className="text-[10.5px] text-muted-foreground">
                手机上打开 App 就会自动出现
              </span>
            </div>
          </Method>

          <Method
            no="02"
            title="扫码连接"
            tag={{ label: "企业网", tone: "decide" }}
            desc="电脑显示二维码，手机在「连接」页扫码即可；不依赖局域网广播。"
            actions={
              <Button
                type="button"
                variant={qrOpen ? "outline" : "default"}
                size="sm"
                aria-expanded={qrOpen}
                onClick={onToggleQr}
              >
                <QrCode />
                {qrOpen ? "收起二维码" : "显示二维码"}
              </Button>
            }
          >
            {qrOpen && (
              <div className="mt-2 rounded-lg border border-border bg-card p-3">
                {url && !qrFailed ? (
                  <div className="flex items-center gap-3">
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
                      <p className="text-[12.5px] font-medium">手机扫码直接连接</p>
                      <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
                        二维码内容是 {url}
                      </p>
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate font-mono text-[10px]">{address}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={!url}
                          onClick={() => {
                            if (url) void handleCopy(url);
                          }}
                        >
                          <Copy />
                          {copied ? "已复制" : "复制"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : qrFailed && url ? (
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      二维码生成失败，请手动输入地址：
                    </p>
                    <p className="mt-1 font-mono text-[11px] break-all">{url}</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">正在获取连接信息…</p>
                )}
                <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                  用手机浏览器扫码会打开下载页；装好 App 后在「连接」页扫码可直接连上。
                </p>
              </div>
            )}
          </Method>

          <Method
            no="03"
            title="手动输入地址"
            desc="手机「连接 → 手动输入地址」里填下面这一行；地址会记在本机，下次自动重连。"
          >
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <code className="min-w-0 truncate rounded-[8px] border border-border bg-card px-2.5 py-1.5 font-mono text-[11px]">
                {address ?? "…"}
              </code>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={!address}
                onClick={() => {
                  if (address) void handleCopy(address);
                }}
              >
                <Copy />
                {copied ? "已复制" : "复制"}
              </Button>
            </div>
            {copyFailed && (
              <p role="alert" className="mt-1 text-[10.5px] text-destructive">
                复制失败，请手动选择地址
              </p>
            )}
          </Method>

          <footer className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2">
            <CardHint>
              重新搜索 = 重新读取连接信息并刷新发现状态（桌面是服务端，不需要反复扫描）
            </CardHint>
            <span className="shrink-0 font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
              WS {info?.port ?? "…"} · UDP {discoveryPort ?? "…"}
            </span>
          </footer>
        </Card>

        <Card title="连不上电脑？" subtitle="TROUBLESHOOT · 三条最常见" className="shrink-0">
          <TroubleRow
            no="01"
            title="同一 Wi-Fi"
            desc="手机和电脑要在同一网段；访客网络和 Wi-Fi 隔离会让广播丢包。"
          />
          <TroubleRow
            no="02"
            title="macOS 防火墙"
            desc="首次弹窗要允许 Sidekick 传入（TCP 服务端口 + UDP 发现端口）。"
          />
          <TroubleRow
            no="03"
            title="企业网只放行单播"
            desc="广播被限制时自动发现会一直是 0 台，直接用扫码或手动地址。"
          />
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
        <Card
          title={
            <>
              <Smartphone aria-hidden="true" />
              局域网直连
            </>
          }
          subtitle="LAN · DIRECT"
          pill={
            <StateTag
              label={connected ? "监听中" : STATUS_TEXT[status]}
              tone={STATUS_TONE[status]}
            />
          }
        >
          <MetaRow label="本机地址" value={address ?? "…"} mono />
          <MetaRow label="WebSocket" value="/ws" mono />
          <MetaRow
            label="UDP 发现"
            value={discoveryPort !== null ? `${discoveryPort}` : "未开启"}
            mono
          />
          <MetaRow
            label="当前客户端"
            value={clients !== null ? `${clients} 个（含本机窗口）` : "—"}
            mono
          />
          <MetaRow label="手机设备" value={`${devices} 台（近似值）`} mono />
        </Card>

        <Card title="手机还没装 App？" className="border-dashed bg-wash/40" bodyClassName="gap-1">
          <CardHint>
            手机浏览器打开 {address ?? "上面的地址"} 就能下载安装包；装好后在 App 里扫码可直接连接。
          </CardHint>
        </Card>

        <Card title="连接状态" subtitle="SERVICE · WS" className="shrink-0">
          <MetaRow label="WebSocket" value={STATUS_TEXT[status]} />
          <MetaRow label="最近错误" value={status === "error" ? (error ?? "未知错误") : "无"} />
          <CardHint>手机与电脑需在同一 Wi-Fi；端口被占用时会自动顺延，以本机地址为准。</CardHint>
        </Card>
      </div>
    </div>
  );
}

function Method({
  no,
  title,
  tag,
  desc,
  actions,
  children,
}: {
  no: string;
  title: string;
  tag?: { label: string; tone: PageTone };
  desc: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-popover px-3 py-2.5",
        tag?.tone === "signal" && "border-signal/45",
      )}
    >
      <span className="shrink-0 pt-0.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
        {no}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold">{title}</span>
          {tag && <StateTag label={tag.label} tone={tag.tone} />}
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5 pt-0.5">{actions}</div>}
    </div>
  );
}

function TroubleRow({ no, title, desc }: { no: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5 border-t border-border pt-2 first:border-0 first:pt-0">
      <span className="mt-px shrink-0 rounded-[5px] border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
        {no}
      </span>
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium">{title}</p>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
