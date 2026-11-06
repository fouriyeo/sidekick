import { AppWindow, MousePointerClick } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ListActionRow, ListGroup, ListRow } from "@/desktop/shell/list";
import {
  type AccessibilityInfo,
  getAccessibilityInfo,
  normalizeError,
  openAccessibilitySettings,
  requestAccessibility,
} from "@/shared/lib/tauri";

/**
 * 设置 › 自动输入：一行状态、一行应用、两个动作。
 *
 * 辅助功能是 TCC 保护，只能由用户在系统设置里授权；「去开启」先弹系统原生提示，
 * 仍未授权时再打开系统设置。未授权时保留一句必要说明：只会复制，不自动粘贴。
 */
export function AccessibilityCard({ showHeading = true }: { showHeading?: boolean }) {
  const [info, setInfo] = useState<AccessibilityInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setInfo(await getAccessibilityInfo());
      setError(null);
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const trusted = info?.trusted ?? false;

  async function enable() {
    if (requesting) return;
    setRequesting(true);
    try {
      const next = await requestAccessibility();
      setInfo(next);
      setError(null);
      if (!next.trusted) await openAccessibilitySettings();
    } catch (cause) {
      setError(normalizeError(cause));
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <ListGroup title={showHeading ? "自动输入" : undefined}>
        <ListRow
          icon={<MousePointerClick aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
          iconTone={trusted ? "green" : "gray"}
          title="状态"
          meta={trusted ? "已授权" : "未授权"}
          tone={trusted ? "signal" : "muted"}
        />
        <ListRow
          icon={<AppWindow aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
          iconTone="blue"
          title="应用"
          detail={info?.executablePath}
          titleAttr={info?.executablePath}
        />
        <ListActionRow onClick={() => void refresh()} disabled={loading}>
          {loading ? "重新检测中…" : "重新检测"}
        </ListActionRow>
        {!trusted && (
          <ListActionRow onClick={() => void enable()} disabled={requesting}>
            {requesting ? "等待系统提示…" : "去开启"}
          </ListActionRow>
        )}
      </ListGroup>

      {!trusted && (
        <p className="px-1.5 text-[13px] leading-[1.45] text-muted-foreground">
          未授权时语音结果只会复制到剪贴板，不会自动粘贴。
        </p>
      )}

      {error && (
        <p role="alert" className="px-1.5 text-[13px] leading-[1.45] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
