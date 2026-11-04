import { useEffect, useState } from "react";
import deepSea from "@/mobile/styles/deep-sea.module.css";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { usePetStore } from "./pet-store";

type NamePromptProps = {
  open: boolean;
};

/**
 * 首次命名弹层：落在宠物舞台上，所以两套主题里都保持深海舷窗表面，
 * 不用跟随全局的 --card（浅色主题下会变成海玻璃白，和 pet 文本撞对比）。
 */
export function NamePrompt({ open }: NamePromptProps) {
  const name = usePetStore((state) => state.pet.name);
  const setName = usePetStore((state) => state.setName);
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState(name || "小跟班");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }

    setDraft(name || "小跟班");
    const timer = window.setTimeout(() => setVisible(true), 1500);
    return () => window.clearTimeout(timer);
  }, [open, name]);

  if (!open || !visible) return null;

  const count = Array.from(draft).length;

  async function submit(value: string) {
    if (saving) return;
    setSaving(true);
    await setName(value.trim() || "小跟班");
    setSaving(false);
    setVisible(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" role="presentation">
      <div aria-hidden="true" className="absolute inset-0 bg-black opacity-40" />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="pet-name-title"
        className={cn(
          "relative w-[86vw] max-w-[420px] rounded-[14px] border border-pet-border p-5 text-pet-text",
          deepSea.surface,
        )}
        onSubmit={(event) => {
          event.preventDefault();
          void submit(draft);
        }}
      >
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-pet-ask">
          FIRST DIVE · 初次见面
        </span>
        <h2
          id="pet-name-title"
          className="mt-2 text-[21px] leading-[1.3] font-semibold tracking-[-0.01em]"
        >
          你来了。叫我什么？
        </h2>
        <p className="mt-1 text-sm text-pet-muted">1–8 个字符，也可以先这样叫我。</p>

        <Input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={8}
          aria-label="宠物名字"
          autoComplete="off"
          className="mt-4 h-12 rounded-[12px] border-pet-input bg-transparent text-base text-pet-text placeholder:text-pet-muted focus-visible:border-pet-signal focus-visible:ring-pet-signal"
        />

        <div className="mt-1 flex justify-between font-mono text-[10px] text-pet-muted">
          <span>名字只存在本机</span>
          <span>{count}/8</span>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-11 text-pet-muted hover:bg-transparent hover:text-pet-text"
            disabled={saving}
            onClick={() => void submit("小跟班")}
          >
            先这样叫我
          </Button>
          <Button
            type="submit"
            className="h-11 rounded-[12px] bg-pet-primary text-pet-primary-foreground hover:brightness-105"
            disabled={saving || count === 0}
          >
            就叫这个
          </Button>
        </div>
      </form>
    </div>
  );
}
