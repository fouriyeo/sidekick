import { cn } from "cn";
import { KeyRound, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatBytes } from "@/mobile/features/memo/format";
import { useMemoStore } from "@/mobile/features/memo/memo-store";
import { Toggle } from "@/mobile/features/settings/toggle";
import { memoPairRequest, normalizeError } from "@/shared/lib/tauri";

const CARD = "overflow-hidden rounded-2xl border-[0.5px] border-border bg-card";
const ROW = "flex min-h-[56px] items-center gap-4 px-4";

function Hairline() {
  return <div aria-hidden="true" className="ml-4 h-[0.5px] bg-border" />;
}

/**
 * 设置页「备忘录」分组：保留录音、占用空间、Key 与一次性配对码。
 *
 * Key 的来源有两条：电脑生成 6 位码后手机输入（推荐），或手动粘贴。
 * 配对结果由 `MobileApp` 统一接 `memo.pair.result`，这里只负责发请求与展示状态。
 */
export function MemoSettingsSection() {
  const key = useMemoStore((state) => state.key);
  const storage = useMemoStore((state) => state.storage);
  const keepAudio = useMemoStore((state) => state.keepAudio);
  const loadKey = useMemoStore((state) => state.loadKey);
  const load = useMemoStore((state) => state.load);
  const loadStorage = useMemoStore((state) => state.loadStorage);
  const saveKey = useMemoStore((state) => state.saveKey);
  const clearKey = useMemoStore((state) => state.clearKey);
  const setKeepAudio = useMemoStore((state) => state.setKeepAudio);

  const [keyInput, setKeyInput] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    void loadKey();
    void loadStorage();
  }, [loadKey, loadStorage]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveKey(keyInput);
      setKeyInput("");
      toast.success("Key 已保存");
    } catch (error) {
      toast.error(normalizeError(error));
    } finally {
      setBusy(false);
    }
  };

  const pair = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await memoPairRequest(code);
      toast.success("配对请求已发送，等电脑确认");
    } catch (error) {
      toast.error(normalizeError(error));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    try {
      await clearKey();
      toast.success("已清除 Key");
    } catch (error) {
      toast.error(normalizeError(error));
    }
  };

  return (
    <>
      <section aria-label="备忘录" className={CARD}>
        <div className={ROW}>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-[21px] text-foreground">保留录音</span>
            <span className="mt-1 block text-[13px] leading-[19px] text-muted-foreground">
              16k WAV，约 115MB/小时；关掉只留文字
            </span>
          </span>
          <Toggle
            label="保留录音"
            checked={keepAudio}
            onCheckedChange={(checked) => {
              setKeepAudio(checked);
              void load();
              void loadStorage();
            }}
          />
        </div>
        <Hairline />
        <div className={ROW}>
          <span className="min-w-0 flex-1 text-[15px] leading-[21px] text-foreground">
            占用空间
          </span>
          <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
            {storage ? `${storage.count} 条 · ${formatBytes(storage.audioBytes)}` : "—"}
          </span>
        </div>
      </section>

      <section aria-label="百炼 Key" className={cn(CARD, "mt-3")}>
        <div className={ROW}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-muted text-muted-foreground">
            <KeyRound aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-[21px] text-foreground">百炼 Key</span>
            <span className="mt-1 block truncate text-[13px] leading-[19px] text-muted-foreground">
              {key?.hasKey ? `已配置 · ${key.keyMasked ?? ""}` : "未配置，录音无法整理"}
            </span>
          </span>
          {key?.hasKey && (
            <button
              type="button"
              className="shrink-0 rounded-full px-3 py-2 text-[13px] text-destructive active:bg-wash"
              onClick={() => void clear()}
            >
              {confirmClear ? "再点一次" : "清除"}
            </button>
          )}
        </div>
        <Hairline />
        <div className="flex items-center gap-2 px-4 py-3">
          <input
            type="password"
            inputMode="text"
            autoComplete="off"
            aria-label="粘贴百炼 API Key"
            placeholder="粘贴 sk-…"
            className="min-h-10 min-w-0 flex-1 rounded-[10px] bg-muted px-3 text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
          />
          <button
            type="button"
            disabled={busy || keyInput.trim().length < 8}
            className="min-h-10 shrink-0 rounded-full bg-primary px-4 text-[13px] text-primary-foreground disabled:opacity-40"
            onClick={() => void save()}
          >
            保存
          </button>
        </div>
      </section>

      <section aria-label="从电脑配对" className={cn(CARD, "mt-3")}>
        <div className={ROW}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-muted text-muted-foreground">
            <Smartphone aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-[21px] text-foreground">从电脑配对</span>
            <span className="mt-1 block text-[13px] leading-[19px] text-muted-foreground">
              电脑「语音」页生成 6 位码，2 分钟内有效
            </span>
          </span>
        </div>
        <Hairline />
        <div className="flex items-center gap-2 px-4 py-3">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            aria-label="6 位配对码"
            placeholder="6 位配对码"
            className="min-h-10 min-w-0 flex-1 rounded-[10px] bg-muted px-3 text-[15px] tracking-[0.2em] tabular-nums text-foreground outline-none placeholder:text-[13px] placeholder:tracking-normal placeholder:text-muted-foreground"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <button
            type="button"
            disabled={busy || code.length !== 6}
            className="min-h-10 shrink-0 rounded-full bg-primary px-4 text-[13px] text-primary-foreground disabled:opacity-40"
            onClick={() => void pair()}
          >
            配对
          </button>
        </div>
      </section>
    </>
  );
}
