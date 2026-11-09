import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordDetail, WordSummary } from "@/protocol/words";

const tauri = vi.hoisted(() => ({
  wordList: vi.fn(),
  wordGet: vi.fn(),
  wordAdd: vi.fn(),
  wordExplain: vi.fn(),
  wordSetNote: vi.fn(),
  wordDelete: vi.fn(),
  wordGenerate: vi.fn(),
  wordUsage: vi.fn(),
  wordStatus: vi.fn(),
  wordConsent: vi.fn(),
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { WordReviewCard } from "./word-review-card";

function word(name: string, status: WordSummary["status"] = "ready"): WordSummary {
  return {
    id: name,
    word: name,
    status,
    source: "manual",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    firstDefinition: `${name} 的释义`,
  };
}

function detail(name: string): WordDetail {
  return {
    ...word(name),
    explanation: {
      word: name,
      definitions: [{ zh: `${name} 的释义` }],
      examples: [{ en: `Example sentence for ${name}.`, zh: `${name} 的例句。` }],
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  tauri.wordGet.mockImplementation(async (name: string) => detail(name));
});

afterEach(() => cleanup());

describe("WordReviewCard 今天复习", () => {
  it("5 个 ready 词：看释义 → 下一个 → 复习完成 → 再来一组", async () => {
    const items = ["alpha", "bravo", "charlie", "delta", "echo"].map((name) => word(name));
    render(<WordReviewCard items={items} />);

    expect(screen.getByRole("heading", { name: "今天复习" })).toBeInTheDocument();
    expect(screen.getByText("1 / 5")).toBeInTheDocument();

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "看释义" }));
      expect(await screen.findByText(/ 的释义$/)).toBeInTheDocument();
      expect(await screen.findByText(/Example sentence for/)).toBeInTheDocument();
      expect(tauri.wordGet).toHaveBeenCalledTimes(index + 1);
      fireEvent.click(screen.getByRole("button", { name: "下一个" }));
    }

    expect(await screen.findByText("复习完成")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "再来一组" }));
    expect(await screen.findByText("1 / 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "看释义" })).toBeInTheDocument();
  });

  it("没有已解释的词时整卡不渲染", () => {
    const { container } = render(
      <WordReviewCard items={[word("pending", "pending"), word("failed", "failed")]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("例句读取失败显示映射后的错误，但不影响继续", async () => {
    tauri.wordGet.mockRejectedValue(new Error("timeout"));
    render(<WordReviewCard items={[word("alpha"), word("bravo")]} />);

    fireEvent.click(screen.getByRole("button", { name: "看释义" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请求超时");
    expect(screen.getByRole("button", { name: "下一个" })).toBeInTheDocument();
  });

  it("ready 词不足 5 个时有多少复习多少", async () => {
    render(<WordReviewCard items={[word("alpha"), word("bravo")]} />);

    await waitFor(() => expect(screen.getByText("1 / 2")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "看释义" }));
    await screen.findByText(/Example sentence for/);
    fireEvent.click(screen.getByRole("button", { name: "下一个" }));
    fireEvent.click(await screen.findByRole("button", { name: "看释义" }));
    await screen.findByText(/Example sentence for/);
    fireEvent.click(screen.getByRole("button", { name: "下一个" }));
    expect(await screen.findByText("复习完成")).toBeInTheDocument();
  });
});
