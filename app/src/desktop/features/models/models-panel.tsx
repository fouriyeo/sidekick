import { Cloud, Loader2, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/shared/ui/button";
import { CloudAsrForm } from "./cloud-asr-form";
import { useCloudAsrStore } from "./cloud-asr-store";
import { UsageStatsPanel } from "./usage-stats";
import { useUsageStore } from "./usage-store";

export function ModelsPanel() {
  const cloudLoading = useCloudAsrStore((state) => state.loading);
  const usageLoading = useUsageStore((state) => state.loading);
  const loadCloud = useCloudAsrStore((state) => state.load);
  const loadUsage = useUsageStore((state) => state.load);

  useEffect(() => {
    void loadCloud();
    void loadUsage();
  }, [loadCloud, loadUsage]);

  // 桌面窗口重新获得焦点时刷新用量：用户通常在手机上说话，回到电脑即可看到新账。
  useEffect(() => {
    const onFocus = () => void loadUsage();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadUsage]);

  const refreshing = cloudLoading || usageLoading;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Cloud className="size-4 text-muted-foreground" />
            模型
          </h2>
          <p className="mt-1 font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
            Models · 百炼云端
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={refreshing}
          aria-label="刷新模型与用量"
          onClick={() => {
            void loadCloud();
            void loadUsage();
          }}
        >
          {refreshing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          刷新
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        <section aria-label="百炼配置" className="rounded-xl border border-border bg-popover p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">百炼云端语音识别</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                按住说话时，桌面会把 16k 音频实时发给百炼，最终文本只输入一次；录音不保存。
              </p>
            </div>
          </div>
          <div className="mt-3">
            <CloudAsrForm />
          </div>
        </section>

        <UsageStatsPanel />
      </div>
    </section>
  );
}
