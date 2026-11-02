import { describe, expect, it } from "vitest";
import { MANIFEST } from "./sprite-manifest";
import { resolveSpriteState, spriteStateChain } from "./sprite-state-map";

describe("spriteStateChain", () => {
  it("AI 四态映射到图集状态", () => {
    expect(spriteStateChain("idle", "working")).toEqual(["working", "idle"]);
    expect(spriteStateChain("idle", "asking")).toEqual(["attention", "idle"]);
    expect(spriteStateChain("idle", "completed")).toEqual(["done", "celebrate", "idle"]);
    expect(spriteStateChain("idle", "idle")).toEqual(["idle"]);
  });

  it("交互状态优先于 AI 状态", () => {
    expect(spriteStateChain("listening", "working")).toEqual(["listening", "idle"]);
    expect(spriteStateChain("interacting", "asking")).toEqual(["petting", "happy", "idle"]);
    expect(spriteStateChain("celebrating", "idle")).toEqual(["celebrate", "done", "idle"]);
    expect(spriteStateChain("concerned", "working")).toEqual(["concerned", "idle"]);
    expect(spriteStateChain("away", "working")).toEqual(["away", "idle"]);
  });

  it("睡觉只在 AI 静态时生效；夜间做任务仍显示 AI 状态", () => {
    expect(spriteStateChain("sleeping", "idle")).toEqual(["sleeping", "idle"]);
    expect(spriteStateChain("sleeping", "working")).toEqual(["working", "idle"]);
  });
});

describe("resolveSpriteState", () => {
  const states = { idle: {}, working: {}, attention: {}, done: {} };

  it("选候选链里第一个存在的状态", () => {
    expect(resolveSpriteState(["sleeping", "listening", "idle"], states, "idle")).toBe("idle");
    expect(resolveSpriteState(["working", "idle"], states, "idle")).toBe("working");
  });

  it("回落到 defaultState / idle / 第一个状态", () => {
    expect(resolveSpriteState(["sleeping"], { idle: {}, working: {} }, "working")).toBe("working");
    expect(resolveSpriteState(["sleeping"], { idle: {}, working: {} }, "nope")).toBe("idle");
    expect(resolveSpriteState(["sleeping"], { sleepy: {} }, "nope")).toBe("sleepy");
    expect(resolveSpriteState(["sleeping"], {}, "idle")).toBeNull();
  });

  it("内置资产只有四态：预留状态都会回落", () => {
    if (!MANIFEST) throw new Error("内置 manifest 应该可用");
    expect(
      resolveSpriteState(
        spriteStateChain("sleeping", "idle"),
        MANIFEST.states,
        MANIFEST.defaultState,
      ),
    ).toBe("idle");
    expect(
      resolveSpriteState(
        spriteStateChain("interacting", "idle"),
        MANIFEST.states,
        MANIFEST.defaultState,
      ),
    ).toBe("idle");
    expect(
      resolveSpriteState(
        spriteStateChain("celebrating", "idle"),
        MANIFEST.states,
        MANIFEST.defaultState,
      ),
    ).toBe("done");
  });
});
