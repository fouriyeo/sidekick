import { ArrowLeft, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { pushBackHandler } from "@/mobile/system-back";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { usePetStore } from "./pet-store";
import { POSTURE_LABEL } from "./posture";
import { PET_SOUND_LABEL, type PetSoundKind, previewPetSound } from "./sound";
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

/** 宠物页无操作后自动变暗的分钟数选项。 */
const DIM_OPTIONS = [1, 2, 5, 10, 15, 30] as const;

/** 屏幕常亮最长小时数选项；0 表示不限。 */
const KEEP_AWAKE_HOUR_OPTIONS = [1, 2, 4, 8, 0] as const;

const SOUND_PREVIEWS: PetSoundKind[] = ["work-start", "ask", "complete"];

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

  // Android 返回键与页内「返回宠物」同一条路径；重置确认先收起，再退出设置。
  const handleBack = useCallback(() => {
    if (resetConfirm) setResetConfirm(false);
    else onClose();
    return true;
  }, [onClose, resetConfirm]);

  // 用 ref 持有最新处理函数，避免重置确认状态变化时反复压栈/出栈。
  const handleBackRef = useRef(handleBack);
  handleBackRef.current = handleBack;

  useEffect(() => {
    if (!open) return;
    return pushBackHandler(() => handleBackRef.current());
  }, [open]);

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
          className="mt-2 shrink-0 rounded-xl border border-destructive bg-card px-3 py-2 text-sm text-destructive"
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
              横屏自动支架、竖屏自动手持；可手动覆盖，下次旋转恢复自动。
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
            <div className="mt-4 flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="pet-sound">声音</Label>
                <p className="mt-1 text-xs text-muted-foreground">开工/提问/完成时的短提示音</p>
              </div>
              <Switch
                id="pet-sound"
                checked={pet.settings.sound}
                onCheckedChange={(checked) => void update({ sound: checked })}
              />
            </div>
            <div className="mt-3">
              <p className="text-xs text-muted-foreground">试听</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {SOUND_PREVIEWS.map((kind) => (
                  <Button
                    key={kind}
                    type="button"
                    variant="outline"
                    className="h-9 text-xs"
                    onClick={() => previewPetSound(kind)}
                  >
                    {PET_SOUND_LABEL[kind]}
                  </Button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              只在宠物页前台播放；录音时不响；系统静音/勿扰可能无法完全遵守。
            </p>
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
            <div className="mt-4 flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="pet-keep-awake">屏幕常亮</Label>
                <p className="mt-1 text-xs text-muted-foreground">放在桌边时不自动熄屏，会更耗电</p>
              </div>
              <Switch
                id="pet-keep-awake"
                checked={pet.settings.keepAwake}
                onCheckedChange={(checked) => void update({ keepAwake: checked })}
              />
            </div>
            {pet.settings.keepAwake && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground">最长常亮</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {KEEP_AWAKE_HOUR_OPTIONS.map((hours) => (
                    <Button
                      key={hours}
                      type="button"
                      variant={pet.settings.keepAwakeHours === hours ? "default" : "outline"}
                      className="h-9 text-xs"
                      onClick={() => void update({ keepAwakeHours: hours })}
                    >
                      {hours === 0 ? "不限" : `${hours} 小时`}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  到点交给系统自动熄屏；点亮屏幕回到宠物页后重新计时。
                </p>
              </div>
            )}
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">无操作自动变暗</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {DIM_OPTIONS.map((minutes) => (
                  <Button
                    key={minutes}
                    type="button"
                    variant={pet.settings.dimMinutes === minutes ? "default" : "outline"}
                    className="h-9 text-xs"
                    onClick={() => void update({ dimMinutes: minutes })}
                  >
                    {minutes} 分钟
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                宠物页无操作后自动变暗，触摸即恢复，防止屏幕长时间静止。
              </p>
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
