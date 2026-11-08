import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";

const PRIVACY_KEY = "sidekick:memo:privacy";
const PRIVACY_VERSION = 1;

/** 首次录音前是否已经告知并同意（只存本机）。 */
export function hasMemoPrivacyAck(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(PRIVACY_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { v?: number };
    return parsed.v === PRIVACY_VERSION;
  } catch {
    return false;
  }
}

function writePrivacyAck(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PRIVACY_KEY, JSON.stringify({ v: PRIVACY_VERSION, at: Date.now() }));
  } catch {
    // localStorage 不可用时本次仍算同意；下次会再问一次，但不阻断录音。
  }
}

const POINTS = [
  "说完的录音会发送到百炼做识别与整理，用来生成这条备忘的文字。",
  "原始录音默认保存在本机，可在「设置 › 备忘录」关掉，只留文字。",
  "同一 Wi-Fi 且已和电脑配对时，整理结果会镜像到电脑；电脑端只读。",
];

/**
 * 首次录音隐私告知（SPEC §5 要求、历史实现缺失）。
 * 用底部 Sheet 而不是居中 Dialog：WebView 103 不支持 CSS `translate` 属性，
 * 居中 Dialog 的 `-translate-x-1/2` 会失效，底部 Sheet 不依赖它。
 */
export function MemoPrivacySheet({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[20px] pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>录音会做什么？</SheetTitle>
          <SheetDescription>第一次录音前说明一次，之后不再打扰。</SheetDescription>
        </SheetHeader>
        <ul className="m-0 flex list-none flex-col gap-2.5 px-4 text-[13px] leading-[19px] text-foreground">
          {POINTS.map((point) => (
            <li key={point} className="flex gap-2">
              <span
                aria-hidden="true"
                className="mt-[7px] size-1 shrink-0 rounded-full bg-signal"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <SheetFooter className="flex-row gap-2">
          <Button
            variant="secondary"
            className="h-11 flex-1 rounded-full"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            className="h-11 flex-1 rounded-full"
            onClick={() => {
              writePrivacyAck();
              onOpenChange(false);
              onConfirm();
            }}
          >
            同意并开始
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** 录音条专用：读一次 ack，同意后本地即时更新。 */
export function useMemoPrivacy() {
  const [acked, setAcked] = useState(() => hasMemoPrivacyAck());
  useEffect(() => {
    setAcked(hasMemoPrivacyAck());
  }, []);
  return {
    acked,
    acknowledge: () => setAcked(true),
  };
}
