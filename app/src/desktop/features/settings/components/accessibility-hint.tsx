import { useCallback, useEffect, useState } from "react";
import { type AccessibilityInfo, getAccessibilityInfo } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";

type AccessibilityHintProps = {
  /** 「去开启」跳到设置页的「自动输入权限」卡；系统授权只能由用户在那里完成。 */
  onOpenSettings: () => void;
};

/**
 * 自动输入（macOS 辅助功能）未授权时的外壳级提示条（40，所有桌面页都出现）。
 *
 * 辅助功能属于 TCC 保护，只能由用户在系统设置里手动开启——没有任何 API 能代授。
 * 这里只做两件事：持续提醒 + 一键到设置页；授权后回到窗口自动消失，也可「知道了」收起。
 */
export function AccessibilityHint({ onOpenSettings }: AccessibilityHintProps) {
  const [info, setInfo] = useState<AccessibilityInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

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

  return (
    <div
      role="status"
      className="flex h-10 shrink-0 items-center gap-2.5 overflow-hidden border-b border-border bg-wash px-3.5 text-[11.5px]"
    >
      <p className="min-w-0 flex-1 truncate">
        <strong className="font-semibold text-foreground">自动输入还没开启</strong>
        <span className="text-muted-foreground">
          {" "}
          · 语音结果只能复制到剪贴板；开启后才会自动粘贴，并出现「回车 / 清空」。
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-6 rounded-[7px] px-2.5 text-[11px]"
          onClick={onOpenSettings}
        >
          去开启
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 rounded-[7px] px-2.5 text-[11px] text-muted-foreground"
          onClick={() => setDismissed(true)}
        >
          知道了
        </Button>
      </div>
    </div>
  );
}
