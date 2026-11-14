import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUsageStore } from "@/desktop/features/usage/usage-store";
import type { PricingStatus, TokenUsageStats, UsageRow } from "@/protocol/messages";

const tauri = vi.hoisted(() => ({
  getTokenUsageStats: vi.fn(),
  refreshTokenPricing: vi.fn(),
  setTokenPricingAuto: vi.fn(),
  setTokenPricingMobileModels: vi.fn(),
  hideUsagePanel: vi.fn(),
  openUsagePage: vi.fn(),
  usagePanelPinned: vi.fn(),
  setUsagePanelPinned: vi.fn(),
  usagePanelArrowX: vi.fn(),
  usagePanelArrowEnabled: vi.fn(),
  // 测试环境没有原生材质（D117），一律按「没铺玻璃」处理 → 卡片保持不透明实色。
  panelGlassReady: vi.fn(),
  normalizeError: (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { UsagePanel } from "./usage-panel";

const FIXED_NOW = new Date(2026, 10, 6, 21, 0, 0).getTime();

function pricing(overrides: Partial<PricingStatus> = {}): PricingStatus {
  return {
    source: "remote",
    updatedAt: FIXED_NOW,
    lastAttemptAt: FIXED_NOW,
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

function modelRow(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    key: "deepseek:deepseek-chat",
    label: "deepseek-chat",
    sub: null,
    tokens: 32_000_000,
    costCnyMicros: 18_200_000,
    estimatedCostMicros: 0,
    costSource: "ledger",
    sharePct: 61,
    calls: 120,
    sessions: null,
    cacheHitPct: 98.2,
    modelId: "deepseek-chat",
    provider: "DeepSeek",
    tag: null,
    price: null,
    ...overrides,
  };
}

function stats(overrides: Partial<TokenUsageStats> = {}): TokenUsageStats {
  const summary = {
    tokens: 47_500_000,
    input: 900_000,
    output: 320_000,
    cacheRead: 46_280_000,
    cacheWrite: 0,
    reasoning: 0,
    costCnyMicros: 29_842_039,
    estimatedCostMicros: 0,
    costSource: "ledger" as const,
    calls: 240,
    sessions: 5,
    cacheHitPct: 99.4,
  };
  return {
    range: "today",
    generatedAt: FIXED_NOW,
    summary,
    previous: { ...summary, tokens: 40_000_000, costCnyMicros: 25_000_000 },
    days: [
      {
        date: "2026-10-31",
        tokens: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        costCnyMicros: 0,
        calls: 0,
      },
      {
        date: "2026-11-01",
        tokens: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        costCnyMicros: 0,
        calls: 0,
      },
      {
        date: "2026-11-02",
        tokens: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        costCnyMicros: 0,
        calls: 0,
      },
      {
        date: "2026-11-03",
        tokens: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        costCnyMicros: 0,
        calls: 0,
      },
      {
        date: "2026-11-04",
        tokens: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        costCnyMicros: 0,
        calls: 0,
      },
      {
        date: "2026-11-05",
        tokens: 20_000_000,
        input: 400_000,
        output: 140_000,
        cacheRead: 19_460_000,
        cacheWrite: 0,
        costCnyMicros: 11_000_000,
        calls: 90,
      },
      {
        date: "2026-11-06",
        tokens: 47_500_000,
        input: 900_000,
        output: 320_000,
        cacheRead: 46_280_000,
        cacheWrite: 0,
        costCnyMicros: 29_842_039,
        calls: 240,
      },
    ],
    groups: {
      clients: [
        modelRow({
          key: "client:dsh",
          label: "DeepSeek Harness",
          tokens: 47_500_000,
          costCnyMicros: 29_842_039,
          sharePct: 100,
        }),
      ],
      sessions: [
        modelRow({
          key: "session:s-1",
          label: "修复登录",
          tokens: 30_000_000,
          costCnyMicros: 18_000_000,
          sharePct: 60,
        }),
      ],
      models: [
        modelRow(),
        modelRow({
          key: "deepseek:deepseek-reasoner",
          label: "deepseek-reasoner",
          tokens: 8_000_000,
          costCnyMicros: 6_500_000,
          sharePct: 22,
        }),
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
    range: "today",
    group: "model",
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
  tauri.hideUsagePanel.mockReset();
  tauri.hideUsagePanel.mockResolvedValue(undefined);
  tauri.openUsagePage.mockReset();
  tauri.openUsagePage.mockResolvedValue(undefined);
  tauri.panelGlassReady.mockReset();
  tauri.panelGlassReady.mockResolvedValue(false);
  tauri.usagePanelPinned.mockReset();
  tauri.usagePanelPinned.mockResolvedValue(false);
  tauri.setUsagePanelPinned.mockReset();
  tauri.setUsagePanelPinned.mockImplementation(async (pinned: boolean) => pinned);
  tauri.usagePanelArrowX.mockReset();
  tauri.usagePanelArrowX.mockResolvedValue(160);
  tauri.usagePanelArrowEnabled.mockReset();
  tauri.usagePanelArrowEnabled.mockResolvedValue(true);
});

afterEach(() => cleanup());

describe("UsagePanel 菜单栏用量看板", () => {
  it("默认读今天：花费、三读数、近 7 天、Top 模型都在", async () => {
    render(<UsagePanel />);

    expect(await screen.findByText("今天花费")).toBeInTheDocument();
    expect(tauri.getTokenUsageStats).toHaveBeenCalledWith("today");
    expect(screen.getByText("¥29.84")).toBeInTheDocument();
    expect(screen.getByText("Token")).toBeInTheDocument();
    expect(screen.getByText("4750 万")).toBeInTheDocument();
    expect(screen.getByText("99.4%")).toBeInTheDocument();
    expect(screen.getByText("近 7 天")).toBeInTheDocument();
    expect(screen.getByText("deepseek-chat")).toBeInTheDocument();
    expect(screen.getByText("¥18.20")).toBeInTheDocument();
  });

  it("切到 7 天会重新请求", async () => {
    render(<UsagePanel />);
    await screen.findByText("今天花费");

    fireEvent.click(screen.getByRole("button", { name: "7 天" }));

    await waitFor(() => expect(tauri.getTokenUsageStats).toHaveBeenLastCalledWith("7d"));
    expect(await screen.findByText("近 7 天花费")).toBeInTheDocument();
  });

  it("模型区可切换客户端 / 会话 / 模型三个分组", async () => {
    render(<UsagePanel />);
    await screen.findByText("deepseek-chat");

    fireEvent.click(screen.getByRole("button", { name: "会话" }));
    expect(await screen.findByText("修复登录")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "客户端" }));
    expect(await screen.findByText("DeepSeek Harness")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "模型" }));
    expect(await screen.findByText("deepseek-chat")).toBeInTheDocument();
  });

  it("近 7 天柱子悬停显示日期与金额", async () => {
    render(<UsagePanel />);
    await screen.findByText("近 7 天");
    const chart = document.querySelector(".dsl-panel-chart") as HTMLElement;
    expect(chart).not.toBeNull();
    vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({
      width: 280,
      height: 42,
      left: 0,
      top: 0,
      right: 280,
      bottom: 42,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.mouseMove(chart, { clientX: 279, clientY: 20 });
    expect(await screen.findByText("11-06 · ¥29.84")).toBeInTheDocument();

    fireEvent.mouseLeave(chart);
    await waitFor(() => expect(screen.queryByText("11-06 · ¥29.84")).not.toBeInTheDocument());
  });

  it("缺价时显示「—」而不是 ¥0.00", async () => {
    tauri.getTokenUsageStats.mockResolvedValue(
      stats({
        summary: {
          tokens: 1_200_000,
          input: 400_000,
          output: 100_000,
          cacheRead: 700_000,
          cacheWrite: 0,
          reasoning: 0,
          costCnyMicros: 0,
          estimatedCostMicros: 0,
          costSource: "unknown",
          calls: 12,
          sessions: 2,
          cacheHitPct: 63.6,
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
      }),
    );

    render(<UsagePanel />);

    await screen.findByText("今天花费");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("账本缺失时给结论和重试", async () => {
    tauri.getTokenUsageStats.mockResolvedValue(
      stats({ ledger: { available: false, reason: "ledger_missing" } }),
    );

    render(<UsagePanel />);

    expect(await screen.findByText("还没找到 DSH 账本")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => expect(tauri.getTokenUsageStats).toHaveBeenCalledTimes(2));
  });

  it("Esc 收起面板（不退出进程）", async () => {
    render(<UsagePanel />);
    await screen.findByText("今天花费");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(tauri.hideUsagePanel).toHaveBeenCalledTimes(1));
  });

  it("底部按钮打开主窗口的用量页", async () => {
    render(<UsagePanel />);
    await screen.findByText("今天花费");

    fireEvent.click(screen.getByRole("button", { name: /打开用量页/ }));

    await waitFor(() => expect(tauri.openUsagePage).toHaveBeenCalledTimes(1));
  });
});

describe("UsagePanel 钉住（D135）", () => {
  it("默认未钉住，按钮是 pin 且 aria-pressed=false", async () => {
    render(<UsagePanel />);
    await screen.findByText("今天花费");

    const pin = screen.getByRole("button", { name: "钉住面板" });
    expect(pin).toHaveAttribute("aria-pressed", "false");
    expect(tauri.setUsagePanelPinned).not.toHaveBeenCalled();
  });

  it("点 pin 写入 true 并反映在按钮上", async () => {
    render(<UsagePanel />);
    await screen.findByText("今天花费");

    fireEvent.click(screen.getByRole("button", { name: "钉住面板" }));

    await waitFor(() => expect(tauri.setUsagePanelPinned).toHaveBeenCalledWith(true));
    const pinned = await screen.findByRole("button", { name: "取消钉住面板" });
    expect(pinned).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(pinned);
    await waitFor(() => expect(tauri.setUsagePanelPinned).toHaveBeenLastCalledWith(false));
    expect(screen.getByRole("button", { name: "钉住面板" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("挂载时按 Rust 的钉住态校准按钮（WebView 重载后 JS 状态会清零）", async () => {
    tauri.usagePanelPinned.mockResolvedValue(true);

    render(<UsagePanel />);
    await screen.findByText("今天花费");

    const pinned = await screen.findByRole("button", { name: "取消钉住面板" });
    expect(pinned).toHaveAttribute("aria-pressed", "true");
  });

  it("写入失败时回滚按钮态", async () => {
    tauri.setUsagePanelPinned.mockRejectedValue(new Error("boom"));

    render(<UsagePanel />);
    await screen.findByText("今天花费");
    fireEvent.click(screen.getByRole("button", { name: "钉住面板" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "钉住面板" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
  });
});

describe("UsagePanel 顶部指引尖（D138）", () => {
  it("挂载时把尖的位置落成 CSS 变量，并写入开关", async () => {
    tauri.usagePanelArrowX.mockResolvedValue(212);

    render(<UsagePanel />);
    await screen.findByText("今天花费");

    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("--panel-arrow-x")).toBe("212px"),
    );
    await waitFor(() => expect(document.documentElement.dataset.panelArrow).toBe("on"));
    expect(document.querySelector(".dsl-panel-arrow")).not.toBeNull();
  });

  it("开关关闭时给 html 打 off，三角由 CSS 隐藏", async () => {
    tauri.usagePanelArrowEnabled.mockResolvedValue(false);

    render(<UsagePanel />);
    await screen.findByText("今天花费");

    await waitFor(() => expect(document.documentElement.dataset.panelArrow).toBe("off"));
  });
});

describe("UsagePanel 焦点残留（窗口只 hide 不销毁）", () => {
  it("窗口失焦时清掉 DOM 焦点，下次打开不会带着焦点环", async () => {
    render(<UsagePanel />);
    await screen.findByText("今天花费");

    const tab = screen.getByRole("button", { name: "7 天" });
    tab.focus();
    expect(document.activeElement).toBe(tab);

    window.dispatchEvent(new Event("blur"));

    expect(document.activeElement).not.toBe(tab);
  });
});
