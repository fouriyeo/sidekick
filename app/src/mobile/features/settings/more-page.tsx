import { cn } from "cn";
import { ChevronRight, MessageCircle, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnectionView } from "@/mobile/features/connect/connection-view";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import { PET_SOUND_LABEL, type PetSoundKind, previewPetSound } from "@/mobile/features/pet/sound";
import type { ReduceMotionSetting } from "@/mobile/features/pet/types";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { MobileTabBar } from "@/mobile/shell/tab-bar";
import { pushBackHandler } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { SignalBars } from "@/shared/ui/signal-bars";
import { ThemeOptions } from "@/shared/ui/theme-options";
import { Toggle } from "./toggle";

const REDUCE_OPTIONS: Array<{ value: ReduceMotionSetting; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "on", label: "开启" },
  { value: "off", label: "关闭" },
];

/** 无操作自动变暗的分钟数选项。 */
const DIM_OPTIONS = [1, 2, 5, 10, 15, 30] as const;

/** 屏幕常亮最长小时数选项；0 表示不限。 */
const KEEP_AWAKE_HOUR_OPTIONS = [1, 2, 4, 8, 0] as const;

const SOUND_PREVIEWS: PetSoundKind[] = ["work-start", "ask", "complete"];

/** 设置页分段选项：选中 = 薄荷水膜 + 1px 信号边，不用实色块。 */
function optionClass(active: boolean): string {
  return cn(
    "h-11 min-w-0 rounded-[10px] border px-1 text-xs",
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
    <section className={cn("rounded-[14px] border border-border bg-card p-3.5", className)}>
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

/** 设置行：标题 + 副行 + 右侧控件；整行 ≥44。 */
function SettingRow({
  title,
  description,
  htmlFor,
  children,
}: {
  title: string;
  description: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-1 flex min-h-12 items-center justify-between gap-3 border-t border-border pt-1.5 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <Label htmlFor={htmlFor} className="text-sm">
          {title}
        </Label>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ChoiceRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-2 border-t border-border pt-2">
      <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {title}
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">{children}</div>
    </div>
  );
}

/**
 * 更多（设置）页：底部第三档，整页非弹层。
 *
 * 分组顺序参照方向 A：连接 / 外观 / 反馈 / 显示 / 数据与关于（重置在这里）/ 消息通道。
 * 不再有宠物名字；所有可点控件 ≥44dp；断线沿连接页排障。
 */
export function MorePage() {
  const pet = usePetStore((state) => state.pet);
  const updateSettings = usePetStore((state) => state.updateSettings);
  const resetPet = usePetStore((state) => state.resetPet);
  const connection = useConnectionView();
  const openOffline = useUiStore((state) => state.openOffline);
  const setView = useUiStore((state) => state.setView);

  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  // 重置确认展开时先消费返回键收起确认，再交给根页面（返回宠物）。
  const resetConfirmRef = useRef(resetConfirm);
  resetConfirmRef.current = resetConfirm;
  useEffect(() => {
    return pushBackHandler(() => {
      if (!resetConfirmRef.current) return false;
      setResetConfirm(false);
      return true;
    });
  }, []);

  const update = useCallback(
    async (patch: Partial<typeof pet.settings>) => {
      const saved = await updateSettings(patch);
      setSettingsError(saved ? null : "没保存上，再试一次。");
    },
    [updateSettings],
  );

  async function confirmReset() {
    await resetPet();
    setResetConfirm(false);
  }

  return (
    <MobilePage aria-label="更多">
      <PageHeader title="更多" sub="设置 · 只影响这台手机" />

      <PageScroll className="pb-[calc(env(safe-area-inset-bottom)+80px)]">
        {settingsError && (
          <p
            role="alert"
            className="mb-2 rounded-[12px] border border-destructive bg-card px-3 py-2 text-sm text-destructive"
          >
            {settingsError}
          </p>
        )}

        <Section index="01" title="连接">
          <button
            type="button"
            aria-label={`连接状态：${connection.label}，点按查看连接`}
            className="mt-1.5 flex min-h-12 w-full items-center gap-2 border-t border-border pt-1.5 text-left first:border-t-0 first:pt-0"
            onClick={openOffline}
          >
            <SignalBars level={connection.level} tone={connection.tone} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {connection.label}
                {connection.detail ? ` · ${connection.detail}` : ""}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground">
                局域网直连 · 断线自动重连
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-0.5 font-mono text-[10px] text-muted-foreground">
              查看连接
              <ChevronRight aria-hidden="true" className="size-3.5" />
            </span>
          </button>
        </Section>

        <Section index="02" title="外观" className="mt-2.5">
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            平台默认跟随系统（D76）；宠物舞台一起跟随，浅色是海玻璃。
          </p>
          <ThemeOptions className="mt-2 [&_button]:h-11" />
        </Section>

        <Section index="03" title="反馈" className="mt-2.5">
          <SettingRow
            title="震动"
            description="录音、反问与完成时轻震，跟随系统触感"
            htmlFor="pet-haptics"
          >
            <Toggle
              id="pet-haptics"
              label="震动"
              checked={pet.settings.haptics}
              onCheckedChange={(checked) => void update({ haptics: checked })}
            />
          </SettingRow>
          <SettingRow title="AI 音效" description="只在手机前台、未录音时播放" htmlFor="pet-sound">
            <Toggle
              id="pet-sound"
              label="AI 音效"
              checked={pet.settings.sound}
              onCheckedChange={(checked) => void update({ sound: checked })}
            />
          </SettingRow>
          <ChoiceRow title="试听 · SOUND" description="点按播放一次提示音">
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
          </ChoiceRow>
          <ChoiceRow title="减少动效 · MOTION" description="平台开启后冻结宠物呼吸与循环动画">
            {REDUCE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                className={optionClass(pet.settings.reduceMotion === option.value)}
                aria-pressed={pet.settings.reduceMotion === option.value}
                onClick={() => void update({ reduceMotion: option.value })}
              >
                {option.label}
              </Button>
            ))}
          </ChoiceRow>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            只在宠物页前台播放；录音时不响；系统静音/勿扰可能无法完全遵守。
          </p>
        </Section>

        <Section index="04" title="显示" className="mt-2.5">
          <SettingRow
            title="屏幕常亮"
            description="放在桌边时不自动熄屏，会更耗电"
            htmlFor="pet-keep-awake"
          >
            <Toggle
              id="pet-keep-awake"
              label="屏幕常亮"
              checked={pet.settings.keepAwake}
              onCheckedChange={(checked) => void update({ keepAwake: checked })}
            />
          </SettingRow>
          {pet.settings.keepAwake && (
            <ChoiceRow
              title="最长常亮 · KEEP AWAKE"
              description="到点交给系统自动熄屏；回到宠物页重新计时"
            >
              {KEEP_AWAKE_HOUR_OPTIONS.map((hours) => (
                <Button
                  key={hours}
                  type="button"
                  variant="outline"
                  className={optionClass(pet.settings.keepAwakeHours === hours)}
                  aria-pressed={pet.settings.keepAwakeHours === hours}
                  onClick={() => void update({ keepAwakeHours: hours })}
                >
                  {hours === 0 ? "不限" : `${hours} 小时`}
                </Button>
              ))}
            </ChoiceRow>
          )}
          <ChoiceRow
            title="无操作自动变暗 · DIM"
            description="轻点屏幕恢复；只在宠物页生效，录音时不触发"
          >
            {DIM_OPTIONS.map((minutes) => (
              <Button
                key={minutes}
                type="button"
                variant="outline"
                className={optionClass(pet.settings.dimMinutes === minutes)}
                aria-pressed={pet.settings.dimMinutes === minutes}
                onClick={() => void update({ dimMinutes: minutes })}
              >
                {minutes} 分钟
              </Button>
            ))}
          </ChoiceRow>
        </Section>

        <Section index="05" title="数据与关于" className="mt-2.5">
          <p className="mt-1.5 border-t border-border pt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            宠物数据只存在本机，无账号、无云同步，卸载会丢失。
          </p>
          <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">
            版本 · Sidekick 0.1.0 · Android
          </p>

          {resetConfirm ? (
            <div className="mt-2.5 border-t border-border pt-2">
              <p className="text-sm font-medium text-foreground">要重置宠物吗？</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                外观、反馈与显示设置都会恢复默认；本机存档会被清空，且不能恢复。连接与语音配置不受影响。
              </p>
              <div className="mt-2 flex justify-end gap-2">
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
                  重置
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="mt-2.5 h-11 w-full rounded-[12px] border-destructive text-destructive hover:bg-transparent hover:text-destructive"
              onClick={() => setResetConfirm(true)}
            >
              <RotateCcw className="size-4" />
              重置宠物
            </Button>
          )}
        </Section>

        <Section index="06" title="消息通道" className="mt-2.5">
          <button
            type="button"
            className="mt-1.5 flex min-h-12 w-full items-center gap-2 border-t border-border pt-1.5 text-left"
            onClick={() => setView("chat")}
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-signal"
            >
              <MessageCircle className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">消息通道</span>
              <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground">
                和电脑互发的调试通道
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </button>
          <p className="mt-2 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
            手机端只做三件事：显示 AI
            状态与会话标题、按住说话、和电脑互发消息。录音只在按住时采集，音频发往电脑配置的百炼，不保存；没有账号，也不上传其他数据。
          </p>
        </Section>
      </PageScroll>

      <MobileTabBar active="settings" />
    </MobilePage>
  );
}
