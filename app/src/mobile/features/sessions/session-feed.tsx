import { cn } from "cn";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createHaptics } from "@/mobile/features/pet/haptics";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import type { SessionRow as SessionRowData } from "@/shared/lib/sessions";
import { SessionRow } from "./session-row";

/** 展开态最多展示的行数；更多会话只保留 header 计数。 */
export const SESSION_FEED_MAX_ROWS = 5;

const TERTIARY_TEXT = "text-[color:var(--tertiary,var(--muted-foreground))]";

/**
 * 宠物页消息卡（v16）：白卡、16 圆角、0.5 hairline、极轻浮影。
 *
 * - header 40：「会话」13/400 + 计数 12 + 右侧 14 薄荷 chevron（可点折叠/展开）；
 * - 行高 52，working 行铺 --wash；展开最多 5 行；
 * - 折叠 1 行 + footer「还有 N 条」，展开 + footer「收起」；
 * - 行左滑露出「清除」按钮（D95），一次只开一行；
 * - 空列表整卡不渲染。
 */
type SessionFeedProps = {
  rows: readonly SessionRowData[];
  /** 只有 asking 行可点开；其他行保持只读，不扩大行为。 */
  onOpenAsking?: (row: SessionRowData) => void;
  onClear?: (id: string) => void;
  /** 展开态变化（宠物页用它把鲸鱼从 230 收到 220）。 */
  onExpandedChange?: (expanded: boolean) => void;
  className?: string;
};

/** 折叠时 footer 右侧的三个薄荷小点（纯装饰）。 */
function PiledDots() {
  return (
    <span aria-hidden="true" className="flex items-center">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={cn(
            "size-1.5 rounded-full bg-signal",
            index > 0 && "-ml-[2.5px]",
            index === 0 && "opacity-60",
            index === 1 && "opacity-40",
            index === 2 && "opacity-25",
          )}
        />
      ))}
    </span>
  );
}

export function SessionFeed({
  rows,
  onOpenAsking,
  onClear,
  onExpandedChange,
  className,
}: SessionFeedProps) {
  const [expanded, setExpanded] = useState(false);
  /** 当前左滑展开的行；null = 全部收起。 */
  const [openId, setOpenId] = useState<string | null>(null);
  const canExpand = rows.length > 1;
  const isExpanded = expanded && canExpand;

  // 触感跟随宠物设置里的「震动」开关；getter 避免把旧值闭包进来。
  const haptics = useMemo(
    () => createHaptics({ enabled: () => usePetStore.getState().pet.settings.haptics }),
    [],
  );

  // 列表缩到 1 条时自动回到折叠态，避免留下一个打不开的展开态。
  useEffect(() => {
    if (canExpand) return;
    setExpanded(false);
    setOpenId(null);
  }, [canExpand]);

  useEffect(() => {
    onExpandedChange?.(isExpanded);
  }, [isExpanded, onExpandedChange]);

  // 行消失（清除 / 已完成自动隐藏）时，开合状态跟着清掉。
  useEffect(() => {
    if (openId === null) return;
    if (rows.some((row) => row.id === openId)) return;
    setOpenId(null);
  }, [rows, openId]);

  if (rows.length === 0) return null;

  const shown = isExpanded ? rows.slice(0, SESSION_FEED_MAX_ROWS) : rows.slice(0, 1);
  const toggle = () => {
    // 展开/收起时收起已滑开的行（行可能被折叠隐藏）。
    setOpenId(null);
    setExpanded((value) => !value);
  };

  const handleClear = (id: string) => {
    setOpenId(null);
    haptics.success();
    onClear?.(id);
  };

  const headerLabel = (
    <span className="flex items-baseline gap-[5px]">
      <span className="text-[13px] leading-[18px] font-normal text-muted-foreground">会话</span>
      <span className={cn("text-xs leading-4 font-normal", TERTIARY_TEXT)}>{rows.length}</span>
    </span>
  );

  return (
    <section
      aria-label="会话"
      className={cn(
        "mx-4 mt-2 flex-none overflow-hidden rounded-2xl border-[0.5px] border-border bg-card",
        "shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_-14px_rgba(20,30,35,0.10)]",
        className,
      )}
    >
      {canExpand ? (
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between px-3.5 text-left"
          aria-label={isExpanded ? "收起会话列表" : "展开会话列表"}
          aria-expanded={isExpanded}
          onClick={toggle}
        >
          {headerLabel}
          {isExpanded ? (
            <ChevronUp aria-hidden="true" className="size-3.5 text-primary" />
          ) : (
            <ChevronDown aria-hidden="true" className="size-3.5 text-primary" />
          )}
        </button>
      ) : (
        <div className="flex h-10 items-center justify-between px-3.5">{headerLabel}</div>
      )}

      <ul aria-label="会话列表" className="list-none p-0">
        {shown.map((row) => (
          <SessionRow
            key={row.id}
            row={row}
            open={openId === row.id}
            onOpenChange={(next) => setOpenId(next ? row.id : null)}
            onReveal={() => haptics.light()}
            onOpen={row.display === "asking" && onOpenAsking ? () => onOpenAsking(row) : undefined}
            onClear={onClear ? () => handleClear(row.id) : undefined}
          />
        ))}
      </ul>

      {canExpand && (
        <button
          type="button"
          className="relative flex h-8 w-full items-center justify-between px-3.5 text-left"
          onClick={toggle}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-0 left-[44px] h-[0.5px] bg-border"
          />
          <span className={cn("text-[13px] leading-[18px] font-normal", TERTIARY_TEXT)}>
            {isExpanded ? "收起" : `还有 ${rows.length - 1} 条`}
          </span>
          {!isExpanded && <PiledDots />}
        </button>
      )}
    </section>
  );
}
