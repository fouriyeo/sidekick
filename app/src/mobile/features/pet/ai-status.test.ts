import { describe, expect, it } from "vitest";
import type { StatusMessage, StatusState } from "@/protocol/messages";
import {
  AI_COMPLETED_MS,
  AI_WORK_CAPTION_MS,
  aiCaptionCopyId,
  applyAiStatus,
  createIdleAiStatus,
  displayStateOf,
  settleAiStatus,
} from "./ai-status";
import type { PetPhase } from "./types";

const NOW = new Date(2026, 10, 2, 12, 0, 0, 0).getTime();

function statusMessage(state: StatusState, overrides: Partial<StatusMessage> = {}): StatusMessage {
  return {
    type: "status",
    v: 1,
    source: "dsh",
    state,
    sessions: 1,
    ts: NOW,
    ...overrides,
  };
}

describe("applyAiStatus", () => {
  it("进入 working 时返回 from/to 元数据", () => {
    const { status, transition, stale } = applyAiStatus(
      createIdleAiStatus(),
      statusMessage("working"),
      { now: NOW },
    );

    expect(stale).toBe(false);
    expect(status.state).toBe("working");
    expect(status.enteredAt).toBe(NOW);
    expect(status.completedUntil).toBeNull();
    expect(transition).toMatchObject({ from: "idle", to: "working", at: NOW });
  });

  it("asking 一直保留，直到下一份状态消息", () => {
    const first = applyAiStatus(createIdleAiStatus(), statusMessage("working"), { now: NOW });
    const asking = applyAiStatus(first.status, statusMessage("asking"), { now: NOW + 100 });

    expect(asking.transition).toMatchObject({ from: "working", to: "asking" });
    expect(asking.status.state).toBe("asking");
    expect(settleAiStatus(asking.status, NOW + 60 * 60_000).state).toBe("asking");
  });

  it("同状态快照只更新元数据，不重置进入时间", () => {
    const first = applyAiStatus(createIdleAiStatus(), statusMessage("working"), { now: NOW });
    const again = applyAiStatus(first.status, statusMessage("working", { sessions: 3 }), {
      now: NOW + 1200,
    });

    expect(again.transition).toBeNull();
    expect(again.status.state).toBe("working");
    expect(again.status.enteredAt).toBe(NOW);
    expect(again.status.sessions).toBe(3);
  });

  it("completed 缺省展示 3 秒，然后回到 resume", () => {
    const working = applyAiStatus(createIdleAiStatus(), statusMessage("working"), { now: NOW });
    const completed = applyAiStatus(
      working.status,
      statusMessage("completed", { resume: "working", remainingMs: null }),
      { now: NOW + 500 },
    );

    expect(completed.stale).toBe(false);
    expect(completed.status.state).toBe("completed");
    expect(completed.status.resume).toBe("working");
    // 消息 ts 是 NOW，now 已到 NOW+500，所以只剩 2500ms。
    expect(completed.status.completedUntil).toBe(NOW + AI_COMPLETED_MS);
    expect(completed.transition?.completedMs).toBe(AI_COMPLETED_MS - 500);

    const stillCelebrating = settleAiStatus(completed.status, NOW + AI_COMPLETED_MS - 1);
    expect(stillCelebrating.state).toBe("completed");

    const settled = settleAiStatus(completed.status, NOW + AI_COMPLETED_MS);
    expect(settled.state).toBe("working");
    expect(settled.completedUntil).toBeNull();
  });

  it("completed 用 remainingMs 校正展示时长", () => {
    const completed = applyAiStatus(
      createIdleAiStatus(),
      statusMessage("completed", { resume: "idle", remainingMs: 2100 }),
      { now: NOW },
    );

    expect(completed.status.completedUntil).toBe(NOW + 2100);
    expect(settleAiStatus(completed.status, NOW + 2099).state).toBe("completed");
    expect(settleAiStatus(completed.status, NOW + 2100).state).toBe("idle");
  });

  it("remainingMs 超过 3 秒时按 3 秒封顶", () => {
    const completed = applyAiStatus(
      createIdleAiStatus(),
      statusMessage("completed", { remainingMs: 10_000 }),
      { now: NOW },
    );

    expect(completed.status.completedUntil).toBe(NOW + AI_COMPLETED_MS);
    expect(completed.transition?.completedMs).toBe(AI_COMPLETED_MS);
  });

  it("消息已经比 remainingMs 更老时视为过期 completed 并忽略", () => {
    const asking = applyAiStatus(createIdleAiStatus(), statusMessage("asking"), { now: NOW });
    const staleCompleted = applyAiStatus(
      asking.status,
      statusMessage("completed", { resume: "idle", remainingMs: 2000, ts: NOW - 2500 }),
      { now: NOW },
    );

    expect(staleCompleted.stale).toBe(true);
    expect(staleCompleted.transition).toBeNull();
    expect(staleCompleted.status.state).toBe("asking");
  });

  it("部分过期时只展示剩余时间", () => {
    const completed = applyAiStatus(
      createIdleAiStatus(),
      statusMessage("completed", { resume: "idle", remainingMs: 3000, ts: NOW - 2500 }),
      { now: NOW },
    );

    expect(completed.stale).toBe(false);
    expect(completed.status.completedUntil).toBe(NOW + 500);
  });

  it("新状态取消旧的 completed 计时", () => {
    const completed = applyAiStatus(
      createIdleAiStatus(),
      statusMessage("completed", { resume: "idle", remainingMs: 3000 }),
      { now: NOW },
    );
    const asking = applyAiStatus(completed.status, statusMessage("asking"), { now: NOW + 400 });

    expect(asking.status.state).toBe("asking");
    expect(asking.status.completedUntil).toBeNull();
    expect(settleAiStatus(asking.status, NOW + 10_000).state).toBe("asking");
  });

  it("resume 缺省/非法时落回 idle", () => {
    const completed = applyAiStatus(
      createIdleAiStatus(),
      statusMessage("completed", { resume: null, remainingMs: 3000 }),
      { now: NOW },
    );
    expect(completed.status.resume).toBe("idle");

    const withCompletedResume = applyAiStatus(
      createIdleAiStatus(),
      statusMessage("completed", { resume: "completed", remainingMs: 3000 }),
      { now: NOW },
    );
    expect(withCompletedResume.status.resume).toBe("idle");
  });

  it("working 会带 enteredAt 供 5 秒文案计时", () => {
    const working = applyAiStatus(createIdleAiStatus(), statusMessage("working"), { now: NOW });
    expect(aiCaptionCopyId(working.status, NOW)).toBe("ai_working");
    expect(aiCaptionCopyId(working.status, NOW + AI_WORK_CAPTION_MS - 1)).toBe("ai_working");
    expect(aiCaptionCopyId(working.status, NOW + AI_WORK_CAPTION_MS)).toBeNull();
  });

  it("asking/completed 文案跟随状态生命周期", () => {
    const asking = applyAiStatus(createIdleAiStatus(), statusMessage("asking"), { now: NOW });
    expect(aiCaptionCopyId(asking.status, NOW + 60_000)).toBe("ai_asking");

    const completed = applyAiStatus(
      createIdleAiStatus(),
      statusMessage("completed", { remainingMs: 1200 }),
      { now: NOW },
    );
    expect(aiCaptionCopyId(completed.status, NOW)).toBe("ai_completed");
    expect(aiCaptionCopyId(completed.status, NOW + 1200)).toBeNull();
  });
});

describe("displayStateOf", () => {
  it("休息优先于 AI 状态", () => {
    const phases: PetPhase[] = ["away"];
    for (const phase of phases) {
      expect(displayStateOf(phase, "asking")).toBe("idle");
      expect(displayStateOf(phase, "completed")).toBe("idle");
      expect(displayStateOf(phase, "working")).toBe("idle");
    }
  });

  it("asking 盖过睡觉，working/completed 也会叫醒", () => {
    expect(displayStateOf("sleeping", "asking")).toBe("asking");
    expect(displayStateOf("sleeping", "completed")).toBe("completed");
    expect(displayStateOf("sleeping", "working")).toBe("working");
    expect(displayStateOf("sleeping", "idle")).toBe("idle");
  });

  it("静态与 idle 相位展示 static", () => {
    expect(displayStateOf("idle", "idle")).toBe("idle");
    expect(displayStateOf({ phase: "idle" }, "asking")).toBe("asking");
  });
});
