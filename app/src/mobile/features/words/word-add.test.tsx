import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBackHandlers, handleBack } from "@/mobile/system-back";
import type { WordDetail } from "@/protocol/words";

const api = vi.hoisted(() => ({
  wordList: vi.fn(),
  wordGet: vi.fn(),
  wordAdd: vi.fn(),
  wordExplain: vi.fn(),
  wordDelete: vi.fn(),
  wordGenerate: vi.fn(),
  wordUsage: vi.fn(),
  wordStatus: vi.fn(),
  wordConsent: vi.fn(),
  wordSyncNow: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => ({
  ...api,
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

import { WordAddPage } from "./word-add";
import { useWordsStore } from "./words-store";

function detail(overrides: Partial<WordDetail> = {}): WordDetail {
  return {
    id: "resilience",
    word: "resilience",
    status: "pending",
    source: "mobile",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearBackHandlers();
  useWordsStore.getState().reset();
  useWordsStore.setState({
    status: { hasKey: true, agreed: true, paired: true, model: "qwen3.8-flash" },
  });
  api.wordAdd.mockResolvedValue(detail());
});

afterEach(() => {
  cleanup();
  clearBackHandlers();
});

describe("新增单词页", () => {
  it("保存单词与语境句，回包后交给详情页自动解释", async () => {
    const onSaved = vi.fn();
    render(<WordAddPage onBack={() => undefined} onSaved={onSaved} />);

    const save = screen.getByRole("button", { name: "保存并解释" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("单词"), { target: { value: " resilience " } });
    fireEvent.change(screen.getByLabelText("语境句"), {
      target: { value: "The team stayed resilient after the outage." },
    });
    fireEvent.click(save);

    await waitFor(() =>
      expect(api.wordAdd).toHaveBeenCalledWith({
        word: "resilience",
        context: "The team stayed resilient after the outage.",
        source: "mobile",
      }),
    );
    expect(onSaved).toHaveBeenCalledWith("resilience");
  });

  it("入库失败留在本页并显示中文错误", async () => {
    api.wordAdd.mockRejectedValue(new Error("invalid_word"));
    const onSaved = vi.fn();
    render(<WordAddPage onBack={() => undefined} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("单词"), { target: { value: "not a word" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并解释" }));

    expect(await screen.findByText(/不像一个英文单词/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("返回键回列表", () => {
    const onBack = vi.fn();
    render(<WordAddPage onBack={onBack} onSaved={() => undefined} />);

    act(() => {
      expect(handleBack()).toBe(true);
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
