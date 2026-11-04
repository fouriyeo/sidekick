import { cn } from "cn";
import { SYSTEM_SECTIONS, type SystemSection } from "@/desktop/lib/desktop-nav";

type SystemSegmentsProps = {
  section: SystemSection;
  onChange: (section: SystemSection) => void;
};

/** 「系统」页内的 4 段 segmented：连接 / 语音 / 联动 / 消息，各是独立内容。 */
export function SystemSegments({ section, onChange }: SystemSegmentsProps) {
  return (
    <div
      role="tablist"
      aria-label="系统分段"
      className="mt-3 flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card p-1"
    >
      {SYSTEM_SECTIONS.map((item) => {
        const active = section === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              "inline-flex h-[30px] items-center rounded-md px-3.5 text-[12px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "bg-wash text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                : "text-muted-foreground hover:bg-wash/60 hover:text-foreground",
            )}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
      <span className="ml-auto hidden shrink-0 pr-2 font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase lg:inline">
        系统 · 低频配置与排障
      </span>
    </div>
  );
}
