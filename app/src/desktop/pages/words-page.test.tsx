import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordDetail, WordStatusInfo, WordSummary, WordUsageStats } from "@/protocol/words";

const tauri = vi.hoisted(() => ({
  wordList: vi.fn(),
  wordGet: vi.fn(),
  wordAdd: vi.fn(),
  wordExplain: vi.fn(),
  wordDelete: vi.fn(),
  wordGenerate: vi.fn(),
  wordUsage: vi.fn(),
  wordStatus: vi.fn(),
  wordConsent: vi.fn(),
  wordClipboardCandidates: vi.fn(),
  wordExportMarkdown: vi.fn(),
  wordTts: vi.fn(),
  subscribeWordChanged: vi.fn(() => () => {}),
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { useWordsStore } from "@/desktop/features/words/words-store";
import { WordsPage } from "./words-page";

const MODEL = "qwen3.8-flash";

function makeStatus(overrides: Partial<WordStatusInfo> = {}): WordStatusInfo {
  return { hasKey: true, agreed: true, model: MODEL, total: 0, ...overrides };
}

function makeSummary(overrides: Partial<WordSummary> = {}): WordSummary {
  return {
    id: "resilient",
    word: "resilient",
    status: "ready",
    source: "manual",
    createdAt: Date.now() - 120_000,
    updatedAt: Date.now() - 60_000,
    firstDefinition: "有韧性的",
    ...overrides,
  };
}

function makeDetail(overrides: Partial<WordDetail> = {}): WordDetail {
  return {
    ...makeSummary(),
    model: MODEL,
    explanation: {
      word: "resilient",
      phonetic: "/rɪˈzɪliənt/",
      pos: "adj.",
      definitions: [{ zh: "有韧性的", en: "able to recover quickly" }],
      examples: [{ en: "The team stayed resilient.", zh: "团队保持了韧性。" }],
    },
    ...overrides,
  };
}

function makeUsage(): WordUsageStats {
  return {
    today: { calls: 4, promptTokens: 712, completionTokens: 806, costCnyMicros: 2_746 },
    last30Days: {
      calls: 26,
      promptTokens: 4_394,
      completionTokens: 5_120,
      costCnyMicros: 17_344,
    },
    days: [],
    priceNote: "qwen3.8-flash · 输入 ¥0.8 / 输出 ¥2.7 每百万 token",
  };
}

beforeEach(() => {
  useWordsStore.getState().reset();
  vi.resetAllMocks();
  tauri.wordStatus.mockResolvedValue(makeStatus());
  tauri.wordList.mockResolvedValue([]);
  tauri.wordUsage.mockResolvedValue(makeUsage());
  tauri.wordGet.mockResolvedValue(makeDetail());
  tauri.wordConsent.mockResolvedValue(makeStatus());
  tauri.subscribeWordChanged.mockReturnValue(() => {});
});

afterEach(() => cleanup());

describe("WordsPage 英语角一级页", () => {
  it("未同意时显示隐私说明与同意按钮，同意后出现添加卡", async () => {
    tauri.wordStatus.mockResolvedValue(makeStatus({ agreed: false }));

    render(<WordsPage />);

    expect(
      await screen.findByText(
        "单词原文与可选语境句会发送到阿里云百炼；解释只存本机；不发送整个词库或剪贴板历史。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("添加单词")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "同意并开始使用" }));

    await waitFor(() => expect(tauri.wordConsent).toHaveBeenCalledWith(true));
    expect(await screen.findByText("添加单词")).toBeInTheDocument();
  });

  it("没有百炼 Key 时提示去「语音」页，并禁用查词", async () => {
    tauri.wordStatus.mockResolvedValue(makeStatus({ hasKey: false }));
    const nav = { go: vi.fn(), goSettings: vi.fn() };

    render(<WordsPage nav={nav} />);

    expect(
      await screen.findByText("还没有百炼 API Key，查词和造句暂时不能用。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查词" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "去「语音」页配置" }));
    expect(nav.go).toHaveBeenCalledWith("voice");
  });

  it("空词库显示空态，页内用量显示次数与估算金额", async () => {
    render(<WordsPage />);

    expect(
      await screen.findByText("词库还是空的。输入一个英文单词，点「查词」。"),
    ).toBeInTheDocument();
    expect(screen.getByText("还没有已解释的词。先查几个词，再回来造句。")).toBeInTheDocument();
    expect(screen.getByText(/4 次 · 估算 ¥0\.0027/)).toBeInTheDocument();
    expect(screen.getByText(/26 次 · 估算 ¥0\.02/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "英语角", level: 1 })).toBeInTheDocument();
    // 空词库：导出禁用、复习卡整卡隐藏。
    expect(screen.getByRole("button", { name: "导出" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "今天复习" })).toBeNull();
  });

  it("列表显示释义与状态，点条目 push 到详情并可返回", async () => {
    tauri.wordList.mockResolvedValue([
      makeSummary(),
      makeSummary({
        id: "throughput",
        word: "throughput",
        status: "failed",
        firstDefinition: undefined,
      }),
    ]);

    render(<WordsPage />);

    expect((await screen.findAllByText("resilient")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "导出" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "今天复习" })).toBeInTheDocument();
    expect(screen.getAllByText("有韧性的").length).toBeGreaterThan(0);
    expect(screen.getByText("解释失败")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /resilient/ }));

    expect(await screen.findByRole("heading", { name: "resilient", level: 1 })).toBeInTheDocument();
    expect(tauri.wordGet).toHaveBeenCalledWith("resilient");
    expect(screen.getByText("AI 生成")).toBeInTheDocument();
    expect(screen.getByText("able to recover quickly")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /词库/ }));
    expect(screen.getByRole("heading", { name: "英语角", level: 1 })).toBeInTheDocument();
  });

  it("词库读取失败时错误码映射成中文", async () => {
    tauri.wordList.mockRejectedValue(new Error("timeout"));

    render(<WordsPage />);

    expect(await screen.findByText(/请求超时/)).toBeInTheDocument();
    expect(screen.getByText("词库还是空的。输入一个英文单词，点「查词」。")).toBeInTheDocument();
  });
});
