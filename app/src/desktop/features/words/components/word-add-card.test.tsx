import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  wordList: vi.fn(),
  wordGet: vi.fn(),
  wordAdd: vi.fn(),
  wordExplain: vi.fn(),
  wordDelete: vi.fn(),
  wordClipboardCandidates: vi.fn(),
  wordGenerate: vi.fn(),
  wordUsage: vi.fn(),
  wordStatus: vi.fn(),
  wordConsent: vi.fn(),
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { useWordsStore } from "../words-store";
import { WordAddCard } from "./word-add-card";

beforeEach(() => {
  useWordsStore.getState().reset();
  vi.resetAllMocks();
  tauri.wordAdd.mockResolvedValue({});
  tauri.wordExplain.mockResolvedValue({});
  tauri.wordList.mockResolvedValue([]);
  tauri.wordClipboardCandidates.mockResolvedValue(["throughput", "resilient"]);
  tauri.wordUsage.mockResolvedValue({
    today: { calls: 0, promptTokens: 0, completionTokens: 0, costCnyMicros: 0 },
    last30Days: { calls: 0, promptTokens: 0, completionTokens: 0, costCnyMicros: 0 },
    days: [],
    priceNote: "",
  });
});

afterEach(() => cleanup());

describe("WordAddCard 添加卡", () => {
  it("空输入给内联提示且不调用命令", async () => {
    render(<WordAddCard canRequest />);
    fireEvent.click(screen.getByRole("button", { name: "查词" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入一个英文单词");
    expect(tauri.wordAdd).not.toHaveBeenCalled();
  });

  it("非英文 / 超长给内联提示", () => {
    render(<WordAddCard canRequest />);
    const input = screen.getByLabelText("单词");

    fireEvent.change(input, { target: { value: "韧性" } });
    fireEvent.click(screen.getByRole("button", { name: "查词" }));
    expect(screen.getByRole("alert")).toHaveTextContent("只支持英文单词");

    fireEvent.change(input, { target: { value: "a".repeat(80) } });
    fireEvent.click(screen.getByRole("button", { name: "查词" }));
    expect(screen.getByRole("alert")).toHaveTextContent("单词太长");
    expect(tauri.wordAdd).not.toHaveBeenCalled();
  });

  it("合法单词提交后清空输入", async () => {
    render(<WordAddCard canRequest />);
    fireEvent.change(screen.getByLabelText("单词"), { target: { value: "  resilient " } });
    fireEvent.change(screen.getByLabelText("语境句"), {
      target: { value: "The team stayed resilient." },
    });
    fireEvent.click(screen.getByRole("button", { name: "查词" }));

    await waitFor(() =>
      expect(tauri.wordAdd).toHaveBeenCalledWith({
        word: "resilient",
        context: "The team stayed resilient.",
        source: "manual",
      }),
    );
    await waitFor(() => expect(screen.getByLabelText("单词")).toHaveValue(""));
    expect(screen.getByLabelText("语境句")).toHaveValue("");
  });

  it("从剪贴板取词：chips 最多 8 个，点击只填入输入框、不自动查词", async () => {
    tauri.wordClipboardCandidates.mockResolvedValue([
      "w1",
      "w2",
      "w3",
      "w4",
      "w5",
      "w6",
      "w7",
      "w8",
      "w9",
    ]);
    render(<WordAddCard canRequest />);

    fireEvent.click(screen.getByRole("button", { name: "从剪贴板取词" }));

    const chip = await screen.findByRole("button", { name: "w1" });
    expect(screen.getByRole("button", { name: "w8" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "w9" })).toBeNull();
    fireEvent.click(chip);

    expect(screen.getByLabelText("单词")).toHaveValue("w1");
    expect(tauri.wordAdd).not.toHaveBeenCalled();
    expect(tauri.wordExplain).not.toHaveBeenCalled();
  });

  it("剪贴板里没有英文单词时提示", async () => {
    tauri.wordClipboardCandidates.mockResolvedValue([]);
    render(<WordAddCard canRequest />);

    fireEvent.click(screen.getByRole("button", { name: "从剪贴板取词" }));

    expect(await screen.findByText("剪贴板里没有英文单词")).toBeInTheDocument();
  });

  it("未完成前置条件时禁用查词", () => {
    render(<WordAddCard canRequest={false} />);
    expect(screen.getByRole("button", { name: "查词" })).toBeDisabled();
    expect(screen.getByText("先完成同意 / 配置百炼 Key，才能查词。")).toBeInTheDocument();
  });
});
