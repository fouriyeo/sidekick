import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { clearBackHandlers, handleBack } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";
import type { WordDetail, WordStatusInfo, WordSummary } from "@/protocol/words";

const api = vi.hoisted(() => ({
  wordList: vi.fn(),
  wordGet: vi.fn(),
  wordAdd: vi.fn(),
  wordExplain: vi.fn(),
  wordDelete: vi.fn(),
  wordExportMarkdown: vi.fn(),
  wordGenerate: vi.fn(),
  wordUsage: vi.fn(),
  wordStatus: vi.fn(),
  wordConsent: vi.fn(),
  wordSyncNow: vi.fn(),
  subscribeWordChanged: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => ({
  ...api,
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

import { WordsPage } from "./words-page";
import { useWordsStore } from "./words-store";

function summary(overrides: Partial<WordSummary> = {}): WordSummary {
  return {
    id: "throughput",
    word: "throughput",
    status: "ready",
    source: "manual",
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now() - 60_000,
    firstDefinition: "吞吐量；处理量",
    ...overrides,
  };
}

function detail(overrides: Partial<WordDetail> = {}): WordDetail {
  return {
    ...summary(),
    explanation: {
      word: "throughput",
      definitions: [{ zh: "吞吐量；处理量" }],
      examples: [{ en: "We improved throughput.", zh: "我们提高了吞吐量。" }],
    },
    model: "qwen3.8-flash",
    ...overrides,
  };
}

function status(overrides: Partial<WordStatusInfo> = {}): WordStatusInfo {
  return {
    hasKey: true,
    agreed: true,
    paired: true,
    model: "qwen3.8-flash",
    total: 1,
    ...overrides,
  };
}

function running(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderPage() {
  const view = render(<WordsPage />);
  await act(running);
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearBackHandlers();
  useWordsStore.getState().reset();
  useUiStore.setState({ view: "words", scanOpen: false, offlineReturnView: "pet" });
  useConnectionStore.setState({ status: "disconnected" });

  api.subscribeWordChanged.mockImplementation(() => () => {});
  api.wordStatus.mockResolvedValue(status());
  api.wordList.mockResolvedValue([
    summary(),
    summary({ id: "resilience", word: "resilience", status: "pending" }),
  ]);
  api.wordGet.mockResolvedValue(detail());
  api.wordAdd.mockResolvedValue(detail({ status: "pending", explanation: undefined }));
  api.wordExplain.mockResolvedValue(detail());
  api.wordDelete.mockResolvedValue(undefined);
  api.wordExportMarkdown.mockResolvedValue("# 生词本\n\n- throughput：吞吐量\n");
  api.wordGenerate.mockResolvedValue({ model: "qwen3.8-flash", sentences: [] });
  api.wordUsage.mockResolvedValue({
    today: { calls: 0, promptTokens: 0, completionTokens: 0, costCnyMicros: 0 },
    last30Days: { calls: 0, promptTokens: 0, completionTokens: 0, costCnyMicros: 0 },
    days: [],
    priceNote: "估算",
  });
  api.wordConsent.mockResolvedValue(status({ agreed: true }));
  api.wordSyncNow.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  clearBackHandlers();
});

describe("英语角列表页", () => {
  it("显示状态点与首条释义，可搜索过滤", async () => {
    await renderPage();

    expect((await screen.findAllByText("throughput")).length).toBeGreaterThan(0);
    // 有 ready 词时列表上方出现「今天复习」。
    expect(screen.getByRole("region", { name: "今天复习" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "状态：已解释" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "状态：待解释" })).toBeInTheDocument();
    expect(screen.getByText("吞吐量；处理量")).toBeInTheDocument();
    expect(screen.getByText("等待 AI 解释")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("搜索单词"), { target: { value: "through" } });
    expect(screen.queryByText("resilience")).toBeNull();
    expect(screen.getAllByText("throughput").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("搜索单词"), { target: { value: "none" } });
    expect(screen.getByText("没有匹配的词")).toBeInTheDocument();
  });

  it("空词库显示空态与新增引导", async () => {
    api.wordList.mockResolvedValue([]);
    await renderPage();

    expect(await screen.findByText("还没有生词")).toBeInTheDocument();
    expect(screen.getByText(/点右上角 ＋/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增单词" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出词库 Markdown" })).toBeDisabled();
  });

  it("未同意：先展示隐私说明，同意后拉列表", async () => {
    api.wordStatus.mockResolvedValue(status({ agreed: false }));
    await renderPage();

    expect(await screen.findByText("先把这件事说清楚")).toBeInTheDocument();
    expect(screen.queryByLabelText("搜索单词")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "同意并开始使用" }));
    await waitFor(() => expect(api.wordConsent).toHaveBeenCalledWith(true));
    expect((await screen.findAllByText("throughput")).length).toBeGreaterThan(0);
  });

  it("无 Key / 未配对：提示去设置，仍能看本地词库", async () => {
    api.wordStatus.mockResolvedValue(status({ hasKey: false, paired: false }));
    await renderPage();

    expect(await screen.findByText(/还没有百炼 Key/)).toBeInTheDocument();
    expect(screen.getByText(/连上电脑后自动同步/)).toBeInTheDocument();
    expect(screen.getAllByText("throughput").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "去设置" }));
    expect(useUiStore.getState().view).toBe("settings");
  });

  it("点条目进详情，返回键先回列表，再交还给 App", async () => {
    await renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /throughput，已解释/ }));
    expect(await screen.findByText("AI 生成")).toBeInTheDocument();
    expect(api.wordGet).toHaveBeenCalledWith("throughput");

    act(() => {
      expect(handleBack()).toBe(true);
    });
    expect(await screen.findByRole("heading", { level: 1, name: "英语角" })).toBeInTheDocument();

    expect(handleBack()).toBe(false);
  });

  it("新增：保存后进详情并自动解释", async () => {
    api.wordAdd.mockResolvedValue(
      detail({
        id: "resilience",
        word: "resilience",
        status: "pending",
        explanation: undefined,
      }),
    );
    api.wordExplain.mockResolvedValue(
      detail({ id: "resilience", word: "resilience", status: "ready" }),
    );
    api.wordGet.mockImplementation(async (word: string) =>
      word === "resilience"
        ? detail({
            id: "resilience",
            word: "resilience",
            status: "pending",
            explanation: undefined,
            context: "The team stayed resilient after the outage.",
          })
        : detail(),
    );
    await renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "新增单词" }));
    expect(screen.getByRole("heading", { level: 1, name: "新增单词" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("单词"), { target: { value: "resilience" } });
    fireEvent.change(screen.getByLabelText("语境句"), {
      target: { value: "The team stayed resilient after the outage." },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存并解释" }));

    await waitFor(() =>
      expect(api.wordAdd).toHaveBeenCalledWith({
        word: "resilience",
        context: "The team stayed resilient after the outage.",
        source: "mobile",
      }),
    );
    await waitFor(() =>
      expect(api.wordExplain).toHaveBeenCalledWith(
        "resilience",
        "The team stayed resilient after the outage.",
      ),
    );
    expect(await screen.findByText("AI 生成")).toBeInTheDocument();
  });

  it("详情删除要二次确认，删除后回到列表", async () => {
    api.wordList.mockResolvedValueOnce([summary()]).mockResolvedValue([]);
    await renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /throughput，已解释/ }));
    await screen.findByText("AI 生成");

    fireEvent.click(screen.getByRole("button", { name: /删除这个词/ }));
    expect(screen.getByText("再点一次删除这个词")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /再点一次删除这个词/ }));
    await waitFor(() => expect(api.wordDelete).toHaveBeenCalledWith("throughput"));
    expect(await screen.findByText("还没有生词")).toBeInTheDocument();
  });

  it("解释失败：详情显示错误与重试，重试成功转已解释", async () => {
    api.wordList.mockResolvedValue([summary({ status: "failed", firstDefinition: undefined })]);
    api.wordGet.mockResolvedValue(
      detail({
        status: "failed",
        firstDefinition: undefined,
        explanation: undefined,
        lastError: "model_error",
      }),
    );
    await renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /throughput，解释失败/ }));
    expect(await screen.findByText("重试解释")).toBeInTheDocument();
    expect(screen.getByText(/模型暂时没返回结果/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /重试解释/ }));
    await waitFor(() => expect(api.wordExplain).toHaveBeenCalledWith("throughput", undefined));
    expect(await screen.findByText("AI 生成")).toBeInTheDocument();
  });

  it("造句子页与用量子页都能逐级返回", async () => {
    useWordsStore.setState({
      items: [
        summary({ id: "a", word: "alpha" }),
        summary({ id: "b", word: "bravo" }),
        summary({ id: "c", word: "charlie" }),
        summary({ id: "d", word: "delta" }),
        summary({ id: "e", word: "echo" }),
        summary({ id: "f", word: "foxtrot" }),
      ],
    });
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "用已解释的词造句" }));
    expect(screen.getByRole("heading", { level: 1, name: "造句" })).toBeInTheDocument();
    act(() => {
      expect(handleBack()).toBe(true);
    });
    expect(screen.getByRole("heading", { level: 1, name: "英语角" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看英语角用量" }));
    expect(screen.getByRole("heading", { level: 1, name: "用量" })).toBeInTheDocument();
    act(() => {
      expect(handleBack()).toBe(true);
    });
    expect(screen.getByRole("heading", { level: 1, name: "英语角" })).toBeInTheDocument();
  });

  it("只有待解释的词时隐藏今天复习卡", async () => {
    api.wordList.mockResolvedValue([summary({ status: "pending", firstDefinition: undefined })]);
    await renderPage();

    expect(await screen.findByText("等待 AI 解释")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "今天复习" })).toBeNull();
  });

  it("导出入口打开只读 Markdown 页，返回键回列表", async () => {
    await renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "导出词库 Markdown" }));
    await waitFor(() => expect(api.wordExportMarkdown).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("region", { name: "导出的 Markdown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制 Markdown" })).toBeInTheDocument();

    act(() => {
      expect(handleBack()).toBe(true);
    });
    expect(screen.getByRole("heading", { level: 1, name: "英语角" })).toBeInTheDocument();
  });
});
