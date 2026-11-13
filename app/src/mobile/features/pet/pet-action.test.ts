import { describe, expect, it } from "vitest";
import { isContinuous, type PetActionInput, resolvePetAction } from "./pet-action";

const base: PetActionInput = {
  phase: "idle",
  ai: "idle",
  mic: "idle",
  reaction: null,
  now: 1_000,
};

function resolve(patch: Partial<PetActionInput>) {
  return resolvePetAction({ ...base, ...patch });
}

describe("resolvePetAction 优先级", () => {
  it("默认待机", () => {
    expect(resolve({})).toBe("idle");
  });

  it("AI 三态各自映射到动作", () => {
    expect(resolve({ ai: "working" })).toBe("waiting");
    expect(resolve({ ai: "asking" })).toBe("wary");
    expect(resolve({ ai: "completed" })).toBe("success");
  });

  it("睡着与离开只在 AI 静态时生效", () => {
    expect(resolve({ phase: "sleeping" })).toBe("sleep");
    expect(resolve({ phase: "away" })).toBe("bored");
    expect(resolve({ phase: "sleeping", ai: "working" })).toBe("waiting");
    expect(resolve({ phase: "sleeping", ai: "asking" })).toBe("wary");
  });

  it("麦克风胜过 AI：录音中/转写中各有专属动作", () => {
    expect(resolve({ ai: "working", mic: "listening" })).toBe("input");
    expect(resolve({ ai: "working", mic: "arming" })).toBe("input");
    expect(resolve({ ai: "asking", mic: "processing" })).toBe("inspect");
  });

  it("麦克风空闲时不干扰 AI", () => {
    expect(resolve({ ai: "working", mic: "delivered" })).toBe("waiting");
    expect(resolve({ ai: "idle", mic: "error" })).toBe("idle");
  });

  it("未过期的瞬态反应压倒一切", () => {
    expect(
      resolve({
        ai: "working",
        mic: "listening",
        reaction: { action: "affirm", until: 1_001 },
      }),
    ).toBe("affirm");
  });

  it("到期的反应自动让位", () => {
    expect(
      resolve({
        ai: "working",
        reaction: { action: "affirm", until: 1_000 },
      }),
    ).toBe("waiting");
  });

  it("夜间 + 回来的爱心不会盖掉工作态", () => {
    expect(resolve({ phase: "sleeping", ai: "completed" })).toBe("success");
  });
});

describe("isContinuous", () => {
  it("只有 waiting-wave 是循环动作", () => {
    expect(isContinuous("waiting")).toBe(true);
    expect(isContinuous("wary")).toBe(false);
  });
});
