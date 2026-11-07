import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudAsrStatus, UsageStats } from "@/shared/lib/tauri";

/**
 * 语音一级页（D104）的三段内容组件（<VoiceSettings />）：百炼配置 + 关键词 + 语音用量。
 *
 * 这里只测内容组件本身；PageShell / PageHeader 等一级页外壳由
 * pages/voice-page.test.tsx 覆盖。关键词的加行/删除/校验由
 * keywords-panel.test.tsx 覆盖，这里保留一条整页保存的集成用例。
 */

const tauri = vi.hoisted(() => ({
  getCloudAsrStatus: vi.fn(),
  saveCloudAsr: vi.fn(),
  testCloudAsr: vi.fn(),
  saveCloudKeywords: vi.fn(),
  getUsageStats: vi.fn(),
  clearUsageStats: vi.fn(),
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { useCloudAsrStore } from "@/desktop/features/models/cloud-asr-store";
import { useUsageStore } from "@/desktop/features/models/usage-store";
import { VoiceSettings } from "./voice-settings";

const CONFIG = {
  endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
  model: "qwen-audio-3.1-asr-flash-streaming",
  languageHints: ["zh"],
  keepDialect: false,
  vadModel: "near_meeting_16k" as const,
  maxSentenceSilenceMs: 800,
  heartbeat: true,
  vocabulary: ["异步", "剪贴板"],
};

function makeStatus(overrides: Partial<CloudAsrStatus> = {}): CloudAsrStatus {
  return {
    configured: true,
    consent: true,
    hasKey: true,
    keyMasked: "sk-••••cdef",
    config: { ...CONFIG, vocabulary: [...CONFIG.vocabulary] },
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

/** 三块内容各是一个 ListGroup（<section> 含 h2 组标题），按组标题取按钮避免「保存」重名。 */
function group(title: string) {
  const heading = screen.getByRole("heading", { name: title });
  const section = heading.closest("section");
  if (!section) throw new Error(`找不到「${title}」分组`);
  return within(section);
}

async function renderVoiceSettings() {
  render(<VoiceSettings />);
  await screen.findByLabelText("API Key");
}

beforeEach(() => {
  useCloudAsrStore.getState().reset();
  useUsageStore.getState().reset();
  vi.resetAllMocks();
  tauri.getCloudAsrStatus.mockResolvedValue(makeStatus());
  tauri.saveCloudAsr.mockResolvedValue(makeStatus());
  tauri.saveCloudKeywords.mockResolvedValue(makeStatus());
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

describe("VoiceSettings 单页三段", () => {
  it("同一页渲染百炼配置、关键词与语音用量，且不含页面外壳", async () => {
    await renderVoiceSettings();

    expect(screen.getByRole("heading", { name: "百炼", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "关键词", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "语音用量", level: 2 })).toBeInTheDocument();
    // 关键词面板嵌在同一页里（不是 push 二级页）。
    expect(await screen.findByLabelText("第 1 个关键词")).toHaveValue("异步");
    // 内容组件不带 PageShell / PageHeader（大标题由设置页给出）。
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });
});

describe("VoiceSettings 百炼配置", () => {
  it("加载后显示掩码 Key 与默认模型", async () => {
    await renderVoiceSettings();

    const key = screen.getByLabelText("API Key");
    expect(key).toHaveAttribute("placeholder", expect.stringContaining("sk-"));
    expect(key).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("模型")).toHaveValue("qwen-audio-3.1-asr-flash-streaming");
  });

  it("一键恢复推荐模型", async () => {
    await renderVoiceSettings();

    const model = screen.getByLabelText("模型");
    fireEvent.change(model, { target: { value: "custom-model" } });
    expect(model).toHaveValue("custom-model");

    fireEvent.click(screen.getByRole("button", { name: "使用推荐模型" }));
    expect(model).toHaveValue("qwen-audio-3.1-asr-flash-streaming");
  });

  it("保存提交配置、同意与 Key，并保留关键词", async () => {
    await renderVoiceSettings();

    fireEvent.click(group("百炼").getByRole("button", { name: "保存" }));

    await waitFor(() => expect(tauri.saveCloudAsr).toHaveBeenCalledTimes(1));
    expect(tauri.saveCloudAsr).toHaveBeenCalledWith({
      config: expect.objectContaining({
        endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
        model: "qwen-audio-3.1-asr-flash-streaming",
        vocabulary: ["异步", "剪贴板"],
      }),
      consent: true,
      apiKey: null,
      clearKey: false,
    });
    expect(await screen.findByText("已保存")).toBeInTheDocument();
  });

  it("测试连接成功显示延迟", async () => {
    await renderVoiceSettings();

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
    await renderVoiceSettings();

    const save = group("百炼").getByRole("button", { name: "保存" });
    expect(save).toBeDisabled();
    expect(screen.getByText("先同意才能保存")).toBeInTheDocument();
    fireEvent.click(save);
    expect(tauri.saveCloudAsr).not.toHaveBeenCalled();
  });

  it("服务地址不是 wss 时阻止测试", async () => {
    await renderVoiceSettings();

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
    await renderVoiceSettings();

    fireEvent.click(screen.getByRole("button", { name: "清除 Key" }));

    await waitFor(() =>
      expect(tauri.saveCloudAsr).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: null, clearKey: true }),
      ),
    );
  });
});

describe("VoiceSettings 关键词（嵌在单页里）", () => {
  it("保存整份关键词列表", async () => {
    await renderVoiceSettings();
    await screen.findByLabelText("第 2 个关键词");

    fireEvent.click(group("关键词").getByRole("button", { name: "保存" }));

    await waitFor(() => expect(tauri.saveCloudKeywords).toHaveBeenCalledTimes(1));
    expect(tauri.saveCloudKeywords).toHaveBeenCalledWith(["异步", "剪贴板"]);
  });
});

describe("VoiceSettings 语音用量", () => {
  it("切换区间：今天只汇总，7 天/30 天按天明细，1 年按月汇总", async () => {
    await renderVoiceSettings();
    await screen.findByRole("heading", { name: "语音用量" });

    expect(screen.getByRole("button", { name: "今天" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("11-14")).toBeNull();
    expect(screen.queryByRole("heading", { name: "明细" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "7 天" }));
    expect(screen.getByText("11-14")).toBeInTheDocument();
    expect(screen.getByText("11-08")).toBeInTheDocument();
    expect(screen.queryByText("11-07")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "30 天" }));
    expect(screen.getByText("10-16")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1 年" }));
    expect(screen.getByText("2026-11")).toBeInTheDocument();
    expect(screen.getByText("2025-11")).toBeInTheDocument();

    expect(screen.getByText("按百炼价格估算，实际以百炼账单为准。")).toBeInTheDocument();
  });

  it("清空统计需要确认并调用后端", async () => {
    await renderVoiceSettings();
    await screen.findByRole("heading", { name: "语音用量" });

    fireEvent.click(group("语音用量").getByRole("button", { name: "清空统计" }));
    expect(await screen.findByText("清空用量统计？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清空" }));

    await waitFor(() => expect(tauri.clearUsageStats).toHaveBeenCalledTimes(1));
  });
});
