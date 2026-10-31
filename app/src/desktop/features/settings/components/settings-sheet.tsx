import { Clipboard, Pause, Play, Trash2 } from "lucide-react";
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
import { AccessibilityCard } from "./accessibility-card";
import { ModelManager } from "./model-manager";

type SettingsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

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
      <SheetContent side="right" className="w-full overflow-y-auto bg-background sm:max-w-[480px]">
        <SheetHeader className="border-b border-border">
          <SheetTitle>桌面设置</SheetTitle>
          <SheetDescription>语音模型、自动输入权限与剪贴板。</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <ModelManager />
          <div className="my-5 border-t border-border" />
          <AccessibilityCard />
          <div className="my-5 border-t border-border" />

          <section className="flex flex-col gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Clipboard className="size-4 text-muted-foreground" />
                剪贴板历史
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                只记录文本；密码管理器标记为隐藏的内容不会记录。数据仅保存在本机。
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
              <div>
                <p className="text-xs font-medium">{enabled ? "正在记录" : "记录已暂停"}</p>
                <p className="text-[11px] text-muted-foreground">当前 {count} 条</p>
              </div>
              <div className="flex items-center gap-1.5">
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
