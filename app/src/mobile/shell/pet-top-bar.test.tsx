import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useMobileUsageStore } from "@/mobile/features/usage/usage-store";
import { useUiStore } from "@/mobile/ui-store";
import type { TokenUsageStats } from "@/protocol/messages";
import { PetTopBar } from "./pet-top-bar";

const tauri = vi.hoisted(() => ({
  sendUsageRequest: vi.fn(async () => undefined),
}));

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  sendUsageRequest: tauri.sendUsageRequest,
}));

function todayStats(overrides: Partial<TokenUsageStats> = {}): TokenUsageStats {
  return {
    range: "today",
    generatedAt: Date.now(),
    summary: {
      tokens: 123_456,
      input: 10_000,
      output: 3_456,
      cacheRead: 110_000,
      cacheWrite: 0,
      reasoning: 0,
      costCnyMicros: 420_000,
      estimatedCostMicros: 0,
      costSource: "ledger",
      calls: 20,
      sessions: 2,
      cacheHitPct: 91.7,
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
      modelCount: 1,
      fxCnyPerUsd: 7,
      fxSource: "ledger",
      mobileModels: true,
    },
    coverageDays: 1,
    ledger: { available: true, reason: null },
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  tauri.sendUsageRequest.mockClear();
  useUiStore.setState({ view: "pet", scanOpen: false, offlineReturnView: "pet" });
  useConnectionStore.setState({
    status: "connected",
    addr: "192.168.1.5:47810",
    retrying: false,
    retryAttempt: 0,
    retryAt: null,
    error: null,
  });
  useMobileUsageStore.setState({
    range: "7d",
    data: null,
    today: null,
    loading: false,
    error: null,
  });
});

afterEach(cleanup);

describe("PetTopBar v17", () => {
  it("连上时只显示信号塔图标，不写「已连接 · 局域网」", () => {
    render(<PetTopBar />);

    const connection = screen.getByRole("button", { name: /连接状态：已连接/ });
    expect(connection).toHaveAccessibleName(/连接状态：已连接 · 局域网，点按查看连接/);
    expect(connection.textContent).toBe("");
    expect(screen.queryByText(/已连接/)).toBeNull();
  });

  it("点信号塔进连接页", () => {
    render(<PetTopBar />);

    fireEvent.click(screen.getByRole("button", { name: /连接状态：已连接/ }));
    expect(useUiStore.getState().view).toBe("offline");
  });

  it("没连上时才补最短状态词（未连接 / 重连 Ns）", () => {
    useConnectionStore.setState({ status: "disconnected", retryAt: null });
    render(<PetTopBar />);

    expect(screen.getByText("未连接")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /连接状态：还没连上电脑/ })).toBeInTheDocument();
  });

  it("重连倒计时显示「重连 Ns」，完整文案在 aria-label", () => {
    useConnectionStore.setState({ status: "disconnected", retryAt: Date.now() + 12_000 });
    render(<PetTopBar />);

    expect(screen.getByText(/重连 \d+s/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /秒后重连/ })).toBeInTheDocument();
  });

  it("今日花费是顶栏数字，点开进用量页", () => {
    useMobileUsageStore.setState({ today: todayStats() });
    render(<PetTopBar />);

    const usage = screen.getByRole("button", { name: /用量：今天 12\.3 万 Token/ });
    expect(usage).toHaveTextContent("¥0.42");

    fireEvent.click(usage);
    expect(useUiStore.getState().view).toBe("usage");
  });

  it("估算花费带 ≈；账本缺失时退回图标", () => {
    useMobileUsageStore.setState({
      today: todayStats({ summary: { ...todayStats().summary, costSource: "estimated" } }),
    });
    const { unmount } = render(<PetTopBar />);
    expect(screen.getByText("≈¥0.42")).toBeInTheDocument();
    unmount();

    useMobileUsageStore.setState({
      today: todayStats({ ledger: { available: false, reason: "missing" } }),
    });
    render(<PetTopBar />);
    expect(screen.getByRole("button", { name: "用量，点按查看详情" })).toBeInTheDocument();
  });

  it("没有今日快照时显示仪表盘图标，并在连上后静默请求一次", () => {
    render(<PetTopBar />);

    expect(screen.getByRole("button", { name: "用量，点按查看详情" })).toBeInTheDocument();
    expect(tauri.sendUsageRequest).toHaveBeenCalledWith("today");
    expect(tauri.sendUsageRequest).toHaveBeenCalledTimes(1);
  });

  it("英语角入口：点 BookOpen 进 words 页，消息入口不再占顶栏", () => {
    render(<PetTopBar />);

    // 5 个热区：设置 / 连接 / 用量 / 备忘录 / 英语角；消息已移到设置。
    expect(screen.getByRole("banner").querySelectorAll("button")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: "消息" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "英语角" }));
    expect(useUiStore.getState().view).toBe("words");
  });

  it("断连时不请求今日用量", () => {
    useConnectionStore.setState({ status: "disconnected", retryAt: null });
    render(<PetTopBar />);

    expect(tauri.sendUsageRequest).not.toHaveBeenCalled();
  });
});
