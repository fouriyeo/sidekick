import { useEffect } from "react";
import { CloudAsrForm } from "./cloud-asr-form";
import { useCloudAsrStore } from "./cloud-asr-store";
import { UsageStatsPanel } from "./usage-stats";
import { useUsageStore } from "./usage-store";

/**
 * 设置 › 语音输入：百炼配置与语音用量单列两组（组间距 24）。
 *
 * 页头与返回由设置页壳负责；这里只管两张分组列表，不做左右分栏。
 */
export function ModelsSection() {
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

  return (
    <div className="flex flex-col gap-6">
      <CloudAsrForm />
      <UsageStatsPanel />
    </div>
  );
}
