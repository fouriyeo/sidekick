import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
};

/** 方向 B 的空状态：虚线仪器框 + 邀请式文案，不是一句冷冰冰的「无数据」。 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-7 text-center">
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground"
      >
        {icon}
      </span>
      <p className="text-[13.5px] font-medium">{title}</p>
      <p className="max-w-[26em] text-[11.5px] leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action}
    </div>
  );
}
