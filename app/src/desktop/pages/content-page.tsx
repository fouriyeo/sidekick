import { ClipboardSection } from "@/desktop/features/clipboard/components/clipboard-section";

/**
 * 剪贴板（一级页 ⌘1，D119；视图 id 仍叫 `content`）。
 *
 * 默认页与兜底页是「用量」（D143 删「概览」后同日定为用量看板），这里只是 ⌘1。
 *
 * D123 起备忘录已独立成一级页，这里只负责剪贴板，不再有页内分段。
 */
export function ContentPage() {
  return <ClipboardSection />;
}
