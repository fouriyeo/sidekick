import { ClipboardSection } from "@/desktop/features/clipboard/components/clipboard-section";

/**
 * 内容：剪贴板唯一归属。
 *
 * 整页（页头计数 / 清空、搜索、暂停开关、记录列表）都由 `ClipboardSection` 渲染，
 * 页面只负责挂载，避免页面壳与分组列表各写一套。
 */
export function ContentPage() {
  return <ClipboardSection />;
}
