import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useMobileUsageStore } from "@/mobile/features/usage/usage-store";
import { useUiStore } from "@/mobile/ui-store";
import type { TokenUsageStats } from "@/protocol/messages";

const tauri = vi.hoisted(() => ({
  sendUsageRequest: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { UsagePage } from "./usage-page";

function stats(overrides: Partial<TokenUsageStats> = {}): TokenUsageStats {
  return {
    range: "7d",
    generatedAt: Date.now(),
    summary: {
      tokens: 481_854_387,
      input: 3_017_736,
      output: 1_247_899,
      cacheRead: 471_288_704,
      cacheWrite: 0,
      reasoning: 0,
      costCnyMicros: 29_842_039,
      estimatedCostMicros: 0,
      costSource: "ledger",
      calls: 1_939,
      sessions: 15,
      cacheHitPct: 98.15,
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
    days: Array.from({ length: 14 }, (_, index) => ({
      date: `2026-10-${String(index + 23).padStart(2, "0")}`,
      tokens: 10_000_000,
      input: 100_000,
      output: 40_000,
      cacheRead: 9_860_000,
      cacheWrite: 0,
      costCnyMicros: 1_200_000,
      calls: 200,
    })),
    groups: {
      clients: [
        {
          key: "dsh",
          label: "DeepSeek Harness",
          sub: "本机 cost-meter · 已接入",
          tokens: 481_854_387,
          costCnyMicros: 29_842_039,
          estimatedCostMicros: 0,
          costSource: "ledger",
          sharePct: 100,
          calls: 1_939,
          sessions: 15,
          cacheHitPct: 98.15,
          modelId: null,
          provider: null,
          tag: null,
          price: null,
        },
      ],
      sessions: [
        {
          key: "s-1",
          label: "修复登录",
          sub: "最近 11-05 22:00 · 300 次调用",
          tokens: 200_000_000,
          costCnyMicros: 12_000_000,
          estimatedCostMicros: 0,
          costSource: "ledger",
          sharePct: 41.5,
          calls: 300,
          sessions: null,
          cacheHitPct: 97.8,
          modelId: null,
          provider: null,
          tag: null,
          price: null,
        },
      ],
      models: [
        {
          key: "opencode-go:deepseek-v4.1-flash",
          label: "deepseek-v4.1-flash",
          sub: "OpenCode Go · 缓存命中 97.9%",
          tokens: 480_000_000,
          costCnyMicros: 29_800_000,
          estimatedCostMicros: 0,
          costSource: "ledger",
          sharePct: 99.6,
          calls: 1_900,
          sessions: null,
          cacheHitPct: 97.9,
          modelId: "deepseek-v4.1-flash",
          provider: "OpenCode Go",
          tag: null,
          price: {
            inputCnyPerM: 0.288,
            outputCnyPerM: 0.067,
            cacheReadCnyPerM: 0.227,
            cacheWriteCnyPerM: 0,
            source: "seed",
          },
        },
      ],
    },
    pricing: {
      source: "remote",
      updatedAt: Date.now() - 60_000,
      lastAttemptAt: Date.now() - 60_000,
      lastError: null,
      stale: false,
      autoRefresh: true,
      modelCount: 548,
      fxCnyPerUsd: 6.6723,
      fxSource: "ledger",
      mobileModels: true,
    },
    coverageDays: 7,
    ledger: { available: true, reason: null },
    ...overrides,
  };
}

beforeEach(() => {
  tauri.sendUsageRequest.mockReset();
  tauri.sendUsageRequest.mockResolvedValue(undefined);
  useUiStore.setState({ view: "settings", scanOpen: false, offlineReturnView: "pet" });
  useConnectionStore.setState({ status: "connected", addr: "192.168.1.5:47810" });
  useMobileUsageStore.setState({
    range: "7d",
    data: stats(),
    today: null,
    loading: false,
    error: null,
  });
});

afterEach(() => cleanup());

describe("手机 UsagePage", () => {
  it("展示今日/区间总览、会话与价格元数据", () => {
    render(<UsagePage />);
    expect(screen.getByRole("heading", { level: 1, name: "用量" })).toBeInTheDocument();
    expect(screen.getByText("4.82 亿")).toBeInTheDocument();
    expect(screen.getByText("¥29.84")).toBeInTheDocument();
    expect(screen.getByText("修复登录")).toBeInTheDocument();
    expect(screen.getByText(/个模型有价/)).toBeInTheDocument();
  });

  it("返回宠物；切区间请求新快照", () => {
    const { unmount } = render(<UsagePage />);
    fireEvent.click(screen.getByRole("button", { name: "返回宠物" }));
    expect(useUiStore.getState().view).toBe("pet");
    unmount();

    render(<UsagePage />);
    fireEvent.click(screen.getByRole("button", { name: "今天" }));
    expect(tauri.sendUsageRequest).toHaveBeenCalledWith("today");
  });

  it("模型分组默认显示，关闭后隐藏模型 Tab", () => {
    const { unmount } = render(<UsagePage />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));
    expect(screen.getByText("deepseek-v4.1-flash")).toBeInTheDocument();
    unmount();

    useMobileUsageStore.setState({
      data: stats({ groups: { ...stats().groups, models: [], modelsHidden: true } }),
    });
    render(<UsagePage />);
    expect(screen.queryByRole("tab", { name: "模型" })).toBeNull();
    expect(screen.queryByText("deepseek-v4.1-flash")).toBeNull();
  });
});
