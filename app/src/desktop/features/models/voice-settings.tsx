import { useEffect } from "react";
import { MemoPairPanel } from "@/desktop/features/memo/memo-pair-panel";
import { CloudAsrForm } from "@/desktop/features/models/cloud-asr-form";
import { useCloudAsrStore } from "@/desktop/features/models/cloud-asr-store";
import { KeywordsPanel } from "@/desktop/features/models/keywords-panel";
import { UsageStatsPanel } from "@/desktop/features/models/usage-stats";
import { useUsageStore } from "@/desktop/features/models/usage-store";
import { HotkeyCard } from "@/desktop/features/settings/hotkey-card";

/**
 * 语音页（一级页，D104）的三段内容：百炼配置 / 关键词 / 语音用量，纵向排列，
 * 页内不再 push 二级页（D101 收掉的三层结构不再回来）。
 * 数据在进入页面时读一次，窗口重新获得焦点时再刷新（用户通常在手机上说话）。
 */
export function VoiceSettings() {
  const loadCloud = useCloudAsrStore((state) => state.load);
  const loadUsage = useUsageStore((state) => state.load);

  useEffect(() => {
    void loadCloud();
    void loadUsage();
  }, [loadCloud, loadUsage]);

  useEffect(() => {
    const onFocus = () => {
      void loadCloud();
      void loadUsage();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadCloud, loadUsage]);

  return (
    <>
      <HotkeyCard />
      <CloudAsrForm />
      <MemoPairPanel />
      <KeywordsPanel />
      <UsageStatsPanel />
    </>
  );
}
