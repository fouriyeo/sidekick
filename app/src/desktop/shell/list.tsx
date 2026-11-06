import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/**
 * iOS 分组列表：组标题（可选）+ 一张不透明白卡，卡内分隔线内缩到文字起点。
 * 内容层不用玻璃材质（HIG：glass 只给导航/控件层），深度靠卡片投影和高光细线。
 */
export function ListGroup({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2", className)}>
      {(title || action) && (
        <header className="flex min-h-5 items-center justify-between gap-3 px-1.5">
          {title ? (
            <h2 className="truncate text-[13px] leading-none font-normal text-muted-foreground">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </header>
      )}
      <div className="dsl-card">{children}</div>
    </section>
  );
}

const TONE_TEXT = {
  default: "text-foreground",
  signal: "text-signal",
  danger: "text-destructive",
  muted: "text-muted-foreground",
} as const;

export type ListRowTone = keyof typeof TONE_TEXT;

/** iOS 设置同款彩色图标块（30×30、9 圆角、白字）。 */
export type ListIconTone = "blue" | "green" | "orange" | "purple" | "pink" | "teal" | "gray";

const TILE_BG: Record<ListIconTone, string> = {
  blue: "bg-[var(--ios-blue)]",
  green: "bg-[var(--ios-green)]",
  orange: "bg-[var(--ios-orange)]",
  purple: "bg-[var(--ios-purple)]",
  pink: "bg-[var(--ios-pink)]",
  teal: "bg-[var(--ios-teal)]",
  gray: "bg-[var(--ios-gray)]",
};

type ListRowProps = {
  /** 左侧图标：给了 `iconTone` 就是彩色图标块，否则是薄荷单色图标。 */
  icon?: ReactNode;
  iconTone?: ListIconTone;
  title: ReactNode;
  /** 标题下的第二行（弱化、单行省略）。 */
  detail?: ReactNode;
  /** 右侧值；有 `chevron` 时值靠左、箭头贴最右。 */
  meta?: ReactNode;
  mono?: boolean;
  chevron?: boolean;
  /** 右侧控件（开关 / 分段控件）；有控件时不再显示箭头。 */
  control?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: ListRowTone;
  /** 分隔线左缩进：默认 16，带图标块的行由组件自动算 60。 */
  separatorInset?: number;
  className?: string;
  ariaLabel?: string;
  titleAttr?: string;
};

/** 一行 52 高：整行可点（有 onClick 时渲染成按钮），右侧最多一个值或控件。 */
export function ListRow({
  icon,
  iconTone,
  title,
  detail,
  meta,
  mono = false,
  chevron = false,
  control,
  onClick,
  disabled = false,
  tone = "default",
  separatorInset,
  className,
  ariaLabel,
  titleAttr,
}: ListRowProps) {
  const inset = separatorInset ?? (iconTone ? 60 : 16);
  const content = (
    <>
      {icon &&
        (iconTone ? (
          <span aria-hidden="true" className={cn("dsl-tile", TILE_BG[iconTone])}>
            {icon}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="grid size-[22px] shrink-0 place-items-center text-signal"
          >
            {icon}
          </span>
        ))}
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className={cn("truncate text-[15px] leading-tight font-normal", TONE_TEXT[tone])}>
          {title}
        </span>
        {detail && (
          <span className="truncate text-[13px] leading-tight text-muted-foreground">{detail}</span>
        )}
      </span>
      {meta !== undefined && meta !== null && (
        <span
          className={cn(
            "shrink-0 truncate text-[15px] text-muted-foreground tabular-nums",
            mono && "font-mono text-[13px] tracking-[-0.01em]",
            tone === "danger" && "text-destructive",
          )}
        >
          {meta}
        </span>
      )}
      {control && <span className="flex shrink-0 items-center">{control}</span>}
      {chevron && !control && (
        <ChevronRight
          aria-hidden="true"
          className="size-[17px] shrink-0 text-tertiary"
          strokeWidth={2.5}
        />
      )}
    </>
  );

  const style = { "--row-inset": `${inset}px` } as CSSProperties;

  if (!onClick) {
    return (
      <div
        className={cn("dsl-row", disabled && "opacity-50", className)}
        style={style}
        title={titleAttr}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn("dsl-row", disabled && "pointer-events-none opacity-50", className)}
      style={style}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={titleAttr}
    >
      {content}
    </button>
  );
}

/** 卡内空态：一行居中弱化文字，不放插画和长说明。 */
export function ListEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[76px] items-center justify-center px-4 py-5 text-center text-[14px] text-muted-foreground">
      {children}
    </div>
  );
}

/** 卡内动作行：一行的文字动作（iOS 的「在 DSH 打开 / 清空」放在卡尾）。 */
export function ListActionRow({
  children,
  onClick,
  tone = "signal",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "signal" | "danger" | "default";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "dsl-row justify-center text-[15px] font-normal",
        tone === "danger" && "text-destructive",
        tone === "signal" && "text-signal",
        disabled && "pointer-events-none opacity-40",
      )}
      style={{ minHeight: 48 }}
    >
      {children}
    </button>
  );
}
