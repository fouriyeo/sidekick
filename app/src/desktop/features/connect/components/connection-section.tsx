import { RadioTower, Server, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import type { DesktopConnectionStatus } from "@/desktop/lib/connection-status";
import {
  deviceCountFromClients,
  useDesktopClientsStore,
} from "@/desktop/lib/desktop-clients-store";
import { ListActionRow, ListGroup, ListRow } from "@/desktop/shell/list";
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

/** 服务状态：一行短值，不复述含义。 */
const SERVICE_TEXT: Record<DesktopConnectionStatus, string> = {
  loading: "正在读取",
  connecting: "启动中",
  connected: "运行中",
  disconnected: "重连中",
  error: "未启动",
};

/**
 * 设置 › 手机连接：服务状态 + 发现端口 + 在线设备 + 二维码/地址。
 *
 * 二维码直接作为卡内一块（176、白底），下面一行地址带复制；
 * 页头已提供「重新搜索 / 二维码」按钮，组件内不重复放这些动作。
 * 错误态只留一行结论 + 重试，不写排障长文。
 */
export function ConnectionSection({
  info,
  status,
  error,
  onRetry,
  qrOpen,
  onToggleQr,
}: ConnectionSectionProps) {
  // 错误详情不再展示：错误态只留一行结论 + 重试（错误信息由连接层记录）。
  void error;
  // 二维码开关由 settings-page 的页头按钮负责，组件内只读 qrOpen。
  void onToggleQr;

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
  const qrFailed = url !== null && qrErrorUrl === url;

  useEffect(() => {
    if (!qrOpen || !url) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    QRCode.toCanvas(canvas, url, { width: 196, margin: 1 })
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

  async function handleCopy() {
    if (!address) return;
    if (copyTimer.current !== null) {
      clearTimeout(copyTimer.current);
      copyTimer.current = null;
    }
    setCopyFailed(false);

    try {
      await navigator.clipboard.writeText(address);
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
    // settings-page 的二级页容器没有组间距，这里按 PageBody 的 24 补齐。
    <div className="flex flex-col gap-6">
      {status === "error" && (
        <ListGroup>
          <ListRow title="连接失败" tone="danger" />
          <ListActionRow tone="signal" onClick={onRetry}>
            重试
          </ListActionRow>
        </ListGroup>
      )}

      <ListGroup>
        <ListRow
          icon={<Server aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
          iconTone={status === "connected" ? "green" : status === "error" ? "gray" : "orange"}
          title="服务"
          meta={SERVICE_TEXT[status]}
        />
        <ListRow
          icon={<RadioTower aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
          iconTone="blue"
          title="发现端口"
          meta={discoveryPort !== null ? `UDP ${discoveryPort}` : "未开启"}
          mono={discoveryPort !== null}
        />
        <ListRow
          icon={<Smartphone aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
          iconTone="teal"
          title="在线设备"
          meta={`${devices} 台`}
        />
      </ListGroup>

      <ListGroup title={qrOpen ? "扫码连接" : "连接地址"}>
        {qrOpen && (
          <div className="flex flex-col items-center px-4 py-7">
            {url !== null && !qrFailed ? (
              <div className="rounded-[24px] bg-white p-3.5 shadow-[0_0_0_0.5px_var(--glass-border),0_10px_28px_-24px_rgba(0,0,0,0.4)]">
                <canvas
                  ref={canvasRef}
                  width={196}
                  height={196}
                  role="img"
                  aria-label="手机连接二维码"
                  className="block size-[196px]"
                />
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                {qrFailed ? "二维码生成失败" : "正在获取连接信息…"}
              </p>
            )}
          </div>
        )}
        <ListRow
          title="地址"
          meta={address ?? "…"}
          mono
          control={
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={!address}
              aria-label={address ? `复制地址 ${address}` : "复制地址"}
              onClick={() => void handleCopy()}
            >
              {copied ? "已复制" : copyFailed ? "复制失败" : "复制"}
            </Button>
          }
        />
      </ListGroup>

      <span role="status" className="sr-only">
        {copied ? "地址已复制" : copyFailed ? "复制失败，可重试" : ""}
      </span>
    </div>
  );
}
