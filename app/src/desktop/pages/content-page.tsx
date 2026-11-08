import { ClipboardSection } from "@/desktop/features/clipboard/components/clipboard-section";

/**
 * 剪贴板（一级页 ⌘2，D119；视图 id 仍叫 `content`）。
 *
 * D123 起备忘录已独立成一级页，这里只负责剪贴板，不再有页内分段。
 */
export function ContentPage() {
  return <ClipboardSection />;
}
