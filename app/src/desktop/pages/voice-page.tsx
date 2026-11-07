import { VoiceSettings } from "@/desktop/features/models/voice-settings";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageShell } from "@/desktop/shell/page-shell";

/**
 * 语音（一级页，D104）：百炼配置 / 关键词 / 语音用量三段在同一页内纵向排列，
 * 内部不再 push 二级页（D101 收掉的三层结构不再回来）。
 */
export function VoicePage() {
  return (
    <PageShell>
      <PageHeader title="语音" />
      <PageBody>
        <VoiceSettings />
      </PageBody>
    </PageShell>
  );
}
