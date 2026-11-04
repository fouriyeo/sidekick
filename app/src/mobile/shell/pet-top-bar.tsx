import { MessageCircle, Settings } from "lucide-react";
import { useConnectionView } from "@/mobile/features/connect/connection-view";
import { useUiStore } from "@/mobile/ui-store";
import { StatusChip } from "@/shared/ui/status-chip";

/**
 * 宠物页顶部 44 状态条：左设置、中间连接状态整块可点（→ 连接页）、右消息。
 *
 * 舞台用 `--pet-*` 令牌，所以把 StatusChip 依赖的壳层语义变量在本作用域里
 * 重新绑定到宠物令牌（深浅主题都成立，不写死颜色）。
 */
const STAGE_VARS =
  "[--card:var(--pet-surface)] [--border:var(--pet-border)] [--signal:var(--pet-signal)] [--muted-foreground:var(--pet-muted)] [--wash:var(--pet-wash)] [--decide:var(--pet-ask)] [--success:var(--pet-success)] [--destructive:var(--pet-danger)]";

const ICON_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-full text-pet-muted transition-colors hover:bg-pet-wash hover:text-pet-text focus-visible:ring-2 focus-visible:ring-pet-signal focus-visible:ring-offset-2 focus-visible:ring-offset-pet-bg focus-visible:outline-none";

export function PetTopBar() {
  const setView = useUiStore((state) => state.setView);
  const openOffline = useUiStore((state) => state.openOffline);
  const connection = useConnectionView();

  return (
    <header className="flex min-h-11 flex-none items-center gap-1 px-[calc(env(safe-area-inset-left)+6px)] pr-[calc(env(safe-area-inset-right)+6px)]">
      <button
        type="button"
        aria-label="设置"
        className={ICON_BUTTON}
        onClick={() => setView("settings")}
      >
        <Settings className="size-5" />
      </button>

      <div className="flex min-w-0 flex-1 justify-center">
        <StatusChip
          label={connection.label}
          detail={connection.detail ? `· ${connection.detail}` : undefined}
          level={connection.level}
          tone={connection.tone}
          onClick={openOffline}
          ariaLabel={`连接状态：${connection.label}，点按查看连接`}
          className={`h-11 max-w-full border-0 bg-transparent px-1.5 hover:bg-pet-wash ${STAGE_VARS}`}
        />
      </div>

      <button
        type="button"
        aria-label="消息"
        className={ICON_BUTTON}
        onClick={() => setView("chat")}
      >
        <MessageCircle className="size-5" />
      </button>
    </header>
  );
}
