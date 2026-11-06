import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudAsrStatus } from "@/shared/lib/tauri";

const tauri = vi.hoisted(() => ({
  getCloudAsrStatus: vi.fn(),
  saveCloudAsr: vi.fn(),
  testCloudAsr: vi.fn(),
  clearCloudAsr: vi.fn(),
  saveCloudKeywords: vi.fn(),
  getUsageStats: vi.fn(),
  clearUsageStats: vi.fn(),
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { useCloudAsrStore } from "@/desktop/features/models/cloud-asr-store";
import { useUsageStore } from "@/desktop/features/models/usage-store";
import { VoicePage } from "./voice-page";

const STATUS: CloudAsrStatus = {
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
    vocabulary: ["异步", "剪贴板"],
  },
};

async function renderKeywordsPane() {
  render(<VoicePage pane="keywords" onPaneChange={vi.fn()} />);
  await screen.findByLabelText("第 1 个关键词");
}

beforeEach(() => {
  useCloudAsrStore.getState().reset();
  useUsageStore.getState().reset();
  vi.resetAllMocks();
  tauri.getCloudAsrStatus.mockResolvedValue(STATUS);
  tauri.saveCloudKeywords.mockResolvedValue(STATUS);
  tauri.getUsageStats.mockResolvedValue({
    today: {
      sessions: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      audioDurationMs: 0,
      costCnyMicros: 0,
    },
    last7Days: {
      sessions: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      audioDurationMs: 0,
      costCnyMicros: 0,
    },
    last30Days: {
      sessions: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      audioDurationMs: 0,
      costCnyMicros: 0,
    },
    last365Days: {
      sessions: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      audioDurationMs: 0,
      costCnyMicros: 0,
    },
    days: [],
    priceNote: "",
  });
});

afterEach(() => {
  cleanup();
  useCloudAsrStore.getState().reset();
  useUsageStore.getState().reset();
});

describe("VoicePage 关键词", () => {
  it("一行一个词，显示数量与已有关键词", async () => {
    await renderKeywordsPane();

    expect(screen.getByRole("heading", { name: "关键词", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("2 / 2000")).toBeInTheDocument();
    expect(screen.getByLabelText("第 1 个关键词")).toHaveValue("异步");
    expect(screen.getByLabelText("第 2 个关键词")).toHaveValue("剪贴板");
  });

  it("点加号加一行，保存时提交整份列表", async () => {
    await renderKeywordsPane();

    fireEvent.click(screen.getByRole("button", { name: "加一行" }));
    fireEvent.change(await screen.findByLabelText("第 3 个关键词"), {
      target: { value: "函数" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(tauri.saveCloudKeywords).toHaveBeenCalledTimes(1));
    expect(tauri.saveCloudKeywords).toHaveBeenCalledWith(["异步", "剪贴板", "函数"]);
    expect(await screen.findByText("已保存")).toBeInTheDocument();
  });

  it("去空行与重复词后再保存", async () => {
    await renderKeywordsPane();

    fireEvent.change(screen.getByLabelText("第 1 个关键词"), { target: { value: " 异步 " } });
    fireEvent.change(screen.getByLabelText("第 2 个关键词"), { target: { value: "异步" } });
    fireEvent.click(screen.getByRole("button", { name: "加一行" }));
    fireEvent.change(await screen.findByLabelText("第 3 个关键词"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(tauri.saveCloudKeywords).toHaveBeenCalledTimes(1));
    expect(tauri.saveCloudKeywords).toHaveBeenCalledWith(["异步"]);
  });

  it("删除一行后保存剩余关键词", async () => {
    await renderKeywordsPane();

    fireEvent.click(screen.getByRole("button", { name: "删除第 1 行" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(tauri.saveCloudKeywords).toHaveBeenCalledTimes(1));
    expect(tauri.saveCloudKeywords).toHaveBeenCalledWith(["剪贴板"]);
  });

  it("超长中文阻止保存并给出行号", async () => {
    await renderKeywordsPane();

    fireEvent.change(screen.getByLabelText("第 1 个关键词"), {
      target: { value: "一二三四五六七八九十一二三四五六" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText(/第 1 个：.*太长/)).toBeInTheDocument();
    expect(tauri.saveCloudKeywords).not.toHaveBeenCalled();
  });
});
