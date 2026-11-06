import { expect, test } from "vitest";
import type { SessionSummary } from "@/protocol/messages";
import {
  displayStateOf,
  displayStateText,
  focusErrorText,
  rowTime,
  type SessionClearMap,
  sessionTitle,
  TOOL_ACTION_TEXT,
  visibleSessions,
  workingActionText,
} from "./sessions";

const NOW = 1_700_000_000_000;

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s-1",
    title: "重构登录模块",
    source: "dsh",
    state: "working",
    askKind: null,
    tool: "edit",
    lastEventAt: NOW - 2 * 60_000,
    completedAt: null,
    ...overrides,
  };
}

test("D78 工具动作白名单全量映射", () => {
  expect(TOOL_ACTION_TEXT).toEqual({
    bash: "运行命令",
    read: "阅读文件",
    edit: "修改文件",
    search: "搜索代码",
    web: "查资料",
    agent: "处理子任务",
    plan: "整理计划",
    tool: "使用工具",
  });
  for (const tool of Object.keys(TOOL_ACTION_TEXT) as Array<keyof typeof TOOL_ACTION_TEXT>) {
    expect(workingActionText(tool)).toBe(`正在${TOOL_ACTION_TEXT[tool]}`);
  }
  expect(workingActionText(null)).toBe("正在思考");
  expect(workingActionText(undefined)).toBe("正在思考");
});

test("会话展示态与排序优先级", () => {
  expect(displayStateOf(session({ state: "asking" }))).toBe("asking");
  expect(displayStateOf(session({ state: "working" }))).toBe("working");
  expect(displayStateOf(session({ state: "idle", completedAt: NOW }))).toBe("completed");
  expect(displayStateOf(session({ state: "idle", completedAt: null }))).toBe("idle");

  const rows = visibleSessions(
    [
      session({ id: "idle", state: "idle", completedAt: null, lastEventAt: NOW - 1000 }),
      session({ id: "completed", state: "idle", completedAt: NOW - 1000 }),
      session({ id: "working", state: "working", lastEventAt: NOW - 3000 }),
      session({ id: "asking", state: "asking", lastEventAt: NOW - 5000 }),
    ],
    {},
  );
  expect(rows.map((row) => row.id)).toEqual(["asking", "working", "completed", "idle"]);
});

test("清除标记隐藏旧事件，但新事件会重新出现", () => {
  const cleared: SessionClearMap = { "s-1": { at: NOW, through: NOW - 60_000 } };
  expect(visibleSessions([session({ lastEventAt: NOW - 120_000 })], cleared)).toHaveLength(0);
  expect(visibleSessions([session({ lastEventAt: NOW - 30_000 })], cleared)).toHaveLength(1);
});

test("已完成会话超过自动隐藏时长后不可见，其他状态不受影响", () => {
  const twoHours = 2 * 60 * 60_000;
  const list = [
    session({
      id: "fresh",
      state: "idle",
      completedAt: NOW - 60 * 60_000,
      lastEventAt: NOW - 60 * 60_000,
    }),
    session({
      id: "stale",
      state: "idle",
      completedAt: NOW - 3 * 60 * 60_000,
      lastEventAt: NOW - 3 * 60 * 60_000,
    }),
    session({ id: "working", state: "working", lastEventAt: NOW - 5 * 60 * 60_000 }),
    session({ id: "asking", state: "asking", lastEventAt: NOW - 5 * 60 * 60_000 }),
    session({ id: "idle", state: "idle", completedAt: null, lastEventAt: NOW - 5 * 60 * 60_000 }),
  ];

  const rows = visibleSessions(list, {}, { now: NOW, autoClearCompletedAfterMs: twoHours });
  expect(rows.map((row) => row.id).sort()).toEqual(["asking", "fresh", "idle", "working"]);
});

test("自动隐藏正好 2 小时算超时，未来时间戳保持可见", () => {
  const twoHours = 2 * 60 * 60_000;
  const at = (completedAt: number) =>
    session({ state: "idle", completedAt, lastEventAt: completedAt });

  expect(
    visibleSessions([at(NOW - twoHours)], {}, { now: NOW, autoClearCompletedAfterMs: twoHours }),
  ).toHaveLength(0);
  expect(
    visibleSessions(
      [at(NOW - twoHours + 1)],
      {},
      { now: NOW, autoClearCompletedAfterMs: twoHours },
    ),
  ).toHaveLength(1);
  expect(
    visibleSessions([at(NOW + 60_000)], {}, { now: NOW, autoClearCompletedAfterMs: twoHours }),
  ).toHaveLength(1);
});

test("不传自动隐藏选项时保持旧行为（桌面）", () => {
  const old = session({
    state: "idle",
    completedAt: NOW - 10 * 60 * 60_000,
    lastEventAt: NOW - 10 * 60 * 60_000,
  });
  expect(visibleSessions([old], {})).toHaveLength(1);
});

test("会话文案与兜底", () => {
  expect(displayStateText({ display: "asking", askKind: "approval" })).toBe("等你审批");
  expect(displayStateText({ display: "asking", askKind: "question" })).toBe("等你决定");
  expect(displayStateText({ display: "working" })).toBe("工作中");
  expect(displayStateText({ display: "completed" })).toBe("已完成");
  expect(sessionTitle({ id: "session-1234", title: "修复登录" })).toBe("修复登录");
  expect(sessionTitle({ id: "session-1234", title: null })).toBe("新会话 1234");
  expect(
    rowTime({ display: "completed", completedAt: NOW - 60_000, lastEventAt: NOW - 120_000 }, NOW),
  ).toBe("1 分钟前");
});

test("focus 错误码转中文", () => {
  expect(focusErrorText("launch_failed")).toContain("没有找到 DeepSeek Harness");
  expect(focusErrorText("rate_limited")).toContain("稍等");
  expect(focusErrorText(null)).toContain("没有响应");
});
