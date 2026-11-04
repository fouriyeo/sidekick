import { Cloud, Wallet } from "lucide-react";
import { useEffect } from "react";
import { Card } from "@/desktop/shell/card";
import { StateTag } from "@/desktop/shell/page-chips";
import { CloudAsrForm } from "./cloud-asr-form";
import { useCloudAsrStore } from "./cloud-asr-store";
import { UsageStatsPanel } from "./usage-stats";
import { useUsageStore } from "./usage-store";

/**
 * 系统 › 语音：「配置」与「用量」同页左右两段，改完 Key 立刻看到花销；
 * 区间切换与明细都在同一张卡里。页头「刷新」由系统页触发本组件的 load。
 */
export function ModelsSection() {
  const cloudStatus = useCloudAsrStore((state) => state.status);
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

  const configured = cloudStatus?.configured ?? false;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto pr-0.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
      <Card
        title={
          <>
            <Cloud aria-hidden="true" />
            百炼配置
          </>
        }
        subtitle="CLOUD ASR · KEY 只存本机"
        pill={
          <StateTag
            label={configured ? "已配置" : "未配置"}
            tone={configured ? "signal" : "muted"}
          />
        }
        className="lg:min-h-0"
        bodyClassName="lg:min-h-0 lg:overflow-y-auto lg:pr-0.5"
      >
        <CloudAsrForm />
      </Card>

      <div className="lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
        <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
          <Wallet aria-hidden="true" className="size-3.5 text-muted-foreground" />
          用量
          <span className="font-mono text-[9px] font-normal tracking-[0.13em] text-muted-foreground uppercase">
            USAGE · 人民币估算
          </span>
        </div>
        <UsageStatsPanel />
      </div>
    </div>
  );
}
