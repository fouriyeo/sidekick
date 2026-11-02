import { KeyRound, Loader2, ShieldCheck, TestTube2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  CLOUD_ENDPOINT_PRESETS,
  type CloudLanguage,
  DEFAULT_CLOUD_MODEL,
  useCloudAsrStore,
} from "./cloud-asr-store";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-[11px] text-destructive" role="alert">
      {message}
    </p>
  );
}

export function CloudAsrForm() {
  const status = useCloudAsrStore((state) => state.status);
  const draft = useCloudAsrStore((state) => state.draft);
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

  if (!status || !draft) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">正在读取百炼配置…</p>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  const busy = saving || testing;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium">
            {status.configured ? "已配置" : "未配置"}
            {status.configured && (
              <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                云端识别
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {status.configured
              ? `${status.config.model}${status.hasKey ? ` · ${status.keyMasked ?? "Key 已保存"}` : ""}`
              : "填好地址和 API Key，测试连接后保存即可使用"}
          </p>
        </div>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed">
        <input
          type="checkbox"
          className="mt-0.5 size-3.5 shrink-0 accent-primary"
          checked={draft.consent}
          onChange={(event) => setDraft({ consent: event.target.checked })}
        />
        <span>
          <span className="flex items-center gap-1 font-medium">
            <ShieldCheck className="size-3.5 text-muted-foreground" />
            我了解使用语音识别时录音会发送到阿里云百炼
          </span>
          <span className="mt-1 block text-muted-foreground">
            电脑直连百炼，不经过 Sidekick 服务器；录音不保存。未勾选不能保存。
          </span>
        </span>
      </label>
      <FieldError message={fieldErrors.consent} />

      <div>
        <Label htmlFor="cloud-endpoint" className="text-xs">
          服务地址
        </Label>
        <Input
          id="cloud-endpoint"
          value={draft.endpoint}
          placeholder="wss://dashscope.aliyuncs.com/api-ws/v1/inference"
          aria-invalid={Boolean(fieldErrors.endpoint)}
          className="mt-1.5"
          onChange={(event) => setDraft({ endpoint: event.target.value })}
        />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setDraft({ endpoint: CLOUD_ENDPOINT_PRESETS.beijing })}
          >
            北京
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setDraft({ endpoint: CLOUD_ENDPOINT_PRESETS.singapore })}
          >
            新加坡
          </Button>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          默认北京；可换成新加坡；如使用业务空间专属域名，请直接粘贴完整地址并把 WorkspaceId
          占位符换成真实 ID。必须使用 wss://。
        </p>
        <FieldError message={fieldErrors.endpoint} />
      </div>

      <div>
        <Label htmlFor="cloud-api-key" className="text-xs">
          API Key
        </Label>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Input
            id="cloud-api-key"
            type="password"
            autoComplete="off"
            value={draft.apiKey}
            placeholder={
              status.hasKey ? `已保存 ${status.keyMasked ?? "Key"}；输入新 Key 可替换` : "sk-..."
            }
            aria-invalid={Boolean(fieldErrors.apiKey)}
            onChange={(event) => setDraft({ apiKey: event.target.value })}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={!status.hasKey || busy}
            onClick={() => void clearKey()}
          >
            清除 Key
          </Button>
        </div>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <KeyRound className="size-3" />
          只保存在 macOS 钥匙串，不写入配置文件，也不写日志。
        </p>
        <FieldError message={fieldErrors.apiKey} />
      </div>

      <div>
        <Label htmlFor="cloud-model" className="text-xs">
          模型
        </Label>
        <Input
          id="cloud-model"
          list="cloud-model-presets"
          value={draft.model}
          aria-invalid={Boolean(fieldErrors.model)}
          className="mt-1.5 font-mono text-xs"
          onChange={(event) => setDraft({ model: event.target.value })}
        />
        <datalist id="cloud-model-presets">
          <option value={DEFAULT_CLOUD_MODEL} />
        </datalist>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setDraft({ model: DEFAULT_CLOUD_MODEL })}
          >
            使用推荐模型
          </Button>
          <span className="text-[11px] text-muted-foreground">
            实时流式，推荐 {DEFAULT_CLOUD_MODEL}
          </span>
        </div>
        <FieldError message={fieldErrors.model} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="cloud-language" className="text-xs">
            语言
          </Label>
          <select
            id="cloud-language"
            className={`${selectClass} mt-1.5`}
            value={draft.language}
            onChange={(event) => setDraft({ language: event.target.value as CloudLanguage })}
          >
            <option value="zh">中文（推荐）</option>
            <option value="auto">自动识别</option>
            <option value="zh-en">中英混说</option>
          </select>
        </div>
        <div>
          <Label htmlFor="cloud-vad" className="text-xs">
            场景
          </Label>
          <select
            id="cloud-vad"
            className={`${selectClass} mt-1.5`}
            value={draft.vadModel}
            onChange={(event) =>
              setDraft({ vadModel: event.target.value as typeof draft.vadModel })
            }
          >
            <option value="near_meeting_16k">近场（手机贴嘴）</option>
            <option value="far_field_meeting_16k">远场</option>
          </select>
        </div>
      </div>

      <details className="rounded-xl border border-border bg-background/60 p-3">
        <summary className="cursor-pointer text-xs font-medium">高级</summary>
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <Label htmlFor="cloud-silence" className="text-xs">
              静音断句（ms）
            </Label>
            <Input
              id="cloud-silence"
              type="number"
              min={200}
              max={6000}
              step={100}
              value={draft.maxSentenceSilenceMs}
              aria-invalid={Boolean(fieldErrors.maxSentenceSilenceMs)}
              className="mt-1.5 w-32"
              onChange={(event) => setDraft({ maxSentenceSilenceMs: Number(event.target.value) })}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              默认 800ms；越大越不容易把一句话切断。
            </p>
            <FieldError message={fieldErrors.maxSentenceSilenceMs} />
          </div>

          <div>
            <Label htmlFor="cloud-vocabulary" className="text-xs">
              热词（每行一个，最多 50 个）
            </Label>
            <textarea
              id="cloud-vocabulary"
              className={`${textareaClass} mt-1.5`}
              value={draft.vocabularyText}
              placeholder={"异步\n注释\n剪贴板"}
              onChange={(event) => setDraft({ vocabularyText: event.target.value })}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              适合项目术语、人名；提交时会自动去重。
            </p>
            <FieldError message={fieldErrors.vocabulary} />
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="size-3.5 accent-primary"
              checked={draft.keepDialect}
              onChange={(event) => setDraft({ keepDialect: event.target.checked })}
            />
            保留方言表达（默认转成普通话）
          </label>
        </div>
      </details>

      {testResult && (
        <p
          role="status"
          className={`text-xs ${testResult.ok ? "text-success" : "text-destructive"}`}
        >
          {testResult.ok
            ? `连接成功 · ${testResult.latencyMs ?? "?"}ms${testResult.model ? ` · ${testResult.model}` : ""}`
            : (testResult.message ?? "连接失败，请检查地址、Key 与网络。")}
        </p>
      )}

      {savedNotice && (
        <p role="status" className="text-xs text-success">
          {savedNotice}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void runTest()}
        >
          {testing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <TestTube2 className="size-3.5" />
          )}
          测试连接
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !draft.consent}
          onClick={() => void save()}
        >
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          保存
        </Button>
        {!draft.consent && (
          <span className="text-[11px] text-muted-foreground">先勾选上方同意才能保存。</span>
        )}
      </div>
    </div>
  );
}
