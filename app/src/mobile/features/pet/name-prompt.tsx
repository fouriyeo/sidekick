import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { usePetStore } from "./pet-store";

type NamePromptProps = {
  open: boolean;
};

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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-6"
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="pet-name-title"
        className="w-[min(420px,86vw)] rounded-3xl border border-pet-border bg-card p-6 text-pet-text shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(draft);
        }}
      >
        <h2 id="pet-name-title" className="text-lg font-semibold">
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
          className="mt-4 h-12 text-base"
        />

        <div className="mt-1 flex justify-between text-xs text-pet-muted">
          <span>名字只存在本机</span>
          <span>{count}/8</span>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => void submit("小跟班")}
          >
            先这样叫我
          </Button>
          <Button type="submit" disabled={saving || count === 0}>
            就叫这个
          </Button>
        </div>
      </form>
    </div>
  );
}
