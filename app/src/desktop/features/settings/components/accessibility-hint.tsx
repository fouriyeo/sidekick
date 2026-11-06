import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { type AccessibilityInfo, getAccessibilityInfo } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";

type AccessibilityHintProps = {
  /** 「去开启」跳到设置页的「自动输入」；系统授权只能由用户在那里完成。 */
  onOpenSettings: () => void;
};

/**
 * 自动输入（macOS 辅助功能）未授权时，在「概览」顶部出现的一行提示。
 *
 * 只有未授权时占位：一行说清「没开 / 只会复制」+ 一个「去开启」+ 关闭；
 * 授权后（或非 macOS）自动消失，从系统设置切回来时重新判定。
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
      className="dsl-glass flex min-h-[56px] items-center gap-3 rounded-[16px] px-4 py-2.5"
    >
      <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-decide" />
      <p className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate text-[15px] leading-tight">
        <span className="shrink-0 font-medium text-foreground">自动输入未开启</span>
        <span aria-hidden="true" className="shrink-0 text-muted-foreground">
          ·
        </span>
        <span className="truncate text-[13px] text-muted-foreground">语音结果只会复制到剪贴板</span>
      </p>
      <Button type="button" variant="ghost" size="sm" onClick={onOpenSettings}>
        去开启
      </Button>
      <button
        type="button"
        aria-label="关闭提示"
        onClick={() => setDismissed(true)}
        className="-mr-1.5 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}
