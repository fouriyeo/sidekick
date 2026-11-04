import type { StatusMessage } from "@/protocol/messages";
import type { ActivityInput } from "@/shared/lib/activity-store";
import {
  type SessionRow,
  sessionTitle,
  visibleSessions,
  workingActionText,
} from "@/shared/lib/sessions";
import { deviceCountFromClients } from "./desktop-clients-store";

/**
 * 把状态广播 / 客户端数变化翻译成「最近事件」条目。
 *
 * 只使用协议里已有的粗粒度信息（状态、会话标题、工具类别、客户端数），
 * 不含提示词、回复、路径；纯函数，方便单测。
 */

function findSession(
  rows: readonly SessionRow[],
  display: SessionRow["display"],
): SessionRow | null {
  return rows.find((row) => row.display === display) ?? null;
}

/** 首次快照（previous = null）不生成事件：刚打开软件不算「刚刚发生」。 */
export function describeStatusActivity(
  message: StatusMessage,
  previous: StatusMessage["state"] | null,
): ActivityInput | null {
  if (previous === null || previous === message.state) return null;
  const rows = visibleSessions(message.sessionList ?? [], {});

  if (message.state === "asking") {
    const row = findSession(rows, "asking");
    if (!row) return { kind: "ai", title: "AI 在等你决定", detail: "打开会话页看看是谁在等" };
    return {
      kind: "ai",
      title: `${sessionTitle(row)} · 等你决定`,
      detail: row.askKind === "approval" ? "等你审批" : "等你回答",
    };
  }

  if (message.state === "working") {
    const row = findSession(rows, "working");
    if (!row) return { kind: "ai", title: "AI 开始工作", detail: "不需要你操作" };
    return {
      kind: "ai",
      title: `${sessionTitle(row)} · 开始工作`,
      detail: workingActionText(row.tool),
    };
  }

  if (message.state === "completed") {
    const row = findSession(rows, "completed");
    if (!row) return { kind: "ai", title: "AI 完成了一轮工作", detail: "已推送到手机" };
    return { kind: "ai", title: `${sessionTitle(row)} · 完成`, detail: "已推送到手机" };
  }

  return { kind: "ai", title: "AI 回到空闲", detail: "没有进行中的会话" };
}

/** 设备数（客户端数 - 1）变化 → 连接事件；首次收到不生成事件。 */
export function describeClientsActivity(
  previous: number | null,
  next: number,
): ActivityInput | null {
  if (previous === null || previous === next) return null;
  const before = deviceCountFromClients(previous);
  const after = deviceCountFromClients(next);
  if (after === before) return null;
  if (after > before) {
    return { kind: "connection", title: "手机已连接", detail: `局域网直连 · 当前 ${after} 台设备` };
  }
  return { kind: "connection", title: "手机已断开", detail: `当前 ${after} 台设备` };
}
