import { cn } from "cn";
import { Cloud, Loader2, TestTube2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";
import { ListEmpty, ListGroup, ListRow } from "@/desktop/shell/list";
import { SegmentedControl } from "@/desktop/shell/segmented-control";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import {
  CLOUD_ENDPOINT_PRESETS,
  type CloudLanguage,
  type CloudVadModel,
  DEFAULT_CLOUD_MODEL,
  useCloudAsrStore,
} from "./cloud-asr-store";

const LANGUAGE_OPTIONS: ReadonlyArray<{ value: CloudLanguage; label: string }> = [
  { value: "zh", label: "中文" },
  { value: "auto", label: "自动识别" },
  { value: "zh-en", label: "中英混说" },
];

const VAD_OPTIONS: ReadonlyArray<{ value: CloudVadModel; label: string }> = [
  { value: "near_meeting_16k", label: "近场" },
  { value: "far_field_meeting_16k", label: "远场" },
];

const ENDPOINT_OPTIONS = [
  { value: "beijing", label: "北京" },
  { value: "singapore", label: "新加坡" },
] as const;

type EndpointPreset = (typeof ENDPOINT_OPTIONS)[number]["value"];

/** 展开/收起：高度 + 透明度过渡；reduce-motion 下直接出现。 */
const EXPAND_TRANSITION = { duration: 0.22, ease: [0.2, 0.9, 0.25, 1] } as const;

/** 当前地址属于哪个预设；业务空间专属域名返回空串，两个预设都不高亮。 */
function endpointPreset(endpoint: string): EndpointPreset | "" {
  if (endpoint === CLOUD_ENDPOINT_PRESETS.beijing) return "beijing";
  if (endpoint === CLOUD_ENDPOINT_PRESETS.singapore) return "singapore";
  return "";
}

/**
 * 表单行：标题 15 在左、控件在右，复用 `.dsl-row` 的 52 高与内缩分隔线；
 * 错误信息放在控件下方，不额外画边框（避免卡中卡）。
 */
function FieldRow({
  id,
  label,
  wide = false,
  error,
  children,
}: {
  id: string;
  label: string;
  wide?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="dsl-row">
      <Label
        htmlFor={id}
        className="w-[64px] shrink-0 text-[15px] leading-none font-normal text-foreground"
      >
        {label}
      </Label>
      <div className={cn("flex min-w-0 flex-col gap-1", wide ? "flex-1" : "ml-auto items-end")}>
        <div className={cn("flex items-center gap-2", wide && "w-full")}>{children}</div>
        {error && (
          <p role="alert" className="text-[13px] leading-[1.4] text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * 语音 › 连接与识别：一张分组列表装下状态、地址、模型、语言、场景、高级与 Key。
 *
 * 行高 52 / 标题 15 / 说明 13 与 iOS 分组列表一致；「高级」用 Motion 做高度过渡。
 * 说明句只保留三类（必填提示 / 隐私承诺 / 危险操作），保存是这一页唯一的实心按钮。
 */
export function CloudAsrForm() {
  const status = useCloudAsrStore((state) => state.status);
  const draft = useCloudAsrStore((state) => state.draft);
  const loading = useCloudAsrStore((state) => state.loading);
  const fieldErrors = useCloudAsrStore((state) => state.fieldErrors);
  const saving = useCloudAsrStore((state) => state.saving);
  const testing = useCloudAsrStore((state) => state.testing);
  const error = useCloudAsrStore((state) => state.error);
  const testResult = useCloudAsrStore((state) => state.testResult);
  const savedNotice = useCloudAsrStore((state) => state.savedNotice);
  const setDraft = useCloudAsrStore((state) => state.setDraft);
  const runTest = useCloudAsrStore((state) => state.runTest);
  const save = useCloudAsrStore((state) => state.save);
  const clearKey = useCloudAsrStore((state) => state.clearKey);
  const reduced = useReducedMotion();

  const [advancedOpen, setAdvancedOpen] = useState(false);

  if (!status || !draft) {
    return (
      <div className="flex flex-col gap-2">
        <ListGroup title="百炼">
          <ListEmpty>{loading ? "正在读取配置…" : "读取配置失败"}</ListEmpty>
        </ListGroup>
        {error && (
          <p role="alert" className="px-1 text-[13px] leading-[1.4] text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  const busy = saving || testing;
  const preset = endpointPreset(draft.endpoint);

  return (
    <div className="flex flex-col gap-2">
      <ListGroup title="百炼">
        <ListRow
          icon={<Cloud aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
          iconTone={status.configured ? "green" : "gray"}
          title="状态"
          meta={status.configured ? "已配置" : "未配置"}
          tone={status.configured ? "signal" : "muted"}
        />

        <ListRow
          title="服务区域"
          control={
            <SegmentedControl<EndpointPreset | "">
              label="服务区域"
              className="w-[136px]"
              value={preset}
              options={ENDPOINT_OPTIONS}
              onChange={(next) => {
                if (!next) return;
                setDraft({ endpoint: CLOUD_ENDPOINT_PRESETS[next] });
              }}
            />
          }
        />

        <FieldRow id="cloud-endpoint" label="服务地址" wide error={fieldErrors.endpoint}>
          <Input
            id="cloud-endpoint"
            value={draft.endpoint}
            placeholder="wss://dashscope.aliyuncs.com/api-ws/v1/inference"
            aria-invalid={Boolean(fieldErrors.endpoint)}
            onChange={(event) => setDraft({ endpoint: event.target.value })}
          />
        </FieldRow>

        <FieldRow id="cloud-model" label="模型" wide error={fieldErrors.model}>
          <Input
            id="cloud-model"
            list="cloud-model-presets"
            value={draft.model}
            aria-invalid={Boolean(fieldErrors.model)}
            onChange={(event) => setDraft({ model: event.target.value })}
          />
          <datalist id="cloud-model-presets">
            <option value={DEFAULT_CLOUD_MODEL} />
          </datalist>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0"
            onClick={() => setDraft({ model: DEFAULT_CLOUD_MODEL })}
          >
            使用推荐模型
          </Button>
        </FieldRow>

        <FieldRow id="cloud-language" label="语言">
          <select
            id="cloud-language"
            className="w-[136px]"
            value={draft.language}
            onChange={(event) => setDraft({ language: event.target.value as CloudLanguage })}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FieldRow>

        <FieldRow id="cloud-vad" label="场景">
          <select
            id="cloud-vad"
            className="w-[136px]"
            value={draft.vadModel}
            onChange={(event) => setDraft({ vadModel: event.target.value as CloudVadModel })}
          >
            {VAD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FieldRow>

        <ListRow
          title="高级"
          meta={advancedOpen ? "收起" : "展开"}
          chevron
          onClick={() => setAdvancedOpen((open) => !open)}
        />

        <AnimatePresence initial={false}>
          {advancedOpen && (
            <motion.div
              key="advanced"
              initial={reduced ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={reduced ? { duration: 0 } : EXPAND_TRANSITION}
              className="overflow-hidden"
            >
              <FieldRow
                id="cloud-silence"
                label="静音断句"
                error={fieldErrors.maxSentenceSilenceMs}
              >
                <Input
                  id="cloud-silence"
                  type="number"
                  min={200}
                  max={6000}
                  step={100}
                  value={draft.maxSentenceSilenceMs}
                  aria-invalid={Boolean(fieldErrors.maxSentenceSilenceMs)}
                  className="w-[76px] text-right"
                  onChange={(event) =>
                    setDraft({ maxSentenceSilenceMs: Number(event.target.value) })
                  }
                />
                <span className="text-[13px] text-muted-foreground">ms</span>
              </FieldRow>

              <ListRow
                title="保留方言"
                control={
                  <Switch
                    aria-label="保留方言"
                    checked={draft.keepDialect}
                    onCheckedChange={(checked) => setDraft({ keepDialect: checked })}
                  />
                }
              />
            </motion.div>
          )}
        </AnimatePresence>

        <FieldRow id="cloud-api-key" label="API Key" wide error={fieldErrors.apiKey}>
          <Input
            id="cloud-api-key"
            type="password"
            autoComplete="off"
            value={draft.apiKey}
            placeholder={
              status.hasKey ? `已保存 ${status.keyMasked ?? "Key"}，输入新 Key 可替换` : "sk-..."
            }
            aria-invalid={Boolean(fieldErrors.apiKey)}
            onChange={(event) => setDraft({ apiKey: event.target.value })}
          />
          <Button
            type="button"
            variant="destructive"
            size="xs"
            className="shrink-0"
            disabled={!status.hasKey || busy}
            onClick={() => void clearKey()}
          >
            清除 Key
          </Button>
        </FieldRow>

        <label className="dsl-row">
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-primary"
            checked={draft.consent}
            onChange={(event) => setDraft({ consent: event.target.checked })}
          />
          <span className="min-w-0 flex-1 text-[15px] leading-[1.45]">
            同意录音实时发送到阿里云百炼
          </span>
        </label>

        <div className="dsl-row">
          {!draft.consent && (
            <span className="mr-auto text-[13px] text-muted-foreground">先同意才能保存</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void runTest()}
            >
              {testing ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <TestTube2 aria-hidden="true" className="size-3.5" />
              )}
              测试连接
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || !draft.consent}
              onClick={() => void save()}
            >
              {saving && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
              保存
            </Button>
          </div>
        </div>
      </ListGroup>

      <div className="flex flex-col gap-1 px-1.5">
        <p className="text-[13px] leading-[1.45] text-muted-foreground">
          Key 只存本机 asr.json（0600），不写日志、不上传。
        </p>
        {testResult && (
          <p
            role="status"
            className={cn(
              "text-[13px] leading-[1.45]",
              testResult.ok ? "text-signal" : "text-destructive",
            )}
          >
            {testResult.ok
              ? `连接成功 · ${testResult.latencyMs ?? "?"}ms${testResult.model ? ` · ${testResult.model}` : ""}`
              : (testResult.message ?? "连接失败，请检查地址、Key 与网络。")}
          </p>
        )}
        {savedNotice && (
          <p role="status" className="text-[13px] leading-[1.45] text-signal">
            {savedNotice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-[13px] leading-[1.45] text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
