import { ArrowLeft, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { pushBackHandler } from "@/mobile/system-back";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { ThemeOptions } from "@/shared/ui/theme-options";
import { usePetStore } from "./pet-store";
import { PET_SOUND_LABEL, type PetSoundKind, previewPetSound } from "./sound";
import type { ReduceMotionSetting } from "./types";

type PetSettingsProps = {
  open: boolean;
  onClose: () => void;
};

const REDUCE_OPTIONS: Array<{ value: ReduceMotionSetting; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "on", label: "开启" },
  { value: "off", label: "关闭" },
];

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

/** 设置页分段选项：B 方向用「薄荷水膜 + 1px 信号边」表示选中，不用实色块。 */
function optionClass(active: boolean): string {
  return cn(
    "h-11 rounded-[10px] border text-xs",
    active
      ? "border-signal bg-wash text-foreground"
      : "border-border bg-transparent text-muted-foreground hover:bg-wash hover:text-foreground",
  );
}

/** 设置卡片：mono 章节号 + 中文标题，14px 圆角、1px 描边、无投影。 */
function Section({
  index,
  title,
  children,
  className,
}: {
  index: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[14px] border border-border bg-card p-4", className)}>
      <div className="flex items-baseline gap-2">
        <span
          aria-hidden="true"
          className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground"
        >
          {index}
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function PetSettings({ open, onClose }: PetSettingsProps) {
  const pet = usePetStore((state) => state.pet);
  const setName = usePetStore((state) => state.setName);
  const updateSettings = usePetStore((state) => state.updateSettings);
  const resetPet = usePetStore((state) => state.resetPet);

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

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="宠物设置"
      className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-background px-[calc(env(safe-area-inset-left)+20px)] pt-[calc(env(safe-area-inset-top)+12px)] pr-[calc(env(safe-area-inset-right)+20px)] pb-[calc(env(safe-area-inset-bottom)+16px)] text-foreground"
    >
      <header className="flex min-h-11 shrink-0 items-center gap-2">
        <Button
          autoFocus
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="返回宠物"
          className="size-11 shrink-0 rounded-full border border-border text-muted-foreground hover:bg-wash hover:text-foreground"
          onClick={onClose}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-[21px] leading-[1.2] font-semibold tracking-[-0.01em]">
            宠物设置
          </h1>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
            SETTINGS · 只存在本机
          </span>
        </div>
      </header>

      {settingsError && (
        <p
          role="alert"
          className="mt-2 shrink-0 rounded-[12px] border border-destructive bg-card px-3 py-2 text-sm text-destructive"
        >
          {settingsError}
        </p>
      )}

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto pb-4">
        <Section index="01" title="名字">
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
              className="h-11 flex-1 rounded-[12px]"
            />
            <Button type="submit" className="h-11 rounded-[12px]" disabled={savingName}>
              保存
            </Button>
          </form>
          <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
            <span>名字只存在本机</span>
            <span>{Array.from(draftName).length}/8</span>
          </div>
          {nameError && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {nameError}
            </p>
          )}
        </Section>

        <Section index="02" title="反馈">
          <div className="mt-2 flex min-h-12 items-center justify-between gap-3 border-t border-border pt-2">
            <div>
              <Label htmlFor="pet-haptics">震动</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">录音与 AI 提醒时轻震</p>
            </div>
            <Switch
              id="pet-haptics"
              checked={pet.settings.haptics}
              onCheckedChange={(checked) => void update({ haptics: checked })}
            />
          </div>
          <div className="mt-2 flex min-h-12 items-center justify-between gap-3 border-t border-border pt-2">
            <div>
              <Label htmlFor="pet-sound">声音</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">开工/提问/完成时的短提示音</p>
            </div>
            <Switch
              id="pet-sound"
              checked={pet.settings.sound}
              onCheckedChange={(checked) => void update({ sound: checked })}
            />
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              试听 · SOUND
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {SOUND_PREVIEWS.map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  variant="outline"
                  className={optionClass(false)}
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
        </Section>

        <Section index="03" title="外观">
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            只影响本机界面；默认跟随系统，界面与宠物舞台一起跟随。
          </p>
          <ThemeOptions className="mt-3 [&_button]:h-11" />
        </Section>

        <Section index="04" title="显示">
          <div className="mt-2 border-t border-border pt-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              减少动效 · MOTION
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {REDUCE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant="outline"
                  className={optionClass(pet.settings.reduceMotion === option.value)}
                  onClick={() => void update({ reduceMotion: option.value })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex min-h-12 items-center justify-between gap-3 border-t border-border pt-3">
            <div>
              <Label htmlFor="pet-keep-awake">屏幕常亮</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">放在桌边时不自动熄屏，会更耗电</p>
            </div>
            <Switch
              id="pet-keep-awake"
              checked={pet.settings.keepAwake}
              onCheckedChange={(checked) => void update({ keepAwake: checked })}
            />
          </div>
          {pet.settings.keepAwake && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                最长常亮 · KEEP AWAKE
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {KEEP_AWAKE_HOUR_OPTIONS.map((hours) => (
                  <Button
                    key={hours}
                    type="button"
                    variant="outline"
                    className={optionClass(pet.settings.keepAwakeHours === hours)}
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
          <div className="mt-3 border-t border-border pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              无操作自动变暗 · DIM
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {DIM_OPTIONS.map((minutes) => (
                <Button
                  key={minutes}
                  type="button"
                  variant="outline"
                  className={optionClass(pet.settings.dimMinutes === minutes)}
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
        </Section>

        <Section index="05" title="重置宠物">
          {resetConfirm ? (
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-sm text-foreground">要让我重新认识你吗？</p>
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 hover:bg-wash"
                  onClick={() => setResetConfirm(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11"
                  onClick={() => void confirmReset()}
                >
                  确认重置
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="mt-3 h-11 rounded-[12px] border-destructive text-destructive hover:bg-transparent hover:text-destructive"
              onClick={() => setResetConfirm(true)}
            >
              <RotateCcw className="size-4" />
              重置宠物
            </Button>
          )}
        </Section>

        <Section index="06" title="关于" className="text-xs leading-relaxed text-muted-foreground">
          <p className="mt-2">宠物数据只存在本机，卸载会丢失；没有账号和云同步。</p>
          <p className="mt-1 font-mono">Sidekick 0.1.0</p>
        </Section>
      </div>
    </section>
  );
}
