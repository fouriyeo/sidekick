import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUsageStore } from "@/desktop/features/usage/usage-store";
import type { PricingStatus, TokenUsageStats } from "@/protocol/messages";

const tauri = vi.hoisted(() => ({
  getTokenUsageStats: vi.fn(),
  refreshTokenPricing: vi.fn(),
  setTokenPricingAuto: vi.fn(),
  setTokenPricingMobileModels: vi.fn(),
  normalizeError: (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { UsagePage } from "./usage-page";

function pricing(overrides: Partial<PricingStatus> = {}): PricingStatus {
  return {
    source: "remote",
    updatedAt: Date.now() - 2 * 60 * 60 * 1000,
    lastAttemptAt: Date.now() - 2 * 60 * 60 * 1000,
    lastError: null,
    stale: false,
    autoRefresh: true,
    modelCount: 548,
    fxCnyPerUsd: 6.6723,
    fxSource: "ledger",
    mobileModels: true,
    ...overrides,
  };
}

function stats(overrides: Partial<TokenUsageStats> = {}): TokenUsageStats {
  const summary = {
    tokens: 481_854_387,
    input: 3_017_736,
    output: 1_247_899,
    cacheRead: 471_288_704,
    cacheWrite: 0,
    reasoning: 0,
    costCnyMicros: 29_842_039,
    estimatedCostMicros: 0,
    costSource: "ledger" as const,
    calls: 1_939,
    sessions: 15,
    cacheHitPct: 98.15,
  };
  return {
    range: "7d",
    generatedAt: Date.now(),
    summary,
    previous: { ...summary, tokens: 400_000_000, costCnyMicros: 25_000_000 },
    days: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-11-0${index + 1}`,
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
          tokens: summary.tokens,
          costCnyMicros: summary.costCnyMicros,
          estimatedCostMicros: 0,
          costSource: "ledger",
          sharePct: 100,
          calls: summary.calls,
          sessions: summary.sessions,
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
    pricing: pricing(),
    coverageDays: 7,
    ledger: { available: true, reason: null },
    ...overrides,
  };
}

beforeEach(() => {
  useUsageStore.setState({
    range: "7d",
    group: "session",
    stats: null,
    loading: false,
    error: null,
    pricingBusy: false,
    pricingError: null,
    sheetOpen: false,
  });
  tauri.getTokenUsageStats.mockReset();
  tauri.getTokenUsageStats.mockImplementation(async (range: string) =>
    stats({ range: range as TokenUsageStats["range"] }),
  );
  tauri.refreshTokenPricing.mockReset();
  tauri.refreshTokenPricing.mockResolvedValue(pricing());
  tauri.setTokenPricingAuto.mockReset();
  tauri.setTokenPricingAuto.mockResolvedValue(pricing());
  tauri.setTokenPricingMobileModels.mockReset();
  tauri.setTokenPricingMobileModels.mockResolvedValue(pricing());
});

afterEach(() => cleanup());

describe("UsagePage 用量页", () => {
  it("渲染 KPI、分组与价格入口", async () => {
    render(<UsagePage />);
    await waitFor(() => expect(screen.getByText("4.82 亿")).toBeInTheDocument());
    expect(screen.getByText("¥29.84")).toBeInTheDocument();
    expect(screen.getByText("98.2%")).toBeInTheDocument();
    expect(screen.getByText("修复登录")).toBeInTheDocument();
    expect(screen.getByText(/价格表 · 1 个模型有价/)).toBeInTheDocument();
  });

  it("切区间会重新拉取，切分组不重新拉取", async () => {
    render(<UsagePage />);
    await waitFor(() => expect(tauri.getTokenUsageStats).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "30 天" }));
    await waitFor(() => expect(tauri.getTokenUsageStats).toHaveBeenCalledWith("30d"));

    fireEvent.click(screen.getByRole("tab", { name: "模型" }));
    expect(screen.getByText("deepseek-v4.1-flash")).toBeInTheDocument();
    expect(tauri.getTokenUsageStats).toHaveBeenCalledTimes(2);
  });

  it("模型价格 Sheet 展示单价并支持刷新", async () => {
    render(<UsagePage />);
    await waitFor(() => expect(screen.getByText("修复登录")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /价格表 · 1 个模型有价/ }));
    expect(await screen.findByText("模型价格")).toBeInTheDocument();
    expect(screen.getByText("¥0.288")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /刷新价格/ }));
    await waitFor(() => expect(tauri.refreshTokenPricing).toHaveBeenCalledWith(true));
  });

  it("账本缺失显示空态而不是假数字", async () => {
    tauri.getTokenUsageStats.mockResolvedValue(
      stats({ ledger: { available: false, reason: "ledger_missing" }, coverageDays: 0 }),
    );
    render(<UsagePage />);
    expect(await screen.findByText("还没找到 DSH 账本")).toBeInTheDocument();
    expect(screen.queryByText("4.82 亿")).toBeNull();
  });
});
