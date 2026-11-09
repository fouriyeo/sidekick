import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBackHandlers, handleBack } from "@/mobile/system-back";
import type { WordSummary } from "@/protocol/words";

const api = vi.hoisted(() => ({
  wordList: vi.fn(),
  wordGet: vi.fn(),
  wordAdd: vi.fn(),
  wordExplain: vi.fn(),
  wordDelete: vi.fn(),
  wordGenerate: vi.fn(),
  wordTts: vi.fn(),
  wordUsage: vi.fn(),
  wordStatus: vi.fn(),
  wordConsent: vi.fn(),
  wordSyncNow: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => ({
  ...api,
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

import { WordGenerate } from "./word-generate";
import { useWordsStore } from "./words-store";

const WORDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];

function summary(word: string): WordSummary {
  return {
    id: word,
    word,
    status: "ready",
    source: "manual",
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now() - 60_000,
    firstDefinition: `${word} 的释义`,
  };
}

function seedReady(count: number) {
  useWordsStore.setState({ items: WORDS.slice(0, count).map(summary) });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearBackHandlers();
  useWordsStore.getState().reset();
  api.wordList.mockResolvedValue([]);
  api.wordGenerate.mockResolvedValue({
    model: "qwen3.8-flash",
    sentences: [{ en: "We stayed resilient.", zh: "我们保持韧性。", words: ["resilient"] }],
  });
  api.wordTts.mockResolvedValue({ path: "", characters: 20, cached: false, fallback: true });
});

afterEach(() => {
  cleanup();
  clearBackHandlers();
});

describe("造句页", () => {
  it("已解释的词不足 5 个时给出去词库的引导", () => {
    seedReady(3);
    render(<WordGenerate onBack={() => undefined} />);

    expect(screen.getByText("已解释的词还不够")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回词库" })).toBeInTheDocument();
  });

  it("选 5–10 个词后生成，展示中文翻译与用到的词", async () => {
    seedReady(6);
    render(<WordGenerate onBack={() => undefined} />);

    const generate = () => screen.getByRole("button", { name: /生成例句|再选/ });
    expect(generate()).toBeDisabled();
    expect(generate()).toHaveTextContent("再选 5 个");

    for (const word of WORDS.slice(0, 5)) {
      fireEvent.click(screen.getByRole("checkbox", { name: `选择 ${word}` }));
    }
    expect(generate()).toHaveTextContent("生成例句（5 个词）");
    expect(generate()).toBeEnabled();

    fireEvent.click(generate());

    await waitFor(() => expect(api.wordGenerate).toHaveBeenCalledWith(WORDS.slice(0, 5)));
    expect(await screen.findByText("We stayed resilient.")).toBeInTheDocument();
    expect(screen.getByText("我们保持韧性。")).toBeInTheDocument();
    expect(screen.getByText("用到：")).toBeInTheDocument();
    expect(screen.getByText("resilient")).toBeInTheDocument();
  });

  it("生成失败显示错误并可重试", async () => {
    seedReady(5);
    api.wordGenerate.mockRejectedValueOnce(new Error("timeout"));
    render(<WordGenerate onBack={() => undefined} />);

    for (const word of WORDS.slice(0, 5)) {
      fireEvent.click(screen.getByRole("checkbox", { name: `选择 ${word}` }));
    }
    fireEvent.click(screen.getByRole("button", { name: /生成例句/ }));

    expect(await screen.findByText(/等太久没有回应/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(api.wordGenerate).toHaveBeenCalledTimes(2));
  });

  it("生成结果的每句可以单独朗读（sentence 类型）", async () => {
    useWordsStore.setState({
      items: WORDS.map(summary),
      generated: {
        model: "qwen3.8-flash",
        sentences: [{ en: "We stayed resilient.", zh: "我们保持韧性。", words: ["resilient"] }],
      },
    });
    render(<WordGenerate onBack={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "朗读例句 1" }));
    await waitFor(() =>
      expect(api.wordTts).toHaveBeenCalledWith("We stayed resilient.", "sentence"),
    );
  });

  it("返回键回列表", () => {
    const onBack = vi.fn();
    seedReady(5);
    render(<WordGenerate onBack={onBack} />);

    act(() => {
      expect(handleBack()).toBe(true);
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
