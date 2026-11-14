import { Command, Keyboard, KeyRound, Radio, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ListActionRow, ListGroup, ListRow } from "@/desktop/shell/list";
import {
  type HotkeyBareKey,
  type HotkeyBinding,
  type HotkeyConfig,
  openAccessibilitySettings,
  requestAccessibility,
  subscribeHotkeyChanged,
} from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Switch } from "@/shared/ui/switch";
import { useHotkeyStore } from "./hotkey-store";

/** 单键：按一下就切换。左/右分开，避免「按左 Command 却影响右 Command 绑定」。 */
const SINGLE_KEYS: ReadonlyArray<{ key: HotkeyBareKey; label: string; note: string }> = [
  { key: "rightCommand", label: "右 Command", note: "默认；单独按不会触发别的快捷键" },
  { key: "rightControl", label: "右 Control", note: "PC 键盘上更常见" },
  { key: "rightOption", label: "右 Option", note: "误触最少" },
  { key: "rightShift", label: "右 Shift", note: "打字时略容易误触" },
  { key: "leftCommand", label: "左 Command", note: "⌘C / ⌘V 不会触发（按住再按别的键不算点按）" },
  { key: "leftControl", label: "左 Control", note: "⌃ 开头的系统快捷键可能冲突" },
  { key: "leftOption", label: "左 Option", note: "输入特殊字符时常用，慎选" },
  { key: "leftShift", label: "左 Shift", note: "几乎每句话都会按到，慎选" },
];

/** macOS 修饰键 keyCode → 绑定值（录制单键时用）。 */
const MODIFIER_KEY_CODES: Record<number, { key: HotkeyBareKey; label: string }> = {
  54: { key: "rightCommand", label: "右 Command" },
  55: { key: "leftCommand", label: "左 Command" },
  59: { key: "leftControl", label: "左 Control" },
  62: { key: "rightControl", label: "右 Control" },
  56: { key: "leftShift", label: "左 Shift" },
  60: { key: "rightShift", label: "右 Shift" },
  58: { key: "leftOption", label: "左 Option" },
  61: { key: "rightOption", label: "右 Option" },
};

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn"]);

/**
 * 语音页 › 键盘快捷键。
 *
 * 两种绑定：
 * - 单键（左/右 Command、Control、Shift、Option，或任意一个普通键）：按一下就切换；
 * - 组合键（⌃⌥⇧⌘ + 键）：按一下切换，或按住说话。
 */
