import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBackHandlers, handleBack } from "@/mobile/system-back";
import type { WordDetail as WordDetailData } from "@/protocol/words";

const api = vi.hoisted(() => ({
  wordList: vi.fn(),
  wordGet: vi.fn(),
  wordAdd: vi.fn(),
  wordExplain: vi.fn(),
  wordDelete: vi.fn(),
  wordSetNote: vi.fn(),
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

import { WordDetail } from "./word-detail";
import { useWordsStore } from "./words-store";

function detail(overrides: Partial<WordDetailData> = {}): WordDetailData {
  return {
    id: "throughput",
    word: "throughput",
    status: "ready",
    source: "mobile",
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now(),
    phonetic: "/ˈθruːpʊt/",
    pos: "n.",
    firstDefinition: "吞吐量；处理量",
    context: "We measured throughput every day.",
    note: "在性能报告里看到的",
    model: "qwen3.8-flash",
    explanation: {
      word: "throughput",
      phonetic: "/ˈθruːpʊt/",
      pos: "n.",
      definitions: [
        { zh: "吞吐量；处理量", en: "the amount processed in a time" },
        { zh: "生产能力" },
      ],
      examples: [{ en: "We improved throughput.", zh: "我们提高了吞吐量。" }],
      collocations: ["high throughput"],
      mistakes: "不要和 latency 混用。",
      roots: "through + put",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearBackHandlers();
  useWordsStore.getState().reset();
  api.wordGet.mockResolvedValue(detail());
  api.wordExplain.mockResolvedValue(detail());
  api.wordDelete.mockResolvedValue(undefined);
  api.wordSetNote.mockResolvedValue(detail({ note: "在性能报告里看到的" }));
});

afterEach(() => {
  cleanup();
  clearBackHandlers();
});

describe("单词详情", () => {
  it("渲染完整解释：释义/例句/搭配/常见错误/词根，标 AI 生成", async () => {
    render(<WordDetail word="throughput" onBack={() => undefined} />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "throughput" }),
    ).toBeInTheDocument();
    expect(screen.getByText("AI 生成")).toBeInTheDocument();
    expect(screen.getByText("/ˈθruːpʊt/ · n.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "释义" })).toBeInTheDocument();
    expect(screen.getByText("the amount processed in a time")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "例句" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "搭配" })).toBeInTheDocument();
    expect(screen.getByText("high throughput")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "常见错误" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "词根" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "语境" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "备注" })).toBeInTheDocument();
  });

  it("模型没给的字段不显示空区块", async () => {
    api.wordGet.mockResolvedValue(
      detail({
        context: undefined,
        note: undefined,
        explanation: {
          word: "throughput",
          definitions: [{ zh: "吞吐量" }],
          examples: [],
        },
      }),
    );
    render(<WordDetail word="throughput" onBack={() => undefined} />);

    await screen.findByRole("region", { name: "释义" });
    expect(screen.queryByRole("region", { name: "搭配" })).toBeNull();
    expect(screen.queryByRole("region", { name: "常见错误" })).toBeNull();
    expect(screen.queryByRole("region", { name: "词根" })).toBeNull();
    expect(screen.queryByRole("region", { name: "例句" })).toBeNull();
    // 备注区始终在：空备注也保留「编辑」入口。
    expect(screen.getByRole("region", { name: "备注" })).toBeInTheDocument();
    expect(screen.getByText("还没有备注。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑备注" })).toBeInTheDocument();
  });

  it("备注可编辑：保存走 word_set_note，成功后展示新备注", async () => {
    render(<WordDetail word="throughput" onBack={() => undefined} />);

    fireEvent.click(await screen.findByRole("button", { name: "编辑备注" }));
    const input = screen.getByLabelText("备注内容");
    fireEvent.change(input, { target: { value: "在性能报告里看到的" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(api.wordSetNote).toHaveBeenCalledWith("throughput", "在性能报告里看到的"),
    );
    await waitFor(() => expect(useWordsStore.getState().detail?.note).toBe("在性能报告里看到的"));
    expect(screen.queryByLabelText("备注内容")).toBeNull();
    expect(screen.getByText("在性能报告里看到的")).toBeInTheDocument();
  });

  it("备注保存失败：按错误码提示并保留编辑内容", async () => {
    api.wordSetNote.mockRejectedValue(new Error("timeout"));
    render(<WordDetail word="throughput" onBack={() => undefined} />);

    fireEvent.click(await screen.findByRole("button", { name: "编辑备注" }));
    fireEvent.change(screen.getByLabelText("备注内容"), { target: { value: "临时备注" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText(/等太久没有回应/)).toBeInTheDocument();
    expect(screen.getByLabelText("备注内容")).toHaveValue("临时备注");
    expect(api.wordSetNote).toHaveBeenCalledTimes(1);
  });

  it("没有 Web Speech API 时不显示发音按钮", async () => {
    render(<WordDetail word="throughput" onBack={() => undefined} />);

    await screen.findByRole("heading", { level: 1, name: "throughput" });
    expect(screen.queryByRole("button", { name: /朗读/ })).toBeNull();
  });

  it("有系统朗读时显示发音按钮，按 en-US 朗读当前单词", async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    class FakeUtterance {
      text: string;
      lang = "";
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak, cancel },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: FakeUtterance,
    });

    try {
      render(<WordDetail word="throughput" onBack={() => undefined} />);

      fireEvent.click(await screen.findByRole("button", { name: "朗读 throughput" }));

      expect(cancel).toHaveBeenCalled();
      expect(speak).toHaveBeenCalledTimes(1);
      const utterance = speak.mock.calls[0]?.[0] as { text: string; lang: string };
      expect(utterance.text).toBe("throughput");
      expect(utterance.lang).toBe("en-US");
    } finally {
      Reflect.deleteProperty(window, "speechSynthesis");
      Reflect.deleteProperty(window, "SpeechSynthesisUtterance");
    }
  });

  it("返回键回列表", async () => {
    const onBack = vi.fn();
    render(<WordDetail word="throughput" onBack={onBack} />);

    await screen.findByRole("heading", { level: 1, name: "throughput" });
    act(() => {
      expect(handleBack()).toBe(true);
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
