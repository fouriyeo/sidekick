import { cn } from "cn";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createHaptics } from "@/mobile/features/pet/haptics";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import type { SessionRow as SessionRowData } from "@/shared/lib/sessions";
import { SessionRow } from "./session-row";

/** 展开态最多展示的行数；更多会话只保留 header 计数。 */
export const SESSION_FEED_MAX_ROWS = 5;

/** 卡片内部固定尺寸（px）；字号/行高改动只改这里，宠物舞台按它算预留高度。 */
export const SESSION_FEED_HEADER_H = 40;
export const SESSION_ROW_H = 50;
export const SESSION_FEED_FOOTER_H = 32;
/** 卡片顶部与顶栏的间距（原来在文档流里的 mt-2）。 */
export const SESSION_FEED_TOP_GAP = 8;

/**
 * 折叠态卡片占用的高度（含顶部间距）。
 *
 * 会话卡现在是浮层（D107）：宠物舞台按这个值在顶部留出折叠卡的位置，
 * 展开只加高卡片，鲸鱼不位移、不缩放。
 */
export function sessionFeedReserveHeight(rowCount: number): number {
  if (rowCount <= 0) return 0;
  return (
    SESSION_FEED_TOP_GAP +
    SESSION_FEED_HEADER_H +
    SESSION_ROW_H +
    (rowCount > 1 ? SESSION_FEED_FOOTER_H : 0)
  );
}

const TERTIARY_TEXT = "text-[color:var(--tertiary,var(--muted-foreground))]";

/**
 * 宠物页会话卡（v18 / D107）：白卡、16 圆角、0.5 hairline、极轻浮影。
 *
 * - 浮在宠物舞台上（绝对定位由 PetPage 传入），展开时只加高卡片：鲸鱼不动；
 * - header 40：「会话」12/16 + 计数 11 + 右侧 12 薄荷 chevron（可点折叠/展开）；
 * - 行高 50、标题 13/18、副行 11.5/16；working 行铺 --wash；展开最多 5 行；
 * - 折叠 1 行 + footer「还有 N 条」，展开 + footer「收起」；
 * - 行左滑露出「清除」按钮（D95），一次只开一行；
 * - 已完成行可点（onOpenFocus → focus.request），刚完成的行铺 1.4s 薄荷脉冲；
 * - 空列表整卡不渲染。
 */
type SessionFeedProps = {
  rows: readonly SessionRowData[];
  /** 展开态由宠物页持有：自动展开 / 返回键收起都要能改它（受控）。 */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** 只有 asking 行可点开等你决定页；其他行保持只读。 */
  onOpenAsking?: (row: SessionRowData) => void;
  /** 已完成行：点它让电脑上的 DSH 回到前台（focus.request）。 */
  onOpenFocus?: (id: string) => void;
  onClear?: (id: string) => void;
  /** 请求电脑唤起中的行尾 spinner。 */
  pendingFocusId?: string | null;
  /** 刚完成的会话 id（薄荷脉冲 + 保证它在展开的 5 行里可见）。 */
  freshIds?: readonly string[];
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
  expanded,
  onExpandedChange,
  onOpenAsking,
  onOpenFocus,
  onClear,
  pendingFocusId = null,
  freshIds,
  className,
}: SessionFeedProps) {
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
    setOpenId(null);
    if (expanded) onExpandedChange(false);
  }, [canExpand, expanded, onExpandedChange]);

  // 行消失（清除 / 已完成自动隐藏）时，开合状态跟着清掉。
  useEffect(() => {
    if (openId === null) return;
    if (rows.some((row) => row.id === openId)) return;
    setOpenId(null);
  }, [rows, openId]);

  // 展开态被外部改掉（自动展开 / 返回键收起 / 点空白）时，收起已滑开的行。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在 expanded 变化时清一次，不读它的值。
  useEffect(() => {
    setOpenId(null);
  }, [expanded]);

  if (rows.length === 0) return null;

  // 折叠 1 行；展开最多 5 行。刚完成的行如果排在前 5 之外，用第 5 位换成它，
  // 保证「完成即展开」时用户能看见是哪一条。
  let shown: SessionRowData[] = isExpanded
    ? rows.slice(0, SESSION_FEED_MAX_ROWS)
    : rows.slice(0, 1);
  if (isExpanded && freshIds && freshIds.length > 0) {
    const missingId = freshIds.find(
      (id) => !shown.some((row) => row.id === id) && rows.some((row) => row.id === id),
    );
    const freshRow = missingId ? rows.find((row) => row.id === missingId) : undefined;
    if (freshRow) shown = [...shown.slice(0, SESSION_FEED_MAX_ROWS - 1), freshRow];
  }

  // 高度用 max-height 过渡：展开时卡片平滑长高；收起直接切回折叠态。
  const maxHeight =
    SESSION_FEED_HEADER_H +
    shown.length * SESSION_ROW_H +
    (canExpand ? SESSION_FEED_FOOTER_H : 0) +
    // 上下各 0.5px hairline，避免 1px 被裁掉。
    2;

  const toggle = () => {
    // 展开/收起时收起已滑开的行（行可能被折叠隐藏）。
    setOpenId(null);
    onExpandedChange(!isExpanded);
  };

  const handleClear = (id: string) => {
    setOpenId(null);
    haptics.success();
    onClear?.(id);
  };

  const headerLabel = (
    <span className="flex items-baseline gap-1">
      <span className="text-xs leading-4 font-normal text-muted-foreground">会话</span>
      <span className={cn("text-[11px] leading-[15px] font-normal", TERTIARY_TEXT)}>
        {rows.length}
      </span>
    </span>
  );

  return (
    <section
      aria-label="会话"
      style={{ maxHeight }}
      className={cn(
        "ms-feed flex-none overflow-hidden rounded-2xl border-[0.5px] border-border bg-card",
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
            <ChevronUp aria-hidden="true" className="size-3 text-primary" />
          ) : (
            <ChevronDown aria-hidden="true" className="size-3 text-primary" />
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
            fresh={freshIds?.includes(row.id) ?? false}
            pendingFocus={pendingFocusId === row.id}
            onOpenChange={(next) => setOpenId(next ? row.id : null)}
            onReveal={() => haptics.light()}
            onOpen={
              row.display === "asking" && onOpenAsking
                ? () => onOpenAsking(row)
                : row.display === "completed" && onOpenFocus
                  ? () => {
                      haptics.light();
                      onOpenFocus(row.id);
                    }
                  : undefined
            }
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
          <span className={cn("text-xs leading-4 font-normal", TERTIARY_TEXT)}>
            {isExpanded ? "收起" : `还有 ${rows.length - 1} 条`}
          </span>
          {!isExpanded && <PiledDots />}
        </button>
      )}
    </section>
  );
}
