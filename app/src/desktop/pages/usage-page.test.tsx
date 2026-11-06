import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    tokens: 475_554_339,
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
    cacheHitPct: 99.4,
  };
  return {
    range: "7d",
    generatedAt: Date.now(),
    summary,
    previous: { ...summary, tokens: 400_000_000, costCnyMicros: 25_000_000 },
    days: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-11-0${index + 1}`,
      tokens: 67_936_334,
      input: 431_105,
      output: 178_271,
      cacheRead: 67_326_958,
      cacheWrite: 0,
      costCnyMicros: 4_263_148,
      calls: 277,
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
          cacheHitPct: 99.4,
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
        {
          key: "s-2",
          label: "生成看板",
          sub: "最近 11-05 21:00 · 120 次调用",
          tokens: 100_000_000,
          costCnyMicros: 6_000_000,
          estimatedCostMicros: 0,
          costSource: "ledger",
          sharePct: 20.8,
          calls: 120,
          sessions: null,
          cacheHitPct: 97.8,
          modelId: null,
          provider: null,
          tag: null,
          price: null,
        },
        {
          key: "other",
          label: "其他 6 个会话",
          sub: "未在 Top 8",
          tokens: 175_554_339,
          costCnyMicros: 11_842_039,
          estimatedCostMicros: 0,
          costSource: "ledger",
          sharePct: 36.9,
          calls: 1_500,
          sessions: 6,
          cacheHitPct: null,
          modelId: null,
          provider: null,
          tag: "other",
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
  it("渲染花费 hero、读数、剖面、构成、账本与价格表入口", async () => {
    render(<UsagePage />);
    await waitFor(() => expect(screen.getByText("修复登录")).toBeInTheDocument());

    const hero = screen.getByLabelText("花费总览");
    expect(within(hero).getByText("29.84")).toBeInTheDocument();
    expect(within(hero).getByText("4.76 亿")).toBeInTheDocument();
    expect(within(hero).getByText("15")).toBeInTheDocument();
    expect(within(hero).getByText("99.4%")).toBeInTheDocument();
    expect(within(hero).getByText("较上期").closest(".dsl-usage-delta")?.textContent).toContain(
      "19.4%",
    );
    expect(within(hero).getByText("11-01 – 11-07")).toBeInTheDocument();

    expect(screen.getByRole("img", { name: /近 7 天每日花费/ })).toBeInTheDocument();
    expect(screen.getByText("缓存读")).toBeInTheDocument();
    expect(screen.getByText("99.1%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "价格表" })).toBeInTheDocument();
    expect(screen.getByText("生成看板")).toBeInTheDocument();
  });

  it("切区间会重新拉取，切分组不重新拉取", async () => {
    render(<UsagePage />);
    await waitFor(() => expect(tauri.getTokenUsageStats).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "30 天" }));
    await waitFor(() => expect(tauri.getTokenUsageStats).toHaveBeenCalledWith("30d"));

    fireEvent.click(screen.getByRole("button", { name: "模型" }));
    expect(screen.getByText("deepseek-v4.1-flash")).toBeInTheDocument();
    expect(tauri.getTokenUsageStats).toHaveBeenCalledTimes(2);
  });

  it("刷新按钮重新拉取账本", async () => {
    render(<UsagePage />);
    await waitFor(() => expect(tauri.getTokenUsageStats).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(tauri.getTokenUsageStats).toHaveBeenCalledTimes(2));
  });

  it("切区间后花费与 Token 补间到新区间值", async () => {
    render(<UsagePage />);
    await waitFor(() => expect(screen.getByText("29.84")).toBeInTheDocument());

    tauri.getTokenUsageStats.mockResolvedValue(
      stats({
        range: "30d",
        summary: { ...stats().summary, tokens: 1_000_000_000, costCnyMicros: 50_000_000 },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "30 天" }));

    await waitFor(
      () => {
        expect(screen.getByText("10 亿")).toBeInTheDocument();
        expect(screen.getByText("50.00")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("上期为 0 时不显示环比", async () => {
    tauri.getTokenUsageStats.mockResolvedValue(
      stats({ previous: { ...stats().previous, costCnyMicros: 0, costSource: "unknown" } }),
    );
    render(<UsagePage />);
    await waitFor(() => expect(screen.getByText("修复登录")).toBeInTheDocument());
    expect(screen.queryByText("较上期")).toBeNull();
  });

  it("缺价时花费显示 —，不画空剖面", async () => {
    tauri.getTokenUsageStats.mockResolvedValue(
      stats({ summary: { ...stats().summary, costCnyMicros: 0, costSource: "unknown" } }),
    );
    render(<UsagePage />);
    await waitFor(() => expect(screen.getByText("修复登录")).toBeInTheDocument());

    const hero = screen.getByLabelText("花费总览");
    expect(within(hero).getByText("—")).toBeInTheDocument();
    expect(within(hero).queryByText("较上期")).toBeNull();
    expect(screen.getByText("这个区间还没有记账金额")).toBeInTheDocument();
  });

  it("缓存命中为 null 时显示 —", async () => {
    tauri.getTokenUsageStats.mockResolvedValue(
      stats({ summary: { ...stats().summary, cacheHitPct: null } }),
    );
    render(<UsagePage />);
    await waitFor(() => expect(screen.getByText("修复登录")).toBeInTheDocument());
    const hero = screen.getByLabelText("花费总览");
    expect(within(hero).getByText("—")).toBeInTheDocument();
  });

  it("今天区间只有一天时退化成单日柱 + 昨日基准", async () => {
    tauri.getTokenUsageStats.mockResolvedValue(
      stats({
        range: "today",
        days: [
          {
            date: "2026-11-06",
            tokens: 74_000_000,
            input: 1_258_000,
            output: 191_800,
            cacheRead: 72_476_000,
            cacheWrite: 0,
            costCnyMicros: 2_050_000,
            calls: 220,
          },
        ],
        previous: { ...stats().previous, costCnyMicros: 4_340_000 },
      }),
    );
    render(<UsagePage />);
    await waitFor(() => expect(screen.getByRole("img", { name: /今天花费/ })).toBeInTheDocument());
    expect(screen.getByText("昨天 ¥4.34")).toBeInTheDocument();
    expect(screen.getAllByText("今天").length).toBeGreaterThanOrEqual(2);
  });

  it("价格表 Sheet 展示单价并支持刷新", async () => {
    render(<UsagePage />);
    await waitFor(() => expect(screen.getByText("修复登录")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "价格表" }));
    expect(await screen.findByText("模型价格")).toBeInTheDocument();
    expect(screen.getByText("¥0.288")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /刷新价格/ }));
    await waitFor(() => expect(tauri.refreshTokenPricing).toHaveBeenCalledWith(true));
  });

  it("账本缺失只显示一行结论 + 重试动作", async () => {
    tauri.getTokenUsageStats.mockResolvedValue(
      stats({ ledger: { available: false, reason: "ledger_missing" }, coverageDays: 0 }),
    );
    render(<UsagePage />);
    expect(await screen.findByText("还没找到 DSH 账本")).toBeInTheDocument();
    expect(screen.queryByText("29.84")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(tauri.getTokenUsageStats).toHaveBeenCalledTimes(2));
  });

  it("模型分组在电脑端关闭时给出结论", async () => {
    useUsageStore.setState({ group: "model" });
    tauri.getTokenUsageStats.mockResolvedValue(
      stats({ groups: { clients: [], sessions: [], models: [], modelsHidden: true } }),
    );
    render(<UsagePage />);
    expect(await screen.findByText("模型分组已在电脑端关闭")).toBeInTheDocument();
    expect(screen.queryByText("这个区间没有数据")).toBeNull();
  });
});
