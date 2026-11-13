import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPetReaction,
  firePetReaction,
  MIN_REACTION_MS,
  usePetReactionStore,
} from "./pet-reaction";

beforeEach(() => {
  vi.useFakeTimers();
  clearPetReaction();
});

afterEach(() => {
  clearPetReaction();
  vi.useRealTimers();
});

describe("firePetReaction", () => {
  it("写入反应并在到期后清空", () => {
    firePetReaction("affirm", 1_600, 0);
    expect(usePetReactionStore.getState().reaction).toEqual({ action: "affirm", until: 1_600 });

    vi.advanceTimersByTime(1_599);
    expect(usePetReactionStore.getState().reaction).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(usePetReactionStore.getState().reaction).toBeNull();
  });

  it("短于最小时长会被抬到 MIN_REACTION_MS", () => {
    firePetReaction("failure", 10, 0);
    expect(usePetReactionStore.getState().reaction?.until).toBe(MIN_REACTION_MS);
  });

  it("同一动作在有效期内不重播", () => {
    firePetReaction("affirm", 1_600, 0);
    firePetReaction("affirm", 1_600, 500);
    expect(usePetReactionStore.getState().reaction?.until).toBe(1_600);
  });

  it("另一个动作会顶掉旧动作", () => {
    firePetReaction("affirm", 1_600, 0);
    firePetReaction("failure", 2_000, 100);
    expect(usePetReactionStore.getState().reaction).toEqual({ action: "failure", until: 2_100 });
  });

  it("旧计时器不会清掉新反应", () => {
    firePetReaction("affirm", 1_600, 0);
    firePetReaction("failure", 2_000, 100);
    vi.advanceTimersByTime(1_600);
    expect(usePetReactionStore.getState().reaction?.action).toBe("failure");
  });
});

describe("clearPetReaction", () => {
  it("立刻清空并停掉计时器", () => {
    firePetReaction("love", 2_400, 0);
    clearPetReaction();
    expect(usePetReactionStore.getState().reaction).toBeNull();
    vi.advanceTimersByTime(5_000);
    expect(usePetReactionStore.getState().reaction).toBeNull();
  });
});
