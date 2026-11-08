import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ListGroup, ListRow } from "@/desktop/shell/list";
import { type MemoPairCode, memoPairCodeCreate, normalizeError } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

function remainLabel(expiresAt: number, now: number): string {
  const left = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

/**
 * 语音页的「手机备忘录」卡：生成一次性配对码。
 *
 * 手机输入 6 位码后，用这条已连接的 WS 换回同步 token 与电脑上的百炼 Key；
 * 码 2 分钟过期、错 3 次作废。电脑端没有 Key 时仍可完成配对，只是不同步 Key。
 */
export function MemoPairPanel() {
  const [open, setOpen] = useState(false);
  const [pair, setPair] = useState<MemoPairCode | null>(null);
  const [now, setNow] = useState(Date.now());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const expired = pair !== null && pair.expiresAt <= now;

  async function create() {
    if (creating) return;
    setCreating(true);
    try {
      const result = await memoPairCodeCreate();
      setPair(result);
      setNow(Date.now());
      setOpen(true);
    } catch (error) {
      toast.error(normalizeError(error));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <ListGroup title="手机备忘录">
        <ListRow
          title="配对手机 / 发送 Key"
          detail="一次性 6 位码，2 分钟内有效"
          chevron
          onClick={() => void create()}
        />
        <ListRow title="电脑端只读" detail="手机录音 → 局域网镜像；修改和删除都在手机上" />
      </ListGroup>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>配对手机</DialogTitle>
            <DialogDescription>
              在手机「设置 › 从电脑配对」输入下面这 6 位码。配对成功后会自动接收 Key 和同步凭据。
            </DialogDescription>
          </DialogHeader>

          <fieldset
            aria-label="配对码"
            className="m-0 flex flex-col items-center gap-2 border-0 p-2"
          >
            <span className="text-[36px] leading-none font-semibold tracking-[0.24em] tabular-nums text-foreground">
              {pair ? pair.code : "······"}
            </span>
            <span
              className={
                expired ? "text-[12px] text-destructive" : "text-[12px] text-muted-foreground"
              }
            >
              {pair
                ? expired
                  ? "已过期，请重新生成"
                  : `剩余 ${remainLabel(pair.expiresAt, now)}`
                : "正在生成…"}
            </span>
          </fieldset>

          <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-[1.5] text-muted-foreground">
            <li>手机和电脑连同一个局域网（当前连接已建立）。</li>
            <li>手机打开「设置 › 从电脑配对」，输入这 6 位码。</li>
            <li>配对成功后，手机备忘录会自动同步到「剪贴板 › 备忘录」。</li>
          </ol>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              关闭
            </Button>
            <Button type="button" disabled={creating} onClick={() => void create()}>
              {expired ? "重新生成" : "换一个码"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
