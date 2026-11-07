import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudAsrStatus, UsageStats } from "@/shared/lib/tauri";

/**
 * 语音一级页（D104）：PageShell fade + 34/600 大标题「语音」 + 页内三段内容组件。
 * 页内没有 push 二级页、没有「‹ 设置」返回；三段内容的交互细节见
 * features/models/voice-settings.test.tsx。
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
import { VoicePage } from "./voice-page";

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
  return {
    today: {
      sessions: 2,
      inputTokens: 1_000,
      outputTokens: 200,
      totalTokens: 1_200,
      audioDurationMs: 6_500,
      costCnyMicros: 120_000,
    },
    last7Days: EMPTY_SUMMARY,
    last30Days: EMPTY_SUMMARY,
    last365Days: EMPTY_SUMMARY,
    days: [],
    priceNote: "按百炼价格估算，实际以百炼账单为准。",
  };
}

async function renderVoicePage() {
  render(<VoicePage />);
  await screen.findByLabelText("API Key");
}

beforeEach(() => {
  useCloudAsrStore.getState().reset();
  useUsageStore.getState().reset();
  vi.resetAllMocks();
  tauri.getCloudAsrStatus.mockResolvedValue(makeStatus());
  tauri.saveCloudAsr.mockResolvedValue(makeStatus());
  tauri.saveCloudKeywords.mockResolvedValue(makeStatus());
  tauri.getUsageStats.mockResolvedValue(makeUsage());
  tauri.clearUsageStats.mockResolvedValue(makeUsage());
});

afterEach(() => {
  cleanup();
  useCloudAsrStore.getState().reset();
  useUsageStore.getState().reset();
});

describe("VoicePage 语音一级页", () => {
  it("PageShell 大标题「语音」，没有设置返回按钮", async () => {
    await renderVoicePage();

    expect(screen.getByRole("heading", { name: "语音", level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    // 一级页没有「‹ 设置」返回（那是设置二级页才有的）。
    expect(screen.queryByRole("button", { name: "设置" })).toBeNull();
    expect(screen.queryByRole("button", { name: /返回/ })).toBeNull();
  });

  it("页内三段：百炼 / 关键词 / 语音用量，按顺序排列且没有 push 子页", async () => {
    await renderVoicePage();

    const baiLian = await screen.findByRole("heading", { name: "百炼", level: 2 });
    const keywords = await screen.findByRole("heading", { name: "关键词", level: 2 });
    const usage = await screen.findByRole("heading", { name: "语音用量", level: 2 });

    // DOM 顺序：百炼 → 关键词 → 语音用量。
    expect(
      baiLian.compareDocumentPosition(keywords) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(keywords.compareDocumentPosition(usage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // 三段内容都在同一页渲染（不是点进去的二级页）。
    expect(screen.getByLabelText("模型")).toBeInTheDocument();
    expect(await screen.findByLabelText("第 1 个关键词")).toHaveValue("异步");
    expect(screen.getByRole("button", { name: "清空统计" })).toBeInTheDocument();
  });
});
