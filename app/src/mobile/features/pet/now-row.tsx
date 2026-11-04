import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
import { useUiStore } from "@/mobile/ui-store";
import {
  type SessionDisplayState,
  visibleSessions,
  workingActionText,
} from "@/shared/lib/sessions";
import { SignalBars, type SignalLevel, type SignalTone } from "@/shared/ui/signal-bars";
import { displayStateOf } from "./ai-status";
import { usePetStore } from "./pet-store";

/** 舞台内的 AI 状态色 / 信号格：与 shared/lib/status 的口径一致，色值走 pet 令牌。 */
const AI_LEVEL: Record<SessionDisplayState, SignalLevel> = {
  asking: 1,
  working: 2,
  completed: 3,
  idle: 1,
};

const AI_TONE: Record<SessionDisplayState, SignalTone> = {
  asking: "decide",
  working: "signal",
  completed: "success",
  idle: "muted",
};

const AI_TEXT: Record<SessionDisplayState, string> = {
  asking: "等你决定",
  working: "工作中",
  completed: "完成",
  idle: "空闲",
};

/** 舞台上需要跟随 pet 令牌的变量：SignalBars / 文本色都从这里取。 */
const STAGE_VARS =
  "[--signal:var(--pet-signal)] [--decide:var(--pet-ask)] [--success:var(--pet-success)] [--muted-foreground:var(--pet-muted)]";

/**
 * 宠物页常驻「现在」行：一屏看到 AI 在干什么；点按进入动态页，
 * 「等你决定」直达等你决定页，未连接则去连接页。
 */
export function NowRow() {
  const petPhase = usePetStore((state) => state.pet.phase);
  const aiState = usePetStore((state) => state.ai.state);
  const connected = useConnectionStore((state) => state.status === "connected");
  const raw = useSessionStore((state) => state.raw);
  const cleared = useSessionStore((state) => state.cleared);
  const setView = useUiStore((state) => state.setView);
  const openOffline = useUiStore((state) => state.openOffline);

  const rows = useMemo(() => visibleSessions(raw, cleared), [raw, cleared]);
  const displayAi = displayStateOf(petPhase, aiState);
  const askingRows = rows.filter((row) => row.display === "asking");
  const workingRow = rows.find((row) => row.display === "working");
  const firstForState =
    rows.find((row) => row.display === displayAi) ?? rows.find((row) => row.display !== "idle");

  const title = (() => {
    if (!connected) return "点这里去连接";
    if (petPhase === "away") return "小跟班在休息";
    if (displayAi === "asking") {
      if (askingRows.length > 1) return `${askingRows.length} 个决定在电脑上等你`;
      return firstForState?.title ?? "在电脑上等你决定";
    }
    if (displayAi === "working") return firstForState?.title ?? "AI 正在工作";
    if (displayAi === "completed") return firstForState?.title ?? "刚刚完成";
    return "小跟班在陪你";
  })();

  // 工作中行按 D78 显示「正在<动作>」，不再写「工作中」；无工具类别时「正在思考」。
  const working = connected && displayAi === "working";
  const label = !connected
    ? "还没连上电脑"
    : working
      ? workingActionText(workingRow?.tool)
      : AI_TEXT[displayAi];
  const level = connected ? AI_LEVEL[displayAi] : 1;
  const tone = connected ? AI_TONE[displayAi] : "muted";
  const onOpen =
    displayAi === "asking" && connected
      ? () => setView("asking")
      : connected
        ? () => setView("stream")
        : openOffline;

  return (
    <button
      type="button"
      aria-label={`AI 状态：${label}，${title}`}
      data-now-state={connected ? displayAi : "offline"}
      className={cn(
        "mx-3 mt-2 flex min-h-12 flex-none items-center gap-2 rounded-[14px] border border-pet-border bg-pet-surface px-3 py-1.5 text-left",
        STAGE_VARS,
      )}
      onClick={onOpen}
    >
      <SignalBars level={level} tone={tone} />
      {working && (
        <span
          aria-hidden="true"
          data-now-spinner
          className="size-2.5 shrink-0 animate-spin rounded-full border border-current border-t-transparent text-signal motion-reduce:animate-none"
        />
      )}
      <span className="shrink-0 text-[13px] font-medium text-pet-text">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-pet-muted">
        {title}
      </span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-pet-muted" />
    </button>
  );
}
