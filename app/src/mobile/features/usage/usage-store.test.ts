import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenUsageStats, UsageRange } from "@/protocol/messages";
import { useMobileUsageStore } from "./usage-store";

const tauri = vi.hoisted(() => ({
  sendUsageRequest: vi.fn(async () => undefined),
}));

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  sendUsageRequest: tauri.sendUsageRequest,
}));

function stats(range: UsageRange, tokens: number): TokenUsageStats {
  return {
    range,
    generatedAt: Date.now(),
    summary: {
      tokens,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      costCnyMicros: 0,
      estimatedCostMicros: 0,
      costSource: "ledger",
      calls: 0,
      sessions: 0,
      cacheHitPct: null,
    },
    previous: {
      tokens: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      costCnyMicros: 0,
      estimatedCostMicros: 0,
      costSource: "unknown",
      calls: 0,
      sessions: 0,
      cacheHitPct: null,
    },
    days: [],
    groups: { clients: [], sessions: [], models: [] },
    pricing: {
      source: "remote",
      updatedAt: Date.now(),
      lastAttemptAt: Date.now(),
      lastError: null,
      stale: false,
      autoRefresh: true,
      modelCount: 0,
      fxCnyPerUsd: 7,
      fxSource: "ledger",
      mobileModels: true,
    },
    coverageDays: 1,
    ledger: { available: true, reason: null },
  };
}

beforeEach(() => {
  tauri.sendUsageRequest.mockClear();
  useMobileUsageStore.setState({
    range: "7d",
    data: null,
    today: null,
    loading: false,
    error: null,
  });
});

describe("useMobileUsageStore 今日快照", () => {
  it("默认区间是今天", () => {
    expect(useMobileUsageStore.getInitialState().range).toBe("today");
  });

  it("apply(today) 只写顶栏 today，不动用量页 data / range", () => {
    useMobileUsageStore.getState().apply(stats("today", 100));

    expect(useMobileUsageStore.getState().today?.summary.tokens).toBe(100);
    expect(useMobileUsageStore.getState().data).toBeNull();
    expect(useMobileUsageStore.getState().range).toBe("7d");
  });

  it("apply(当前区间) 写 data，并保留 today", () => {
    useMobileUsageStore.getState().apply(stats("today", 100));
    useMobileUsageStore.getState().apply(stats("7d", 700));

    expect(useMobileUsageStore.getState().data?.summary.tokens).toBe(700);
    expect(useMobileUsageStore.getState().today?.summary.tokens).toBe(100);
  });

  it("requestToday 只发 usage.request(today)，不改区间/加载态", () => {
    useMobileUsageStore.getState().requestToday();

    expect(tauri.sendUsageRequest).toHaveBeenCalledWith("today");
    expect(useMobileUsageStore.getState().range).toBe("7d");
    expect(useMobileUsageStore.getState().loading).toBe(false);
  });

  it("reset 同时清掉顶栏 today", () => {
    useMobileUsageStore.getState().apply(stats("today", 100));
    useMobileUsageStore.getState().reset();

    expect(useMobileUsageStore.getState().today).toBeNull();
    expect(useMobileUsageStore.getState().data).toBeNull();
  });
});
