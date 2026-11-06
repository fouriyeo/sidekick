import { Copy, QrCode, Server, Smartphone, Sparkles } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { AccessibilityHint } from "@/desktop/features/settings/components/accessibility-hint";
import {
  deviceCountFromClients,
  useDesktopClientsStore,
} from "@/desktop/lib/desktop-clients-store";
import type { DesktopNav } from "@/desktop/lib/desktop-nav";
import { useDesktopStatusStore } from "@/desktop/lib/desktop-status-store";
import { useDesktopVoiceStore } from "@/desktop/lib/desktop-voice-store";
import { ListActionRow, ListEmpty, ListGroup, ListRow } from "@/desktop/shell/list";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageShell } from "@/desktop/shell/page-shell";
import type { DesktopConnection } from "@/desktop/use-desktop-connection";
import { formatRelativeTime } from "@/shared/lib/format";
import {
  displayStateText,
  rowTime,
  type SessionRow,
  sessionTitle,
  visibleSessions,
  workingActionText,
} from "@/shared/lib/sessions";
import { AI_STATE_LABEL } from "@/shared/lib/status";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

const VOICE_OUTCOME: Record<string, string> = {
  inserted: "已输入",
  copied: "已复制",
  failed: "没有输入",
};

type OverviewPageProps = {
  connection: DesktopConnection;
  nav: DesktopNav;
};

/** 当前会话的第二行：等你决定 / 正在<动作> / 已完成。 */
function currentSessionDetail(row: SessionRow): string {
  if (row.display === "working") return workingActionText(row.tool);
  return displayStateText(row);
}

/**
 * 概览（默认首页）：三行状态 + 当前会话 + 最近一次语音。
 *
 * 状态行用 iOS 彩色图标块；不做解释性文案，值直接写在行尾。
 */
export function OverviewPage({ connection, nav }: OverviewPageProps) {
  const status = useDesktopStatusStore((state) => state.status);
  const sessionList = useDesktopStatusStore((state) => state.sessionList);
  const clients = useDesktopClientsStore((state) => state.clients);
  const voice = useDesktopVoiceStore((state) => state.last);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const info = connection.info;
  const connected = connection.status === "connected";
  const address = info ? `${info.ip}:${info.port}` : null;
  const devices = deviceCountFromClients(clients);
  const rows = visibleSessions(sessionList, {});
  const current =
    rows.find((row) => row.display === "asking") ??
    rows.find((row) => row.display === "working") ??
    rows.find((row) => row.display === "completed") ??
    null;
  const aiDetail = current
    ? `${currentSessionDetail(current)} · ${rowTime(current)}`
    : status
      ? "没有进行中的会话"
      : "没有开启联动";

  // 用 data URL 而不是 canvas：弹层是 portal，挂载时机可能晚于 effect。
  useEffect(() => {
    if (!qrOpen || !info?.url) return;
    let cancelled = false;
    QRCode.toDataURL(info.url, { width: 352, margin: 1, errorCorrectionLevel: "M" })
      .then((src) => {
        if (!cancelled) setQrSrc(src);
      })
      .catch(() => {
        if (!cancelled) setQrOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, [qrOpen, info?.url]);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    };
  }, []);

  async function handleCopy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => {
        setCopied(false);
        copyTimer.current = null;
      }, 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="概览"
        actions={
          <div className="dsl-action-group">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setQrOpen(true)}
              disabled={!info?.url}
            >
              <QrCode aria-hidden="true" className="size-4" />
              二维码
            </Button>
          </div>
        }
      />

      <PageBody>
        <AccessibilityHint onOpenSettings={() => nav.goSettings("accessibility")} />

        <ListGroup>
          <ListRow
            icon={<Server aria-hidden="true" className="size-[17px]" strokeWidth={2.2} />}
            iconTone="green"
            title="服务"
            meta={connected ? `${info?.port ?? "…"} · 运行中` : "未启动"}
            chevron
            onClick={() => nav.goSettings("connection")}
          />
          <ListRow
            icon={<Smartphone aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
            iconTone="blue"
            title="手机"
            meta={devices > 0 ? `${devices} 台` : "未连接"}
            chevron
            onClick={() => nav.goSettings("connection")}
          />
          <ListRow
            icon={<Sparkles aria-hidden="true" className="size-[17px]" strokeWidth={2.2} />}
            iconTone="teal"
            title="AI"
            detail={aiDetail}
            meta={status ? AI_STATE_LABEL[status.state] : "未联动"}
            chevron
            onClick={() => nav.goSettings("hook")}
          />
        </ListGroup>

        {current && (
          <ListGroup title="当前会话">
            <ListRow
              title={sessionTitle(current)}
              detail={currentSessionDetail(current)}
              meta={rowTime(current)}
            />
            <ListActionRow onClick={() => connection.requestFocus(current.id)}>
              在 DSH 打开
            </ListActionRow>
          </ListGroup>
        )}

        <ListGroup title="语音输入">
          {voice ? (
            <ListRow
              title={voice.text || "没有识别到文字"}
              detail={[VOICE_OUTCOME[voice.outcome] ?? voice.outcome, formatRelativeTime(voice.at)]
                .filter(Boolean)
                .join(" · ")}
            />
          ) : (
            <ListEmpty>还没有语音记录</ListEmpty>
          )}
        </ListGroup>
      </PageBody>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle>扫码连接</DialogTitle>
            <DialogDescription className="sr-only">手机扫描二维码连接这台电脑</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            {qrSrc ? (
              <img
                src={qrSrc}
                alt="扫码连接这台电脑的二维码"
                className="size-[196px] rounded-2xl bg-white p-2"
              />
            ) : (
              <div className="size-[196px] rounded-2xl bg-muted" />
            )}
            <div className="flex w-full items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-full bg-muted px-3.5 py-2 font-mono text-[13px]">
                {address ?? "…"}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!address}
                onClick={() => void handleCopy()}
              >
                <Copy aria-hidden="true" className="size-4" />
                {copied ? "已复制" : "复制"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