export function HotkeyCard() {
  const status = useHotkeyStore((state) => state.status);
  const error = useHotkeyStore((state) => state.error);
  const load = useHotkeyStore((state) => state.load);
  const save = useHotkeyStore((state) => state.save);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [capturing, setCapturing] = useState<"single" | "combo" | null>(null);
  const [captureHint, setCaptureHint] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const unsubscribe = subscribeHotkeyChanged(() => void load());
    return () => {
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, [load]);

  const persist = useCallback(
    (patch: Partial<HotkeyConfig>) => {
      if (!status) return;
      const next: HotkeyConfig = {
        enabled: patch.enabled ?? status.enabled,
        binding: patch.binding ?? status.binding,
        mode: patch.mode ?? status.mode,
      };
      // 单键没有按住语义：保存前就地归一。
      if (next.binding.kind !== "combo") next.mode = "toggle";
      void save(next);
    },
    [save, status],
  );

  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setCapturing(null);
        setCaptureHint(null);
        return;
      }

      if (capturing === "single") {
        // 裸修饰键（按 Command 本身）直接当单键绑定。
        const modifier = MODIFIER_KEY_CODES[event.keyCode];
        if (modifier) {
          persist({ binding: { kind: "bare", key: modifier.key }, mode: "toggle" });
          setCapturing(null);
          setCaptureHint(null);
          setPickerOpen(false);
          return;
        }
        if (MODIFIER_KEYS.has(event.key)) return;
        const binding: HotkeyBinding = {
          kind: "single",
          keyCode: event.keyCode,
          label: keyName(event),
        };
        persist({ binding, mode: "toggle" });
        setCapturing(null);
        setCaptureHint(null);
        setPickerOpen(false);
        return;
      }

      // 组合键：至少要带一个修饰键
      if (MODIFIER_KEYS.has(event.key)) return;
      if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
        setCaptureHint("组合键要带 ⌃ / ⌥ / ⇧ / ⌘ 中的至少一个");
        return;
      }
      const binding: HotkeyBinding = {
        kind: "combo",
        keyCode: event.keyCode,
        label: comboLabel(event),
        control: event.ctrlKey,
        shift: event.shiftKey,
        option: event.altKey,
        command: event.metaKey,
      };
      persist({ binding });
      setCapturing(null);
      setCaptureHint(null);
      setPickerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturing, persist]);

  const unsupported = status !== null && status.platform !== "macos";
  const enabled = status?.enabled ?? false;

  async function requestPermission() {
    if (requesting) return;
    setRequesting(true);
    try {
      const info = await requestAccessibility();
      if (!info.trusted) await openAccessibilitySettings();
      await load();
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <ListGroup title="键盘快捷键">
        <ListRow
          icon={<Keyboard aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
          iconTone={enabled ? "green" : "gray"}
          title="启用"
          detail={unsupported ? "目前只支持 macOS 桌面端" : "在任意应用里按一下开始/结束录音"}
          control={
            <Switch
              checked={enabled}
              disabled={unsupported || !status}
              onCheckedChange={(checked) => persist({ enabled: checked })}
              aria-label="启用键盘快捷键"
            />
          }
        />
        <ListRow
          icon={<KeyRound aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
          iconTone="blue"
          title="键位"
          meta={status?.label ?? "—"}
          chevron
          onClick={() => {
            setPickerOpen(true);
            setCaptureHint(null);
          }}
        />
        {status?.binding.kind === "combo" && (
          <ListRow
            icon={<Radio aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
            iconTone="gray"
            title="触发方式"
            meta={status.mode === "hold" ? "按住说话" : "按一下切换"}
            chevron
            onClick={() => persist({ mode: status.mode === "hold" ? "toggle" : "hold" })}
          />
        )}
        {status && !status.trusted && status.platform === "macos" && (
          <ListActionRow onClick={() => void requestPermission()} disabled={requesting}>
            {requesting ? "正在打开系统设置…" : "监听键盘需要「辅助功能」授权 · 去开启"}
          </ListActionRow>
        )}
      </ListGroup>

      {status?.hint && (
        <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {status.hint}
        </p>
      )}
      {error && (
        <p className="px-1 text-[11px] text-destructive" role="alert">
          {error}
        </p>
      )}
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        单键按一下就切换；组合键可以改成按住说话。手机要留在「小跟班」宠物页并保持亮屏，
        未连接时会在屏幕顶部提示而不是假装在录。录音中按 Esc 取消。
      </p>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>设置快捷键</DialogTitle>
            <DialogDescription className="leading-relaxed">
              单键：按一下开始，再按一下结束。组合键：按一下切换，或改成按住说话。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              单键
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {SINGLE_KEYS.map((option) => {
                const active = status?.binding.kind === "bare" && status.binding.key === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    data-active={active}
                    className="flex flex-col rounded-lg border border-border px-2.5 py-2 text-left transition-colors hover:bg-accent data-[active=true]:border-ring"
                    onClick={() => {
                      persist({ binding: { kind: "bare", key: option.key }, mode: "toggle" });
                      setPickerOpen(false);
                    }}
                  >
                    <span className="text-[12px] font-medium">{option.label}</span>
                    <span className="mt-0.5 line-clamp-2 text-[10px] leading-[14px] text-muted-foreground">
                      {option.note}
                    </span>
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCapturing("single");
                setCaptureHint("按一个键（Command 也行，F13 也行），Esc 取消");
              }}
            >
              {capturing === "single" ? "正在等你的按键…" : "录制任意单键"}
            </Button>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              组合键
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCapturing("combo");
                setCaptureHint("按 ⌃ / ⌥ / ⇧ / ⌘ + 任意键，Esc 取消");
              }}
            >
              {capturing === "combo" ? "正在听你的按键…" : "录制组合键"}
            </Button>
          </div>

          {captureHint && <p className="text-[11px] text-muted-foreground">{captureHint}</p>}

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="flex items-center gap-2 text-[12px]">
              <Command aria-hidden="true" className="size-3.5" />
              当前：{status?.label ?? "—"}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPickerOpen(false)}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function comboLabel(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("⌃");
  if (event.altKey) parts.push("⌥");
  if (event.shiftKey) parts.push("⇧");
  if (event.metaKey) parts.push("⌘");
  parts.push(keyName(event));
  return parts.join("");
}

function keyName(event: KeyboardEvent): string {
  if (event.key === " ") return "Space";
  if (event.key.length === 1) return event.key.toUpperCase();
  return event.key;
}
