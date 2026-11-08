import { useState } from "react";
import { ClipboardSection } from "@/desktop/features/clipboard/components/clipboard-section";
import { MemoSection } from "@/desktop/features/memo/memo-section";
import { SegmentedControl } from "@/desktop/shell/segmented-control";

type ContentTab = "clipboard" | "memo";

const TABS: ReadonlyArray<{ value: ContentTab; label: string }> = [
  { value: "clipboard", label: "剪贴板" },
  { value: "memo", label: "备忘录" },
];

/**
 * 剪贴板（一级页 ⌘2，D119；视图 id 仍叫 `content`）：剪贴板唯一归属。
 *
 * D115/D118 起同页加「剪贴板 / 备忘录」分段，不新增一级页；备忘录段是
 * 手机的只读镜像，数据来自桌面 SQLite。
 */
function initialTab(): ContentTab {
  if (typeof window === "undefined") return "clipboard";
  return new URLSearchParams(window.location.search).get("tab") === "memo" ? "memo" : "clipboard";
}

export function ContentPage() {
  const [tab, setTab] = useState<ContentTab>(initialTab);
  const segment = (
    <SegmentedControl<ContentTab>
      label="剪贴板与备忘录"
      className="w-[220px]"
      value={tab}
      options={TABS}
      onChange={setTab}
    />
  );
  return tab === "clipboard" ? (
    <ClipboardSection topSlot={segment} />
  ) : (
    <MemoSection topSlot={segment} />
  );
}
