import {
  DEFAULT_CLIPBOARD_MAX_ITEMS,
  useClipboardStore,
} from "@/desktop/features/clipboard/clipboard-store";
import { ClipboardSection } from "@/desktop/features/clipboard/components/clipboard-section";
import { PageChip } from "@/desktop/shell/page-chips";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageFooter, PageShell } from "@/desktop/shell/page-shell";

/**
 * 内容：剪贴板唯一归属。搜索、置顶、详情、暂停、清空都在这一页；
 * 数据只在本机（~/.sidekick/clipboard.json，0600），语音转写以 voice 类型入库。
 */
export function ContentPage() {
  const snapshot = useClipboardStore((state) => state.snapshot);
  const items = snapshot?.items ?? [];
  const enabled = snapshot?.enabled ?? true;
  const maxItems = snapshot?.maxItems ?? DEFAULT_CLIPBOARD_MAX_ITEMS;

  return (
    <PageShell>
      <PageHeader
        title="内容"
        description="复制过的文字与语音转写；只保存在本机，不联网。"
        chips={
          <>
            <PageChip
              label={enabled ? "正在记录" : "记录已暂停"}
              tone={enabled ? "signal" : "muted"}
            />
            <PageChip label={`${items.length} / ${maxItems} 条`} tone="muted" />
          </>
        }
      />
      <PageBody>
        <ClipboardSection />
      </PageBody>

      <PageFooter>
        <span>小跟班 Sidekick</span>
        <span>v0.1 · 深海声呐</span>
        <span className="ml-auto">Local only · 不联网</span>
      </PageFooter>
    </PageShell>
  );
}
