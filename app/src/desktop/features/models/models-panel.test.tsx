import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudAsrStatus, UsageStats } from "@/shared/lib/tauri";

const tauri = vi.hoisted(() => ({
  getCloudAsrStatus: vi.fn(),
  saveCloudAsr: vi.fn(),
  testCloudAsr: vi.fn(),
  clearCloudAsr: vi.fn(),
  getUsageStats: vi.fn(),
  clearUsageStats: vi.fn(),
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { useCloudAsrStore } from "./cloud-asr-store";
import { ModelsPanel } from "./models-panel";
import { useUsageStore } from "./usage-store";

function makeStatus(overrides: Partial<CloudAsrStatus> = {}): CloudAsrStatus {
  return {
    configured: true,
    consent: true,
    hasKey: true,
    keyMasked: "sk-••••cdef",
    config: {
      endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
      model: "qwen-audio-3.1-asr-flash-streaming",
      languageHints: ["zh"],
      keepDialect: false,
      vadModel: "near_meeting_16k",
      maxSentenceSilenceMs: 800,
      heartbeat: true,
      vocabulary: ["异步"],
    },
    ...overrides,
  };
}

const EMPTY_SUMMARY = {
  sessions: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  audioDurationMs: 0,
  costCnyMicros: 0,
};

function makeUsage(): UsageStats {
  const today = {
    sessions: 2,
    inputTokens: 1_000,
    outputTokens: 200,
    totalTokens: 1_200,
    audioDurationMs: 6_500,
    costCnyMicros: 120_000,
  };
  return {
    today,
    last7Days: { ...today, costCnyMicros: 1_200_000 },
    last30Days: { ...today, sessions: 4, totalTokens: 2_400, costCnyMicros: 2_400_000 },
    last365Days: { ...today, sessions: 10, totalTokens: 6_000, costCnyMicros: 6_000_000 },
    days: Array.from({ length: 365 }, (_, index) => {
      const date = new Date("2026-11-14T00:00:00Z");
      date.setUTCDate(date.getUTCDate() - index);
      return {
        date: date.toISOString().slice(0, 10),
        ...(index === 0 ? today : EMPTY_SUMMARY),
      };
    }),
    priceNote: "按百炼价格估算，实际以百炼账单为准。",
  };
}

async function renderPanel() {
  render(<ModelsPanel />);
  await screen.findByLabelText("API Key");
}

beforeEach(() => {
  useCloudAsrStore.getState().reset();
  useUsageStore.getState().reset();
  vi.resetAllMocks();
  tauri.getCloudAsrStatus.mockResolvedValue(makeStatus());
  tauri.saveCloudAsr.mockResolvedValue(makeStatus());
  tauri.testCloudAsr.mockResolvedValue({
    ok: true,
    latencyMs: 320,
    model: "qwen-audio-3.1-asr-flash-streaming",
    errorCode: null,
    message: null,
  });
  tauri.getUsageStats.mockResolvedValue(makeUsage());
  tauri.clearUsageStats.mockResolvedValue({
    ...makeUsage(),
    today: EMPTY_SUMMARY,
    last7Days: EMPTY_SUMMARY,
    last30Days: EMPTY_SUMMARY,
    last365Days: EMPTY_SUMMARY,
    days: Array.from({ length: 365 }, (_, index) => {
      const date = new Date("2026-11-14T00:00:00Z");
      date.setUTCDate(date.getUTCDate() - index);
      return { date: date.toISOString().slice(0, 10), ...EMPTY_SUMMARY };
    }),
  });
});

afterEach(() => {
  cleanup();
  useCloudAsrStore.getState().reset();
  useUsageStore.getState().reset();
});

describe("ModelsPanel 百炼配置", () => {
  it("加载后显示掩码 Key、默认模型与用量金额", async () => {
    await renderPanel();

    const key = screen.getByLabelText("API Key");
    expect(key).toHaveAttribute("placeholder", expect.stringContaining("sk-"));
    expect(key).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("模型")).toHaveValue("qwen-audio-3.1-asr-flash-streaming");
    expect(screen.getAllByText("¥0.12").length).toBeGreaterThan(0);
  });

  it("一键恢复推荐模型", async () => {
    await renderPanel();

    const model = screen.getByLabelText("模型");
    fireEvent.change(model, { target: { value: "custom-model" } });
    expect(model).toHaveValue("custom-model");

    fireEvent.click(screen.getByRole("button", { name: "使用推荐模型" }));
    expect(model).toHaveValue("qwen-audio-3.1-asr-flash-streaming");
  });

  it("保存提交配置、同意与 Key，并显示已保存", async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(tauri.saveCloudAsr).toHaveBeenCalledTimes(1));
    expect(tauri.saveCloudAsr).toHaveBeenCalledWith({
      config: {
        endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
        model: "qwen-audio-3.1-asr-flash-streaming",
        languageHints: ["zh"],
        keepDialect: false,
        vadModel: "near_meeting_16k",
        maxSentenceSilenceMs: 800,
        heartbeat: true,
        vocabulary: ["异步"],
      },
      consent: true,
      apiKey: null,
      clearKey: false,
    });
    expect(await screen.findByText("已保存")).toBeInTheDocument();
  });

  it("测试连接成功显示延迟", async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    expect(await screen.findByText(/连接成功 · 320ms/)).toBeInTheDocument();
    expect(tauri.testCloudAsr).toHaveBeenCalledWith({
      config: expect.objectContaining({
        endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
        model: "qwen-audio-3.1-asr-flash-streaming",
      }),
      apiKey: null,
    });
  });

  it("未勾选同意时不能保存", async () => {
    tauri.getCloudAsrStatus.mockResolvedValue(makeStatus({ consent: false }));
    await renderPanel();

    const save = screen.getByRole("button", { name: "保存" });
    expect(save).toBeDisabled();
    expect(screen.getByText("先勾选上方同意才能保存。")).toBeInTheDocument();
    fireEvent.click(save);
    expect(tauri.saveCloudAsr).not.toHaveBeenCalled();
  });

  it("服务地址不是 wss 时阻止测试", async () => {
    await renderPanel();

    fireEvent.change(screen.getByLabelText("服务地址"), {
      target: { value: "http://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    expect(
      await screen.findByText("服务地址必须是 wss://（本机测试可用 ws://localhost）"),
    ).toBeInTheDocument();
    expect(tauri.testCloudAsr).not.toHaveBeenCalled();
  });

  it("清除 Key 只删除密钥、保留配置", async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "清除 Key" }));

    await waitFor(() =>
      expect(tauri.saveCloudAsr).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: null, clearKey: true }),
      ),
    );
  });
});

describe("ModelsPanel 用量统计", () => {
  it("切换区间：今天只看汇总，近 7 天/近 1 个月显示按天明细，近 1 年按月汇总", async () => {
    await renderPanel();

    expect(screen.getByRole("tab", { name: "今天" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("11-14")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "近 7 天" }));
    expect(screen.getByText("11-14")).toBeInTheDocument();
    expect(screen.getByText("11-08")).toBeInTheDocument();
    expect(screen.queryByText("11-07")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "近 1 个月" }));
    expect(screen.getByText("10-16")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "近 1 年" }));
    expect(screen.getByText("2026-11")).toBeInTheDocument();
    expect(screen.getByText("2025-11")).toBeInTheDocument();

    expect(screen.getByText("按百炼价格估算，实际以百炼账单为准。")).toBeInTheDocument();
  });

  it("清空统计需要确认并调用后端", async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "清空统计" }));
    expect(await screen.findByText("清空用量统计？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清空" }));

    await waitFor(() => expect(tauri.clearUsageStats).toHaveBeenCalledTimes(1));
  });
});
