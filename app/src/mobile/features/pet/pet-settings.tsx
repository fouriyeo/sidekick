import { ArrowLeft, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { usePetStore } from "./pet-store";
import { POSTURE_LABEL } from "./posture";
import type { Posture, ReduceMotionSetting } from "./types";

type PetSettingsProps = {
  open: boolean;
  onClose: () => void;
};

const REDUCE_OPTIONS: Array<{ value: ReduceMotionSetting; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "on", label: "开启" },
  { value: "off", label: "关闭" },
];

const POSTURES: Posture[] = ["docked", "handheld"];

function validateName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "叫小跟班也可以。";
  if (/[\r\n]/.test(trimmed)) return "名字里不要换行。";
  if (trimmed.includes("/") || trimmed.includes("://") || /^www\./i.test(trimmed)) {
    return "名字短一点，它记得住。";
  }

  const count = Array.from(trimmed).length;
  if (count < 1 || count > 8) return "名字短一点，它记得住。";
  return null;
}

export function PetSettings({ open, onClose }: PetSettingsProps) {
  const pet = usePetStore((state) => state.pet);
  const setName = usePetStore((state) => state.setName);
  const setPosture = usePetStore((state) => state.setPosture);
  const updateSettings = usePetStore((state) => state.updateSettings);
  const resetPet = usePetStore((state) => state.resetPet);
  const handleGesture = usePetStore((state) => state.handleGesture);

  const [draftName, setDraftName] = useState(pet.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftName(pet.name);
    setNameError(null);
    setSettingsError(null);
    setResetConfirm(false);
  }, [open, pet.name]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function saveName() {
    const error = validateName(draftName);
    if (error) {
      setNameError(error);
      return;
    }

    setSavingName(true);
    const saved = await setName(draftName.trim());
    setSavingName(false);

    if (!saved) {
      setSettingsError("没保存上，再试一次。");
      return;
    }
    setNameError(null);
    setSettingsError(null);
  }

  async function update(patch: Partial<typeof pet.settings>) {
    const saved = await updateSettings(patch);
    setSettingsError(saved ? null : "没保存上，再试一次。");
  }

  async function confirmReset() {
    await resetPet();
    setResetConfirm(false);
    onClose();
  }

  function accessiblePoke() {
    onClose();
    window.setTimeout(() => handleGesture({ type: "poke", at: Date.now() }), 120);
  }

  function accessiblePet() {
    onClose();
    window.setTimeout(() => {
      handleGesture({ type: "pet-start", at: Date.now() });
      window.setTimeout(
        () => handleGesture({ type: "pet-end", at: Date.now(), duration: 3200 }),
        3200,
      );
    }, 120);
  }

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="宠物设置"
      className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-background px-[calc(env(safe-area-inset-left)+24px)] pt-[calc(env(safe-area-inset-top)+16px)] pr-[calc(env(safe-area-inset-right)+24px)] pb-[calc(env(safe-area-inset-bottom)+16px)] text-foreground"
    >
      <header className="flex shrink-0 items-center gap-3">
        <Button
          autoFocus
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="返回宠物"
          className="size-11 rounded-full"
          onClick={onClose}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-xl font-semibold">宠物设置</h1>
      </header>

      {settingsError && (
        <p
          role="alert"
          className="mt-2 shrink-0 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {settingsError}
        </p>
      )}

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pb-4 landscape:grid-cols-2">
        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">名字</h2>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void saveName();
              }}
            >
              <Input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                maxLength={8}
                aria-label="宠物名字"
                autoComplete="off"
                className="h-10 flex-1"
              />
              <Button type="submit" className="h-10" disabled={savingName}>
                保存
              </Button>
            </form>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>只存在本机</span>
              <span>{Array.from(draftName).length}/8</span>
            </div>
            {nameError && (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {nameError}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">姿态</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {POSTURES.map((posture) => (
                <Button
                  key={posture}
                  type="button"
                  variant={pet.settings.posture === posture ? "default" : "outline"}
                  className="h-10"
                  onClick={() => void setPosture(posture)}
                >
                  {POSTURE_LABEL[posture]}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              手动切换，默认支架；自动判定后续接入。
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">无障碍互动</h2>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1"
                onClick={accessiblePet}
              >
                摸摸它
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1"
                onClick={accessiblePoke}
              >
                戳一下
              </Button>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">反馈</h2>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="pet-haptics">震动</Label>
                <p className="mt-1 text-xs text-muted-foreground">触摸/录音时轻震</p>
              </div>
              <Switch
                id="pet-haptics"
                checked={pet.settings.haptics}
                onCheckedChange={(checked) => void update({ haptics: checked })}
              />
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>声音</span>
              <span className="text-xs">暂未接入</span>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">显示</h2>
            <p className="mt-3 text-xs text-muted-foreground">减少动效</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {REDUCE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={pet.settings.reduceMotion === option.value ? "default" : "outline"}
                  className="h-9 text-xs"
                  onClick={() => void update({ reduceMotion: option.value })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>屏幕常亮</span>
              <span className="text-xs">暂未接入</span>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">重置宠物</h2>
            {resetConfirm ? (
              <div className="mt-3">
                <p className="text-sm text-foreground">要让我重新认识你吗？</p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setResetConfirm(false)}>
                    取消
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => void confirmReset()}>
                    确认重置
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => setResetConfirm(true)}
              >
                <RotateCcw className="size-4" />
                重置宠物
              </Button>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
            <h2 className="text-sm font-semibold text-foreground">关于</h2>
            <p className="mt-2">宠物数据只存在本机，卸载会丢失；没有账号和云同步。</p>
            <p className="mt-1">Sidekick 0.1.0</p>
          </section>
        </div>
      </div>
    </section>
  );
}
