import { describe, expect, it } from "vitest";
import type { StatusMessage } from "@/protocol/messages";
import { describeClientsActivity, describeStatusActivity } from "./desktop-activity-events";

const NOW = 1_800_000_000_000;

function status(overrides: Partial<StatusMessage> = {}): StatusMessage {
  return {
    type: "status",
    v: 1,
    source: "dsh",
    state: "working",
    sessions: 1,
    sessionList: [],
    ts: NOW,
    ...overrides,
  };
}

describe("describeStatusActivity", () => {
  it("首次快照不生成事件（刚打开软件不算刚刚发生）", () => {
    expect(describeStatusActivity(status(), null)).toBeNull();
  });

  it("状态没变化不重复记录", () => {
    expect(describeStatusActivity(status(), "working")).toBeNull();
  });

  it("工作中事件带上 D78 工具动作", () => {
    const event = describeStatusActivity(
      status({
        state: "working",
        sessionList: [
          {
            id: "s1",
            title: "修复剪贴板去重",
            source: "dsh",
            state: "working",
            askKind: null,
            tool: "bash",
            lastEventAt: NOW,
            completedAt: null,
          },
        ],
      }),
      "idle",
    );

    expect(event?.kind).toBe("ai");
    expect(event?.title).toBe("修复剪贴板去重 · 开始工作");
    expect(event?.detail).toBe("正在运行命令");
  });

  it("等你决定事件区分审批与提问", () => {
    const approval = describeStatusActivity(
      status({
        state: "asking",
        sessionList: [
          {
            id: "s1",
            title: "重构登录模块",
            source: "dsh",
            state: "asking",
            askKind: "approval",
            tool: null,
            lastEventAt: NOW,
            completedAt: null,
          },
        ],
      }),
      "working",
    );
    expect(approval?.title).toBe("重构登录模块 · 等你决定");
    expect(approval?.detail).toBe("等你审批");
  });

  it("完成态用 completedAt 对应的会话", () => {
    const event = describeStatusActivity(
      status({
        state: "completed",
        sessionList: [
          {
            id: "s1",
            title: "统一连接状态文案",
            source: "dsh",
            state: "idle",
            askKind: null,
            tool: null,
            lastEventAt: NOW,
            completedAt: NOW - 1000,
          },
        ],
      }),
      "working",
    );
    expect(event?.title).toBe("统一连接状态文案 · 完成");
    expect(event?.detail).toBe("已推送到手机");
  });
});

describe("describeClientsActivity", () => {
  it("首次收到客户端数不生成事件", () => {
    expect(describeClientsActivity(null, 2)).toBeNull();
  });

  it("设备数增加（客户端总数 − 1）→ 手机已连接", () => {
    const event = describeClientsActivity(1, 2);
    expect(event?.kind).toBe("connection");
    expect(event?.title).toBe("手机已连接");
    expect(event?.detail).toContain("1 台设备");
  });

  it("只有桌面自己连上时不算手机连接", () => {
    expect(describeClientsActivity(0, 1)).toBeNull();
  });

  it("设备数减少 → 手机已断开", () => {
    const event = describeClientsActivity(3, 2);
    expect(event?.title).toBe("手机已断开");
  });
});
