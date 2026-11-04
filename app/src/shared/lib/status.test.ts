import { expect, test } from "vitest";
import { AI_STATE_LABEL, AI_STATE_LEVEL, AI_STATE_TONE, aggregateAiState } from "./status";

test("AI 四态文案固定", () => {
  expect(AI_STATE_LABEL).toEqual({
    idle: "空闲",
    working: "工作中",
    asking: "等你决定",
    completed: "完成",
  });
});

test("聚合优先级：等你决定 > 工作中 > 完成 > 空闲", () => {
  expect(aggregateAiState([])).toBe("idle");
  expect(aggregateAiState(["idle", "completed", "working", "asking"])).toBe("asking");
  expect(aggregateAiState(["completed", "working"])).toBe("working");
  expect(aggregateAiState(["completed", "idle"])).toBe("completed");
});

test("状态是文字 + 信号格 + 颜色三线索", () => {
  expect(AI_STATE_LEVEL).toEqual({ idle: 1, working: 2, asking: 1, completed: 3 });
  expect(AI_STATE_TONE.asking).toBe("decide");
  expect(AI_STATE_TONE.working).toBe("signal");
});
