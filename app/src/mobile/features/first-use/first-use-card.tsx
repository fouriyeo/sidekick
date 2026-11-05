import { cn } from "cn";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useUiStore } from "@/mobile/ui-store";
import { Button } from "@/shared/ui/button";
import { useFirstUseStore } from "./store";

/**
 * 首用清单卡（4 步）：连接电脑 / 允许麦克风权限 / 在电脑上配置百炼 / 在电脑上开启辅助功能。
 *
 * 手机只本地验证前两步（连接实时判断、麦克风用持久化的 micReady），
 * 后两步明确写「在电脑上完成」，不伪造完成态。可整卡收起（写 localStorage）。
 */
type FirstUseCardProps = {
  /** 展开/收起时通知外层：宠物页可据此暂时让出气泡，避免挤压宠物。 */
  onExpandedChange?: (expanded: boolean) => void;
};

export function FirstUseCard({ onExpandedChange }: FirstUseCardProps) {
  const hydrated = useFirstUseStore((state) => state.hydrated);
  const micReady = useFirstUseStore((state) => state.micReady);
  const dismissed = useFirstUseStore((state) => state.dismissed);
  const hydrate = useFirstUseStore((state) => state.hydrate);
  const dismiss = useFirstUseStore((state) => state.dismiss);
  const connected = useConnectionStore((state) => state.status === "connected");
  const openOffline = useUiStore((state) => state.openOffline);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const setExpandedWithNotify = (next: boolean) => {
    setExpanded(next);
    onExpandedChange?.(next);
  };

  const done = (connected ? 1 : 0) + (micReady ? 1 : 0);

  const currentLabel = useMemo(() => {
    if (!connected) return "连接电脑";
    if (!micReady) return "允许麦克风权限";
    return "在电脑上完成剩余两步";
  }, [connected, micReady]);

  if (!hydrated || dismissed) return null;

  const steps = [
    {
      key: "connect",
      title: "连接电脑",
      done: connected,
      current: !connected,
      description: connected
        ? "局域网直连；断线后会自动重连。"
        : "手机和电脑连同一个 Wi-Fi，电脑端 Sidekick 保持打开。",
      desktop: false,
    },
    {
      key: "mic",
      title: "允许麦克风权限",
      done: micReady,
      current: connected && !micReady,
      description: micReady
        ? "录音已经成功启动过一次；App 只在按住时录音。"
        : "按住下方麦克风说话时会请求权限；不开启时按住说话会直接失败。",
      desktop: false,
    },
    {
      key: "bailian",
      title: "在电脑上配置百炼语音",
      done: false,
      current: false,
      description: "不配置时录音能开始，但一定转写失败；音频只发往电脑配置的百炼。",
      desktop: true,
    },
    {
      key: "accessibility",
      title: "在电脑上开启辅助功能",
      done: false,
      current: false,
      description: "不开只会复制到剪贴板，没有「回车 / 清空」，也不会自动输入。",
      desktop: true,
    },
  ];

  return (
    <section
      aria-label="首用清单"
      className="mx-3 mt-1 flex-none overflow-hidden rounded-[14px] border border-pet-border bg-pet-surface"
    >
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`首用清单，已完成 ${done}/4，点按${expanded ? "收起" : "展开"}`}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 py-1 pl-3 text-left"
          onClick={() => setExpandedWithNotify(!expanded)}
        >
          <span
            aria-hidden="true"
            className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-pet-border px-1 font-mono text-[10px] text-pet-text"
          >
            {done}/4
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-pet-text">首用清单</span>
            <span className="mt-0.5 block truncate font-mono text-[10px] text-pet-muted">
              还差 {4 - done} 步 · 当前：{currentLabel}
            </span>
          </span>
          {expanded ? (
            <ChevronUp aria-hidden="true" className="size-4 shrink-0 text-pet-muted" />
          ) : (
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-pet-muted" />
          )}
        </button>
        <button
          type="button"
          aria-label="收起首用清单"
          className="mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-pet-muted hover:bg-pet-wash hover:text-pet-text"
          onClick={() => {
            setExpandedWithNotify(false);
            dismiss();
          }}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      {expanded && (
        <div className="max-h-[32vh] overflow-y-auto border-t border-pet-border px-3 pt-2 pb-3">
          <ul className="list-none p-0">
            {steps.map((step, index) => (
              <li
                key={step.key}
                className={cn(
                  "flex gap-2.5 border-t border-pet-border py-2.5 first:border-t-0 first:pt-0",
                  step.current && "bg-transparent",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]",
                    step.done && "border-pet-success text-pet-success",
                    step.current && !step.done && "border-pet-ask text-pet-ask",
                    !step.done && !step.current && "border-pet-border text-pet-muted",
                  )}
                >
                  {step.done ? <Check className="size-3" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-pet-text">{step.title}</span>
                    {step.done && (
                      <span className="font-mono text-[9px] tracking-[0.08em] text-pet-success">
                        已完成
                      </span>
                    )}
                    {step.current && (
                      <span className="font-mono text-[9px] tracking-[0.08em] text-pet-ask">
                        当前步骤
                      </span>
                    )}
                    {step.desktop && (
                      <span className="font-mono text-[9px] tracking-[0.08em] text-pet-muted">
                        在电脑上完成
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-pet-muted">
                    {step.description}
                  </p>
                  {step.key === "connect" && !connected && (
                    <Button
                      type="button"
                      size="sm"
                      className="mt-1.5 h-11 rounded-[10px] bg-pet-primary px-3 text-xs text-pet-primary-foreground"
                      onClick={openOffline}
                    >
                      去连接
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-1 font-mono text-[9.5px] leading-relaxed text-pet-muted">
            本地只验证「连接」与「麦克风」；后两步在电脑上完成，手机不伪造完成态。
          </p>
        </div>
      )}
    </section>
  );
}
