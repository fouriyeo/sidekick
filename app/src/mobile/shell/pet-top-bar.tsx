import { cn } from "cn";
import { MessageCircle, Settings } from "lucide-react";
import { useConnectionView } from "@/mobile/features/connect/connection-view";
import { useUiStore } from "@/mobile/ui-store";
import type { SignalTone } from "@/shared/ui/signal-bars";

const ICON_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--wash)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pet-bg)] focus-visible:outline-none";

/** 连接状态只用一个 5px 点做第二线索：连上是薄荷，其它一律中性灰。 */
const DOT_CLASS: Record<SignalTone, string> = {
  signal: "bg-signal",
  muted: "bg-muted-foreground",
  decide: "bg-decide",
  success: "bg-success",
  danger: "bg-destructive",
};

/**
 * 宠物页顶部 44 条（v16）：左 gear（线性 20 → 设置）/ 中连接状态（可点 → 连接页）/
 * 右 chat（线性 20 → 消息）。不再套 StatusChip 胶囊，只用「小圆点 + 15/400 文案」。
 */
export function PetTopBar() {
  const setView = useUiStore((state) => state.setView);
  const openOffline = useUiStore((state) => state.openOffline);
  const connection = useConnectionView();

  return (
    <header className="flex h-11 flex-none items-center justify-between gap-1 px-3">
      <button
        type="button"
        aria-label="设置"
        className={ICON_BUTTON}
        onClick={() => setView("settings")}
      >
        <Settings aria-hidden="true" className="size-5" strokeWidth={1.6} />
      </button>

      <button
        type="button"
        aria-label={`连接状态：${connection.label}，点按查看连接`}
        className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-[15px] leading-5 font-normal text-muted-foreground transition-colors hover:bg-[var(--wash)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pet-bg)] focus-visible:outline-none"
        onClick={openOffline}
      >
        <span
          aria-hidden="true"
          className={cn("size-[5px] shrink-0 rounded-full", DOT_CLASS[connection.tone])}
        />
        <span className="truncate">
          {connection.label}
          {connection.detail ? ` · ${connection.detail}` : ""}
        </span>
      </button>

      <button
        type="button"
        aria-label="消息"
        className={ICON_BUTTON}
        onClick={() => setView("chat")}
      >
        <MessageCircle aria-hidden="true" className="size-5" strokeWidth={1.6} />
      </button>
    </header>
  );
}
