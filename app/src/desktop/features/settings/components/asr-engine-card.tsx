import { cn } from "cn";
import { Cloud, Loader2, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/shared/ui/button";
import { useCloudAsrStore } from "../cloud-asr-store";
import { CloudAsrForm } from "./cloud-asr-form";
import { ModelManager } from "./model-manager";

export function AsrEngineCard() {
  const status = useCloudAsrStore((state) => state.status);
  const loading = useCloudAsrStore((state) => state.loading);
  const saving = useCloudAsrStore((state) => state.saving);
  const error = useCloudAsrStore((state) => state.error);
  const activeEngine = useCloudAsrStore((state) => state.activeEngine);
  const load = useCloudAsrStore((state) => state.load);
  const setActiveEngine = useCloudAsrStore((state) => state.setActiveEngine);
  const selectLocal = useCloudAsrStore((state) => state.selectLocal);

  useEffect(() => {
    void load();
  }, [load]);

  const cloudEnabled = status?.engine === "bailian";
  const engineLabel = cloudEnabled ? "百炼云端" : "本机 whisper";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Cloud className="size-4 text-muted-foreground" />
            语音识别
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            选择本机 whisper 或百炼云端。云端需要电脑联网与 API Key，音频只发送到你配置的百炼地域。
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          刷新
        </Button>
      </div>

      {status && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-medium">当前生效：{engineLabel}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {cloudEnabled
                ? `${status.config.model}${status.hasKey ? ` · ${status.keyMasked ?? "Key 已保存"}` : ""}`
                : status.localReady
                  ? "本机模型已就绪"
                  : "还没有可用的本机模型"}
            </p>
          </div>
          {cloudEnabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={saving}
              onClick={() => void selectLocal()}
            >
              切回本机
            </Button>
          )}
        </div>
      )}

      <div
        role="tablist"
        aria-label="语音识别引擎"
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeEngine === "local"}
          className={cn(
            "inline-flex h-7 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors",
            activeEngine === "local"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveEngine("local")}
        >
          本机 whisper
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeEngine === "bailian"}
          className={cn(
            "inline-flex h-7 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors",
            activeEngine === "bailian"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveEngine("bailian")}
        >
          百炼云端
        </button>
      </div>

      {loading && !status && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          正在读取语音识别设置…
        </p>
      )}

      {error && !status && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {activeEngine === "local" ? (
        <div className="flex flex-col gap-3">
          {error && status && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          )}
          <ModelManager />
          {cloudEnabled && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              本机模型作为云端失败时的回退；切回本机后下一次录音生效。
            </p>
          )}
        </div>
      ) : (
        <CloudAsrForm />
      )}
    </section>
  );
}
