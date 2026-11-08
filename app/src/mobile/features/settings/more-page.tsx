import { cn } from "cn";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useConnectionView } from "@/mobile/features/connect/connection-view";
import { useFirstUseStore } from "@/mobile/features/first-use/store";
import { MemoSettingsSection } from "@/mobile/features/memo/memo-key-section";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import { PET_SOUND_LABEL, type PetSoundKind, previewPetSound } from "@/mobile/features/pet/sound";
import type { ReduceMotionSetting } from "@/mobile/features/pet/types";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { pushBackHandler } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";
import { sendStatusRequest } from "@/shared/lib/tauri";
import { setThemePreference, type ThemePreference, useTheme } from "@/shared/lib/theme";
import { Label } from "@/shared/ui/label";
import { Toggle } from "./toggle";

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

const REDUCE_OPTIONS: ReadonlyArray<{ value: ReduceMotionSetting; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "on", label: "开启" },
  { value: "off", label: "关闭" },
];

/** 无操作自动变暗的分钟数选项。 */
const DIM_OPTIONS = [1, 2, 5, 10, 15, 30] as const;

/** 屏幕常亮最长小时数选项；0 表示不限。 */
const KEEP_AWAKE_HOUR_OPTIONS = [1, 2, 4, 8, 0] as const;

const SOUND_PREVIEWS: PetSoundKind[] = ["work-start", "ask", "complete"];

/** 首用清单共 4 步；手机本地只验证前两步。 */
const FIRST_USE_TOTAL = 4;

/** 分组卡片：白底、16 圆角、0.5 hairline、无投影、无 1px 描边。 */
const CARD_CLASS = "overflow-hidden rounded-2xl border-[0.5px] border-border bg-card";

/** 卡片内分隔线：0.5 hairline，左侧留 14 与文字对齐。 */
function Hairline() {
  return <div aria-hidden="true" className="ml-4 h-[0.5px] bg-border" />;
}

type Option<T extends string | number> = { value: T; label: string };

