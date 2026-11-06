import type { SessionSummary, SessionTool } from "@/protocol/messages";
import { formatRelativeTime } from "@/shared/lib/format";

/**
 * 会话展示层的纯函数与固定文案（桌面 / 手机共用）。
 *
 * 数据来自 `status.sessionList`（D78：只含状态、标题、时间与粗粒度工具类别，
 * 不含提示词/回复/工具参数/路径）。工作行的「正在<动作>」只认白名单枚举，
 * 未知工具由协议层归一为 null → 「正在思考」。
 */

export type SessionDisplayState = "asking" | "working" | "completed" | "idle";

export type SessionRow = SessionSummary & { display: SessionDisplayState };

export type SessionClearMarker = { at: number; through: number };
export type SessionClearMap = Record<string, SessionClearMarker>;

const DISPLAY_ORDER: Record<SessionDisplayState, number> = {
  asking: 0,
  working: 1,
  completed: 2,
  idle: 3,
};

/** 工作中行第二行的中文动作；只展示协议白名单里的粗粒度类别。 */
export const TOOL_ACTION_TEXT: Record<SessionTool, string> = {
  bash: "运行命令",
  read: "阅读文件",
  edit: "修改文件",
  search: "搜索代码",
  web: "查资料",
  agent: "处理子任务",
  plan: "整理计划",
  tool: "使用工具",
};

export function workingActionText(tool: SessionTool | null | undefined): string {
  return tool ? `正在${TOOL_ACTION_TEXT[tool]}` : "正在思考";
}

/** 会话行的状态词（对象状态，不是 AI 聚合态）。 */
export function displayStateText(row: Pick<SessionRow, "display" | "askKind">): string {
  switch (row.display) {
    case "asking":
      return row.askKind === "approval" ? "等你审批" : "等你决定";
    case "working":
      return "工作中";
    case "completed":
      return "已完成";
    default:
      return "空闲";
  }
}

/** 会话标题缺失时的兜底；只显示 id 末尾，不展开内容。 */
export function sessionTitle(row: Pick<SessionRow, "id" | "title">): string {
  if (row.title) return row.title;
  return `新会话 ${row.id.slice(-4)}`;
}

/** 行尾时间：完成态优先用 completedAt。 */
export function rowTime(
  row: Pick<SessionRow, "display" | "completedAt" | "lastEventAt">,
  now = Date.now(),
): string {
  const at = row.display === "completed" && row.completedAt ? row.completedAt : row.lastEventAt;
  return formatRelativeTime(at, now);
}

export function displayStateOf(session: SessionSummary): SessionDisplayState {
  if (session.state === "asking") return "asking";
  if (session.state === "working") return "working";
  if (session.completedAt !== null && session.completedAt !== undefined) return "completed";
  return "idle";
}

export type VisibleSessionsOptions = {
  /** 计算「已完成多久」用的当前时间；缺省取 `Date.now()`。 */
  now?: number;
  /**
   * 手机端：已完成会话超过该时长自动隐藏（0/缺省 = 不自动隐藏）。
   * 桌面端不传，保持「完成态一直保留到手动清除」的旧行为。
   */
  autoClearCompletedAfterMs?: number;
};

/** 可见会话：过滤「已清除 / 已完成超时」的项，并按优先级排序。 */
export function visibleSessions(
  list: readonly SessionSummary[],
  cleared: SessionClearMap,
  options: VisibleSessionsOptions = {},
): SessionRow[] {
  const now = options.now ?? Date.now();
  const autoClearAfterMs = options.autoClearCompletedAfterMs ?? 0;

  return list
    .map((session) => ({ ...session, display: displayStateOf(session) }))
    .filter((session) => {
      const marker = cleared[session.id];
      if (marker && session.lastEventAt <= marker.through) return false;
      if (autoClearAfterMs > 0 && session.display === "completed") {
        const completedAt = session.completedAt ?? session.lastEventAt;
        if (now - completedAt >= autoClearAfterMs) return false;
      }
      return true;
    })
    .sort((left, right) => {
      const byState = DISPLAY_ORDER[left.display] - DISPLAY_ORDER[right.display];
      if (byState !== 0) return byState;
      return right.lastEventAt - left.lastEventAt;
    });
}

/** focus.request 的错误码 → 一句中文（只回错误码，不回内容）。 */
export function focusErrorText(error: string | null | undefined): string {
  switch (error) {
    case "launch_failed":
      return "电脑上没有找到 DeepSeek Harness。";
    case "rate_limited":
      return "刚打开过，稍等一下再试。";
    case "unsupported_platform":
      return "当前电脑暂不支持自动打开。";
    case "unsupported_source":
      return "这个会话类型还不支持打开。";
    default:
      return "电脑没有响应，稍后再试。";
  }
}
