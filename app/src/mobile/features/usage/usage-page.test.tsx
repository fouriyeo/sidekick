import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

const DAY_COSTS = [3_200_000, 4_100_000, 2_900_000, 5_300_000, 4_400_000, 3_700_000, 6_242_039];
const DAY_DATES = [
  "2026-10-31",
  "2026-11-01",
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
];

function stats(overrides: Partial<TokenUsageStats> = {}): TokenUsageStats {
  const days = DAY_COSTS.map((costCnyMicros, index) => ({
    date: DAY_DATES[index],
    tokens: 60_000_000 + index * 1_000_000,
    input: 400_000,
    output: 200_000,
    cacheRead: 59_000_000,
    cacheWrite: 0,
    costCnyMicros,
    calls: 240 + index * 10,
  }));
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
      costCnyMicros: 26_000_000,
      estimatedCostMicros: 0,
      costSource: "ledger",
      calls: 0,
      sessions: 0,
      cacheHitPct: null,
    },
    days,
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
        {
          key: "s-2",
          label: "其他会话",
          sub: "未在 Top 8",
          tokens: 100_000_000,
          costCnyMicros: 6_000_000,
          estimatedCostMicros: 0,
          costSource: "ledger",
          sharePct: 20.8,
          calls: 120,
          sessions: null,
          cacheHitPct: 96.2,
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
    pricing: {
      source: "remote",
      updatedAt: Date.now() - 60_000,
      lastAttemptAt: Date.now() - 60_000,
      lastError: null,
      stale: false,
      autoRefresh: true,
      modelCount: 18,
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("手机 UsagePage（D98）", () => {
  it("花费是主角：区间、日期、环期、三项读数", () => {
    render(<UsagePage />);
    expect(screen.getByRole("heading", { level: 1, name: "用量" })).toBeInTheDocument();
    expect(screen.getByText("近 7 天花费")).toBeInTheDocument();
    expect(screen.getByText("10-31 – 11-06")).toBeInTheDocument();
    expect(screen.getByText("¥29.84")).toBeInTheDocument();
    expect(screen.getByText("↑14.8%")).toBeInTheDocument();
    expect(screen.getByText("较上期")).toBeInTheDocument();
    expect(screen.getByText("4.82 亿")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("98.2%")).toBeInTheDocument();
    expect(screen.getByText("日均 ¥4.26")).toBeInTheDocument();
  });

  it("区间 tab 用 aria-pressed 标记，切换时请求新快照", () => {
    render(<UsagePage />);
    const tabs = within(screen.getByRole("group", { name: "统计区间" }));
    expect(tabs.getByRole("button", { name: "7 天" })).toHaveAttribute("aria-pressed", "true");
    expect(tabs.getByRole("button", { name: "今天" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(tabs.getByRole("button", { name: "今天" }));
    expect(tauri.sendUsageRequest).toHaveBeenCalledWith("today");
  });

  it("返回宠物", () => {
    render(<UsagePage />);
    fireEvent.click(screen.getByRole("button", { name: "返回宠物" }));
    expect(useUiStore.getState().view).toBe("pet");
  });

  it("Token 构成：五桶光谱、缓存读占比与合计", () => {
    render(<UsagePage />);
    expect(screen.getByText("共 4.82 亿")).toBeInTheDocument();
    expect(screen.getByText("缓存读")).toBeInTheDocument();
    expect(screen.getByText("99.1%")).toBeInTheDocument();
    expect(screen.getByText("输入")).toBeInTheDocument();
    expect(screen.getByText("输出")).toBeInTheDocument();
    // 为 0 的桶省略：缓存写/推理不出现。
    expect(screen.queryByText("缓存写")).toBeNull();
    expect(screen.queryByText("推理")).toBeNull();
  });

  it("图表有 aria-label 与逐日 sr-only 明细", () => {
    render(<UsagePage />);
    const chart = screen.getByRole("img", { name: /每日花费/ });
    expect(chart.getAttribute("aria-label")).toContain("7 天合计 ¥29.84");
    expect(chart.getAttribute("aria-label")).toContain("日均 ¥4.26");
    const list = screen.getByRole("list", { name: "每日花费明细" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
  });

  it("触摸剖面：横向拖动出气泡，松手 1.2s 收起", () => {
    vi.useFakeTimers();
    render(<UsagePage />);
    const chart = screen.getByRole("img", { name: /每日花费/ });
    fireEvent.pointerDown(chart, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 30,
      clientY: 60,
      button: 0,
    });
    // 纵向滚动不触发读数；只有横向超过 8px 才出气泡。
    expect(document.querySelector(".mu-tip")).toBeNull();
    fireEvent.pointerMove(chart, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 48,
      clientY: 61,
    });
    const tip = document.querySelector(".mu-tip");
    expect(tip).not.toBeNull();
    expect(tip?.textContent).toContain("¥3.20");
    fireEvent.pointerUp(chart, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 48,
      clientY: 61,
      button: 0,
    });
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(document.querySelector(".mu-tip")).toBeNull();
  });

  it("原地轻点也在抬手后出气泡", () => {
    vi.useFakeTimers();
    render(<UsagePage />);
    const chart = screen.getByRole("img", { name: /每日花费/ });
    fireEvent.pointerDown(chart, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 30,
      clientY: 60,
      button: 0,
    });
    fireEvent.pointerUp(chart, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 30,
      clientY: 60,
      button: 0,
    });
    expect(document.querySelector(".mu-tip")?.textContent).toContain("10-31");
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(document.querySelector(".mu-tip")).toBeNull();
  });

  it("分组默认会话、可切模型；副行只用后端 sub", () => {
    render(<UsagePage />);
    const groups = screen.getByRole("region", { name: "分组" });
    expect(within(groups).getByText("修复登录")).toBeInTheDocument();
    expect(within(groups).getByText("最近 11-05 22:00 · 300 次调用")).toBeInTheDocument();
    // 旧版副行里的占比/金额拼接不再出现。
    expect(within(groups).queryByText(/41\.5%/)).toBeNull();
    expect(within(groups).queryByText(/· ¥/)).toBeNull();

    fireEvent.click(within(groups).getByRole("button", { name: "模型" }));
    expect(within(groups).getByText("deepseek-v4.1-flash")).toBeInTheDocument();
    expect(within(groups).getByText("OpenCode Go · 缓存命中 97.9%")).toBeInTheDocument();
    expect(within(groups).getByText("¥29.80")).toBeInTheDocument();
  });

  it("「其他」行垫底且压暗", () => {
    render(<UsagePage />);
    const groups = screen.getByRole("region", { name: "分组" });
    const rows = groups.querySelectorAll(".mu-row");
    expect(rows).toHaveLength(2);
    expect(rows[rows.length - 1].textContent).toContain("其他会话");
    expect(rows[rows.length - 1].className).toContain("mu-row-other");
  });

  it("模型分组关闭：隐藏模型 tab 并给一句结论", () => {
    useMobileUsageStore.setState({
      data: stats({ groups: { ...stats().groups, models: [], modelsHidden: true } }),
    });
    render(<UsagePage />);
    const groups = screen.getByRole("region", { name: "分组" });
    expect(within(groups).queryByRole("button", { name: "模型" })).toBeNull();
    expect(within(groups).getByText("模型分组已在电脑端关闭。")).toBeInTheDocument();
    expect(screen.getByText("模型分组已在电脑端关闭")).toBeInTheDocument();
  });

  it("价格行只读：模型数与更新时间", () => {
    render(<UsagePage />);
    expect(screen.getByText("价格表")).toBeInTheDocument();
    expect(screen.getByText(/18 个模型 · 1 分钟前更新/)).toBeInTheDocument();
  });

  it("缺价：金额显示 —、隐藏环比、剖面给结论", () => {
    useMobileUsageStore.setState({
      data: stats({ summary: { ...stats().summary, costSource: "unknown" } }),
    });
    render(<UsagePage />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("较上期")).toBeNull();
    expect(screen.getByText("缺价，画不出花费剖面。")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("没有可用价格")).toBeInTheDocument();
  });

  it("空区间：一句结论 + 分组空态", () => {
    const base = stats();
    useMobileUsageStore.setState({
      data: stats({
        days: [],
        summary: {
          ...base.summary,
          tokens: 0,
          costCnyMicros: 0,
          calls: 0,
          sessions: 0,
          cacheHitPct: null,
        },
        groups: { clients: [], sessions: [], models: [] },
      }),
    });
    render(<UsagePage />);
    expect(screen.getByText("这个区间还没有花费记录。")).toBeInTheDocument();
    expect(screen.getByText("这个区间没有可展示的分组。")).toBeInTheDocument();
    expect(screen.queryByText("暂无数据")).toBeNull();
  });

  it("账本缺失：一行结论 + 重试", () => {
    useMobileUsageStore.setState({
      data: stats({ ledger: { available: false, reason: "ledger_missing" } }),
    });
    render(<UsagePage />);
    expect(screen.getByText("还没找到 DSH 账本，先在电脑上打开 DSH。")).toBeInTheDocument();
    expect(screen.queryByText("近 7 天花费")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(tauri.sendUsageRequest).toHaveBeenCalledWith("7d");
  });

  it("电脑未连接：保留最后快照并提示", () => {
    useConnectionStore.setState({ status: "disconnected" });
    render(<UsagePage />);
    expect(screen.getByText("电脑未连接，显示最后一次快照。")).toBeInTheDocument();
    expect(screen.getByText("¥29.84")).toBeInTheDocument();
  });

  it("无快照：连接失败给结论与「重试」", async () => {
    useMobileUsageStore.setState({ data: null, loading: false, error: null });
    tauri.sendUsageRequest.mockRejectedValueOnce(new Error("offline"));
    render(<UsagePage />);
    expect(await screen.findByText("电脑还没回应。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("未连接且无快照：结论 +「去连接」", () => {
    useMobileUsageStore.setState({ data: null, loading: false, error: null });
    useConnectionStore.setState({ status: "disconnected" });
    render(<UsagePage />);
    expect(screen.getByText("还没连上电脑。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "去连接" })).toBeInTheDocument();
  });

  it("等待账本时只显示一行结论", () => {
    useMobileUsageStore.setState({ data: null, loading: true, error: null });
    render(<UsagePage />);
    expect(screen.getByText("正在读账本…")).toBeInTheDocument();
  });
});
