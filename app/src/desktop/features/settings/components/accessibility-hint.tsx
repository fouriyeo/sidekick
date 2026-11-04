import { useCallback, useEffect, useState } from "react";
import {
  type AccessibilityInfo,
  getAccessibilityInfo,
  openAccessibilitySettings,
  requestAccessibility,
} from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";

/**
 * 自动输入（macOS 辅助功能）未授权时的常驻提示。
 *
 * 辅助功能属于 TCC 保护，只能由用户在系统设置里手动开启——没有任何 API 能代授。
 * 这里把操作压到最少：启动就提醒 → 一键送到开关页 → 授权后回到窗口自动消失。
 */
export function AccessibilityHint() {
  const [info, setInfo] = useState<AccessibilityInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setInfo(await getAccessibilityInfo());
    } catch {
      // 非 macOS 或命令不可用：不显示提示，也不打断启动。
      setInfo(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // 从系统设置切回来时重新判定，已授权就自动收起。
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  if (!info || info.trusted || dismissed) return null;

  const handleEnable = async () => {
    setWorking(true);
    try {
      // 主路径：系统原生弹窗。它会先把本程序登记进「辅助功能」列表，
      // 用户点「打开系统设置」后由 macOS 自己跳到正确页面（比手拼 URL 可靠）。
      await requestAccessibility();
    } catch {
      // 弹窗失败时的兜底：至少把系统设置打开，用户还能自己找。
      try {
        await openAccessibilitySettings();
      } catch {
        // 都失败就保持按钮可用，用户可以再点一次。
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">自动输入还没开启</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          开启 macOS
          辅助功能后，说一句话会直接落到光标处；没开启时只复制到剪贴板，结果卡片也不会出现「回车 /
          清空」。
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-9 rounded-lg px-3 text-xs"
          disabled={working}
          onClick={() => void handleEnable()}
        >
          {working ? "正在打开…" : "去开启"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 rounded-lg px-2.5 text-xs text-muted-foreground"
          onClick={() => setDismissed(true)}
        >
          稍后
        </Button>
      </div>
    </div>
  );
}
