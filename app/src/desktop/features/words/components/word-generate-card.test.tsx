import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordSummary, WordUsageStats } from "@/protocol/words";

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
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { useWordsStore } from "../words-store";
import { WordGenerateCard } from "./word-generate-card";

const USAGE: WordUsageStats = {
  today: { calls: 0, promptTokens: 0, completionTokens: 0, costCnyMicros: 0 },
  last30Days: { calls: 0, promptTokens: 0, completionTokens: 0, costCnyMicros: 0 },
  days: [],
  priceNote: "",
};

function word(word: string, status: WordSummary["status"] = "ready"): WordSummary {
  return {
    id: word,
    word,
    status,
    source: "manual",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    firstDefinition: `${word} 的释义`,
  };
}

beforeEach(() => {
  useWordsStore.getState().reset();
  vi.resetAllMocks();
  tauri.wordUsage.mockResolvedValue(USAGE);
  tauri.wordGenerate.mockResolvedValue({
    model: "qwen3.8-flash",
    sentences: [
      {
        en: "The team stayed resilient through the outage.",
        zh: "团队在故障期间保持了韧性。",
        words: ["resilient"],
      },
    ],
  });
});

afterEach(() => cleanup());

describe("WordGenerateCard 造句卡", () => {
  it("只列已解释的词，选够 5 个才能生成", async () => {
    const items = [
      word("alpha"),
      word("bravo"),
      word("charlie"),
      word("delta"),
      word("echo"),
      word("foxtrot"),
      word("pending-word", "pending"),
    ];
    render(<WordGenerateCard items={items} canRequest />);

    const button = screen.getByRole("button", { name: "生成例句" });
    expect(button).toBeDisabled();
    expect(screen.queryByLabelText("选择 pending-word")).toBeNull();

    for (const item of ["alpha", "bravo", "charlie", "delta"]) {
      fireEvent.click(screen.getByLabelText(`选择 ${item}`));
    }
    expect(button).toBeDisabled();
    expect(screen.getByText(/已选 4 \/ 10/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("选择 echo"));
    expect(button).toBeEnabled();

    fireEvent.click(button);
    await waitFor(() =>
      expect(tauri.wordGenerate).toHaveBeenCalledWith([
        "alpha",
        "bravo",
        "charlie",
        "delta",
        "echo",
      ]),
    );
  });

  it("已解释的词不足 5 个时给出提示", () => {
    render(<WordGenerateCard items={[word("alpha"), word("bravo")]} canRequest />);
    expect(screen.getByText("至少需要 5 个已解释的词，当前 2 个。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成例句" })).toBeDisabled();
  });

  it("生成结果逐句显示英文、中文与用到的词", async () => {
    const items = ["alpha", "bravo", "charlie", "delta", "echo"].map((item) => word(item));
    render(<WordGenerateCard items={items} canRequest />);

    for (const item of items) {
      fireEvent.click(screen.getByLabelText(`选择 ${item.word}`));
    }
    fireEvent.click(screen.getByRole("button", { name: "生成例句" }));

    expect(
      await screen.findByText("The team stayed resilient through the outage."),
    ).toBeInTheDocument();
    expect(screen.getByText("团队在故障期间保持了韧性。")).toBeInTheDocument();
    expect(screen.getByText("例句 · qwen3.8-flash")).toBeInTheDocument();
    expect(screen.getByText("resilient")).toBeInTheDocument();
  });

  it("未完成前置条件时禁用生成", () => {
    render(<WordGenerateCard items={[]} canRequest={false} />);
    expect(screen.getByText("配置好百炼 Key 并同意后才能造句。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成例句" })).toBeDisabled();
  });
});