/** 分段选择：13/400，选中是白卡片薄片；每段触控 ≥44。 */
function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
  fit = false,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<Option<T>>;
  onChange: (value: T) => void;
  /** true 时按内容宽度自适应（行内跟标签同排）；false 时铺满并三等分（区块内）。 */
  fit?: boolean;
  className?: string;
}) {
  return (
    <fieldset
      aria-label={label}
      className={cn(
        "m-0 grid shrink-0 gap-1 rounded-[11px] bg-muted p-[3px]",
        fit ? "w-fit grid-flow-col auto-cols-max" : "grid-cols-3",
        className,
      )}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            className={cn(
              "flex min-h-9 min-w-0 items-center justify-center rounded-[9px] px-2.5 text-[13px] leading-[18px] font-normal whitespace-nowrap transition-colors",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

/** 多选一区块：标题 16/400 + 可选一句 13/400 + 三列分段（选项多时换行）。 */
function ChoiceBlock<T extends string | number>({
  title,
  description,
  value,
  options,
  onChange,
}: {
  title: string;
  description?: string;
  value: T;
  options: ReadonlyArray<Option<T>>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="px-4 pt-4 pb-4">
      <p className="m-0 text-[15px] leading-[21px] text-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-[13px] leading-[19px] text-muted-foreground">{description}</p>
      )}
      <div className="mt-3">
        <Segmented label={title} value={value} options={options} onChange={onChange} />
      </div>
    </div>
  );
}

/** 首用清单 banner：默认一行「首用清单 · 还差 N 步」，点开才占空间。 */
function FirstUseBanner({
  expanded,
  onExpandedChange,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const hydrated = useFirstUseStore((state) => state.hydrated);
  const micReady = useFirstUseStore((state) => state.micReady);
  const dismissed = useFirstUseStore((state) => state.dismissed);
  const desktop = useFirstUseStore((state) => state.desktop);
  const hydrate = useFirstUseStore((state) => state.hydrate);
  const connected = useConnectionStore((state) => state.status === "connected");
  const openOffline = useUiStore((state) => state.openOffline);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // 打开设置页（以及连接状态变化）时向电脑要一次桌面状态快照；
  // 旧桌面不回应，首用清单保持「在电脑上完成」；请求失败静默（不影响页面）。
  useEffect(() => {
    if (!connected) return;
    void sendStatusRequest().catch(() => undefined);
  }, [connected]);

  if (!hydrated || dismissed) return null;

  const asrConfigured = desktop?.asrConfigured === true;
  const asrHasKey = desktop?.asrHasKey === true;
  const accessibilityTrusted = desktop?.accessibilityTrusted === true;
  const done =
    (connected ? 1 : 0) +
    (micReady ? 1 : 0) +
    (asrConfigured ? 1 : 0) +
    (accessibilityTrusted ? 1 : 0);
  const remaining = FIRST_USE_TOTAL - done;

  // 内容即原 FirstUseCard 的四步（D79 / v16：从宠物首屏移到设置页 banner）；
  // 前两步由手机本地验证，后两步只听电脑 desktop.status，不伪造完成态。
  const steps = [
    {
      key: "connect",
      title: "连接电脑",
      done: connected,
      current: !connected,
      desktop: false,
      description: connected
        ? "局域网直连；断线后会自动重连。"
        : "手机和电脑连同一个 Wi-Fi，电脑端 Sidekick 保持打开。",
    },
    {
      key: "mic",
      title: "允许麦克风权限",
      done: micReady,
      current: connected && !micReady,
      desktop: false,
      description: micReady
        ? "录音已经成功启动过一次；App 只在按住时录音。"
        : "按住下方麦克风说话时会请求权限；不开启时按住说话会直接失败。",
    },
    {
      key: "bailian",
      title: "在电脑上配置百炼语音",
      done: asrConfigured,
      current: false,
      desktop: true,
      description: asrConfigured
        ? "电脑已保存百炼 Key，并已通过配置检查；录音只发往电脑配置的百炼。"
        : desktop !== null && asrHasKey
          ? "电脑已保存 Key，但配置还不完整（同意上传 / 地址或模型）。"
          : "不配置时录音能开始，但一定转写失败；音频只发往电脑配置的百炼。",
    },
    {
      key: "accessibility",
      title: "在电脑上开启辅助功能",
      done: accessibilityTrusted,
      current: false,
      desktop: true,
      description: accessibilityTrusted
        ? "电脑已授权；转写完会自动输入，结果卡有「回车 / 清空」。"
        : desktop?.accessibilityTrusted === false
          ? "还没授权；不开只会复制到剪贴板，没有「回车 / 清空」，也不会自动输入。"
          : "不开只会复制到剪贴板，没有「回车 / 清空」，也不会自动输入。",
    },
  ] as const;

  return (
    <section aria-label="首用清单" className="mx-4 mt-4">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`首用清单，已完成 ${done}/4，点按${expanded ? "收起" : "展开"}`}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
        onClick={() => onExpandedChange(!expanded)}
      >
        <span className="min-w-0 truncate text-[13px] leading-[19px] text-muted-foreground">
          <span className="text-foreground">首用清单</span>
          {remaining > 0 ? ` · 还差 ${remaining} 步` : " · 已完成"}
        </span>
        {expanded ? (
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
        ) : (
          <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 rounded-2xl border-[0.5px] border-border bg-card p-4">
          <ul className="m-0 list-none p-0">
            {steps.map((step, index) => (
              <li
                key={step.key}
                className="flex gap-3 border-t-[0.5px] border-border py-3 first:border-t-0 first:pt-0"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] leading-none text-muted-foreground",
                    step.done && "border-success text-success",
                    step.current && !step.done && "border-decide text-decide",
                  )}
                >
                  {step.done ? <Check className="size-3" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[14px] leading-5 text-foreground">{step.title}</span>
                    {step.done && <span className="text-[12px] text-success">已完成</span>}
                    {step.current && <span className="text-[12px] text-decide">当前步骤</span>}
                    {!step.done && step.desktop && (
                      <span className="text-[12px] text-muted-foreground">在电脑上完成</span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] leading-[19px] text-muted-foreground">
                    {step.description}
                  </p>
                  {step.key === "connect" && !connected && (
                    <button
                      type="button"
                      className="mt-2 flex min-h-11 items-center text-[14px] text-primary"
                      onClick={openOffline}
                    >
                      去连接
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** 数据与关于卡片：本机说明、版本、重置宠物（二次确认）。 */
function AboutCard({
  resetConfirm,
  onResetConfirmChange,
  onReset,
}: {
  resetConfirm: boolean;
  onResetConfirmChange: (confirm: boolean) => void;
  onReset: () => Promise<void>;
}) {
  return (
    <section aria-label="数据与关于" className={CARD_CLASS}>
      <p className="px-4 pt-4 text-[13px] leading-[20px] text-muted-foreground">
        宠物数据只存在本机，无账号、无云同步，卸载会丢失。
      </p>
      <p className="px-4 pt-2 pb-4 text-[13px] leading-[20px] text-muted-foreground">
        版本 · Sidekick 0.1.0 · Android
        <br />
        字体 · HarmonyOS Sans（华为，免费商用）
      </p>
      <Hairline />
      {resetConfirm ? (
        <div className="px-4 py-4">
          <p className="m-0 text-[15px] leading-[21px] text-foreground">要重置宠物吗？</p>
          <p className="mt-1.5 text-[13px] leading-[19px] text-muted-foreground">
            外观、反馈与显示设置都会恢复默认；本机存档会被清空，且不能恢复。连接与语音配置不受影响。
          </p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="flex min-h-11 items-center px-2 text-[14px] leading-5 text-muted-foreground"
              onClick={() => onResetConfirmChange(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="flex min-h-11 items-center px-2 text-[14px] leading-5 text-destructive"
              onClick={() => void onReset()}
            >
              重置
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="flex min-h-[56px] w-full items-center px-4 text-left text-[15px] leading-[21px] text-destructive"
          onClick={() => onResetConfirmChange(true)}
        >
          重置宠物
        </button>
      )}
    </section>
  );
}

/**
 * 更多（设置）二级页（v16）：从左上 gear 进入，左上返回 + 17/400 inline 标题。
 *
 * 结构：页头 → 首用清单 banner（点开）→ 分组卡片
 * （连接 / 外观 / 反馈 / 显示 / 数据与关于 / 消息通道）→ 隐私一句。
 * 用量不在设置里（v17 起是宠物页顶栏的今日数字，点开进用量页）。
 * 无底部 tab；卡片 16 圆角 + 0.5 hairline，行 48–52，全站 400 字重。
 * 保留设置保存错误、重置二次确认与返回键（先收确认/清单，再交给根页面回宠物）。
 */
export function MorePage() {
  const pet = usePetStore((state) => state.pet);
  const updateSettings = usePetStore((state) => state.updateSettings);
  const resetPet = usePetStore((state) => state.resetPet);
  const { preference } = useTheme();
  const connection = useConnectionView();
  const openOffline = useUiStore((state) => state.openOffline);
  const setView = useUiStore((state) => state.setView);

  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [firstUseOpen, setFirstUseOpen] = useState(false);

  // 返回键先收起重置确认 / 首用清单，再交给根页面（返回宠物）。
  const resetConfirmRef = useRef(resetConfirm);
  resetConfirmRef.current = resetConfirm;
  const firstUseOpenRef = useRef(firstUseOpen);
  firstUseOpenRef.current = firstUseOpen;
  useEffect(() => {
    return pushBackHandler(() => {
      if (resetConfirmRef.current) {
        setResetConfirm(false);
        return true;
      }
      if (firstUseOpenRef.current) {
        setFirstUseOpen(false);
        return true;
      }
      return false;
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
      <PageHeader
        title="更多"
        sub="设置 · 只影响这台手机"
        onBack={() => setView("pet")}
        backLabel="返回宠物"
      />

      <PageScroll className="px-0 pt-0 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {settingsError && (
          <p
            role="alert"
            className="mx-4 mt-3 rounded-2xl border-[0.5px] border-destructive bg-card px-4 py-3.5 text-[13px] leading-[19px] text-destructive"
          >
            {settingsError}
          </p>
        )}

        <FirstUseBanner expanded={firstUseOpen} onExpandedChange={setFirstUseOpen} />

        <div className="mx-4 mt-5 flex flex-col gap-5">
          <section aria-label="连接" className={CARD_CLASS}>
            <button
              type="button"
              aria-label={`连接状态：${connection.label}，点按查看连接`}
              className="flex min-h-[60px] w-full items-center gap-4 px-4 text-left"
              onClick={openOffline}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] leading-[21px] text-foreground">
                  {connection.label}
                  {connection.detail ? ` · ${connection.detail}` : ""}
                </span>
                <span className="mt-1 block truncate text-[13px] leading-[19px] text-muted-foreground">
                  局域网直连 · 断线自动重连
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            </button>
          </section>

          <section aria-label="外观" className={CARD_CLASS}>
            <div className="flex min-h-[60px] items-center gap-4 px-4">
              <span className="min-w-0 flex-1 truncate text-[15px] leading-[21px] text-foreground">
                外观
              </span>
              <Segmented
                label="外观"
                value={preference}
                options={THEME_OPTIONS}
                onChange={setThemePreference}
                fit
              />
            </div>
          </section>

          <section aria-label="反馈" className={CARD_CLASS}>
            <div className="flex min-h-[56px] items-center gap-4 px-4">
              <Label
                htmlFor="pet-haptics"
                className="min-w-0 flex-1 text-[15px] leading-[21px] font-normal text-foreground"
              >
                震动
              </Label>
              <Toggle
                id="pet-haptics"
                label="震动"
                checked={pet.settings.haptics}
                onCheckedChange={(checked) => void update({ haptics: checked })}
              />
            </div>
            <Hairline />
            <div className="flex min-h-[56px] items-center gap-4 px-4">
              <Label
                htmlFor="pet-sound"
                className="min-w-0 flex-1 text-[15px] leading-[21px] font-normal text-foreground"
              >
                AI 音效
              </Label>
              <Toggle
                id="pet-sound"
                label="AI 音效"
                checked={pet.settings.sound}
                onCheckedChange={(checked) => void update({ sound: checked })}
              />
            </div>
            <Hairline />
            <div className="flex min-h-[56px] items-center gap-4 px-4">
              <span className="min-w-0 flex-1 truncate text-[15px] leading-[21px] text-foreground">
                试听
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {SOUND_PREVIEWS.map((kind, index) => (
                  <Fragment key={kind}>
                    {index > 0 && (
                      <span
                        aria-hidden="true"
                        className="text-[13px] leading-[15px] text-muted-foreground"
                      >
                        ·
                      </span>
                    )}
                    <button
                      type="button"
                      className="flex min-h-11 items-center px-0.5 text-[14px] leading-5 text-primary"
                      onClick={() => previewPetSound(kind)}
                    >
                      {PET_SOUND_LABEL[kind]}
                    </button>
                  </Fragment>
                ))}
              </span>
            </div>
            <Hairline />
            <div className="flex min-h-[60px] items-center gap-4 px-4">
              <span className="min-w-0 flex-1 truncate text-[15px] leading-[21px] text-foreground">
                减少动效
              </span>
              <Segmented
                label="减少动效"
                value={pet.settings.reduceMotion}
                options={REDUCE_OPTIONS}
                onChange={(value) => void update({ reduceMotion: value })}
                fit
              />
            </div>
          </section>

          <p className="mx-4 text-[13px] leading-[20px] text-muted-foreground">
            录音时不响 · 系统静音或勿扰下可能无法完全遵守。
          </p>

          <section aria-label="显示" className={CARD_CLASS}>
            <div className="flex min-h-[60px] items-center gap-4 px-4">
              <span className="min-w-0 flex-1">
                <Label
                  htmlFor="pet-keep-awake"
                  className="block text-[15px] leading-[21px] font-normal text-foreground"
                >
                  屏幕常亮
                </Label>
                <span className="mt-1 block truncate text-[13px] leading-[19px] text-muted-foreground">
                  放在桌边时不自动熄屏，会更耗电
                </span>
              </span>
              <Toggle
                id="pet-keep-awake"
                label="屏幕常亮"
                checked={pet.settings.keepAwake}
                onCheckedChange={(checked) => void update({ keepAwake: checked })}
              />
            </div>
            {pet.settings.keepAwake && (
              <>
                <Hairline />
                <ChoiceBlock
                  title="最长常亮"
                  description="到点交给系统自动熄屏；回到宠物页重新计时"
                  value={pet.settings.keepAwakeHours}
                  options={KEEP_AWAKE_HOUR_OPTIONS.map((hours) => ({
                    value: hours,
                    label: hours === 0 ? "不限" : `${hours} 小时`,
                  }))}
                  onChange={(hours) => void update({ keepAwakeHours: hours })}
                />
              </>
            )}
            <Hairline />
            <ChoiceBlock
              title="无操作自动变暗"
              description="只在宠物页生效，录音时不触发"
              value={pet.settings.dimMinutes}
              options={DIM_OPTIONS.map((minutes) => ({
                value: minutes,
                label: `${minutes} 分钟`,
              }))}
              onChange={(minutes) => void update({ dimMinutes: minutes })}
            />
          </section>

          <MemoSettingsSection />

          <AboutCard
            resetConfirm={resetConfirm}
            onResetConfirmChange={setResetConfirm}
            onReset={confirmReset}
          />

          <section aria-label="消息通道" className={CARD_CLASS}>
            <button
              type="button"
              className="flex min-h-[60px] w-full items-center gap-4 px-4 text-left"
              onClick={() => setView("chat")}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] leading-[21px] text-foreground">
                  消息通道
                </span>
                <span className="mt-1 block truncate text-[13px] leading-[19px] text-muted-foreground">
                  和电脑互发的调试通道
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            </button>
          </section>
        </div>

        <p className="mx-4 mt-4 text-[13px] leading-[20px] text-muted-foreground">
          录音只在按住时采集，音频不保存；没有账号，也不上传其他数据。
        </p>
      </PageScroll>
    </MobilePage>
  );
}
