import { AlertTriangle, Check, ExternalLink, FolderSearch, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  type AccessibilityInfo,
  getAccessibilityInfo,
  normalizeError,
  openAccessibilitySettings,
  requestAccessibility,
  revealAccessibilityApp,
} from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";

export function AccessibilityCard() {
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

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">自动输入权限</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          开启 macOS 辅助功能后，转写文字会直接粘贴到当前光标处；未开启时只复制到剪贴板。Sidekick
          只合成 ⌘V，不会回车、不会发送。
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`flex size-5 items-center justify-center rounded-full ${
              trusted ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
            }`}
          >
            {trusted ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
          </span>
          <div>
            <p className="text-xs font-medium">
              {trusted ? "已授权，可自动粘贴" : "未授权，只会复制"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {info?.isDev ? "开发模式" : "正式模式"} · {info?.appName ?? "Sidekick"}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          重新检测
        </Button>
      </div>

      {info && (
        <code className="break-all rounded-lg border border-border bg-muted/30 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
          {info.executablePath}
        </code>
      )}

      <div className="flex flex-wrap gap-2">
        {!trusted && (
          <Button
            type="button"
            size="sm"
            disabled={requesting}
            onClick={() => {
              setRequesting(true);
              void requestAccessibility()
                .then((next) => {
                  setInfo(next);
                  setError(null);
                })
                .catch((cause: unknown) => setError(normalizeError(cause)))
                .finally(() => setRequesting(false));
            }}
          >
            {requesting ? "等待系统提示…" : "请求权限"}
          </Button>
        )}
        <Button
          type="button"
          variant={trusted ? "default" : "outline"}
          size="sm"
          onClick={() => {
            void openAccessibilitySettings().catch((cause: unknown) =>
              setError(normalizeError(cause)),
            );
          }}
        >
          <ExternalLink className="size-3.5" />
          打开系统设置
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void revealAccessibilityApp().catch((cause: unknown) =>
              setError(normalizeError(cause)),
            );
          }}
        >
          <FolderSearch className="size-3.5" />在 Finder 中显示
        </Button>
      </div>

      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
        <li>打开「系统设置 → 隐私与安全性 → 辅助功能」</li>
        <li>点「+」，选择上面显示的 Sidekick 程序并打开</li>
        <li>确认开关已打开，再点「重新检测」</li>
      </ol>

      {info?.isDev && (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          开发模式每次重新编译可能被 macOS 当作新程序，需要重新勾选一次；正式打包后不会。
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
