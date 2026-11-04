import { Clipboard, Pause, Play, SunMoon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useClipboardStore } from "@/desktop/features/clipboard/clipboard-store";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { ThemeOptions } from "@/shared/ui/theme-options";
import { AccessibilityCard } from "./accessibility-card";

type SettingsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const snapshot = useClipboardStore((state) => state.snapshot);
  const refreshClipboard = useClipboardStore((state) => state.refresh);
  const setEnabled = useClipboardStore((state) => state.setEnabled);
  const clear = useClipboardStore((state) => state.clear);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) void refreshClipboard();
  }, [open, refreshClipboard]);

  const enabled = snapshot?.enabled ?? true;
  const count = snapshot?.items.length ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto rounded-l-xl border-l border-border bg-card p-0 shadow-popover sm:max-w-[480px] data-[side=right]:sm:max-w-[480px]"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SectionLabel>Settings · 桌面</SectionLabel>
          <SheetTitle className="mt-1">桌面设置</SheetTitle>
          <SheetDescription>外观、辅助功能与本机剪贴板。</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-6 py-6">
          <section className="flex flex-col gap-3">
            <div>
              <SectionLabel>Appearance · 双主题</SectionLabel>
              <h3 className="mt-1 flex items-center gap-2 text-sm font-semibold">
                <SunMoon className="size-4 text-muted-foreground" />
                外观
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                只影响本机界面；默认跟随系统，界面与宠物舞台一起跟随。
              </p>
            </div>
            <ThemeOptions />
          </section>

          <div className="border-t border-border" />

          <AccessibilityCard />

          <div className="border-t border-border" />

          <section className="flex flex-col gap-3">
            <div>
              <SectionLabel>Clipboard · 本机历史</SectionLabel>
              <h3 className="mt-1 flex items-center gap-2 text-sm font-semibold">
                <Clipboard className="size-4 text-muted-foreground" />
                剪贴板历史
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                只记录文本；密码管理器标记为隐藏的内容不会记录。数据仅保存在本机。
              </p>
            </div>

            <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border bg-popover px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium">{enabled ? "正在记录" : "记录已暂停"}</p>
                <p className="mt-0.5 font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">
                  当前 {count} 条
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void setEnabled(!enabled)}
                >
                  {enabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  {enabled ? "暂停" : "继续"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={count === 0}
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="size-3.5" />
                  清空
                </Button>
              </div>
            </div>
          </section>
        </div>
      </SheetContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <p className="font-mono text-[9px] tracking-[0.16em] text-destructive uppercase">
            确认 · 破坏性操作
          </p>
          <DialogHeader>
            <DialogTitle>清空剪贴板历史？</DialogTitle>
            <DialogDescription>所有记录都会被删除，且不能恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void clear().then(() => setConfirmOpen(false));
              }}
            >
              清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
