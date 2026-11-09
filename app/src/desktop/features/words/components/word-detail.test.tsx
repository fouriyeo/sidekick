import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordDetail, WordUsageStats } from "@/protocol/words";

const tauri = vi.hoisted(() => ({
  wordList: vi.fn(),
  wordGet: vi.fn(),
  wordAdd: vi.fn(),
  wordExplain: vi.fn(),
  wordSetNote: vi.fn(),
  wordSpeak: vi.fn(),
  wordDelete: vi.fn(),
  wordGenerate: vi.fn(),
  wordUsage: vi.fn(),
  wordStatus: vi.fn(),
  wordConsent: vi.fn(),
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { useWordsStore } from "../words-store";
import { WordDetailView } from "./word-detail";

const USAGE: WordUsageStats = {
  today: { calls: 0, promptTokens: 0, completionTokens: 0, costCnyMicros: 0 },
  last30Days: { calls: 0, promptTokens: 0, completionTokens: 0, costCnyMicros: 0 },
  days: [],
  priceNote: "",
};

function makeDetail(overrides: Partial<WordDetail> = {}): WordDetail {
  return {
    id: "resilient",
    word: "resilient",
    status: "ready",
    source: "manual",
    createdAt: Date.now() - 86_400_000,
    updatedAt: Date.now() - 60_000,
    firstDefinition: "有韧性的",
    model: "qwen3.8-flash",
    explanation: {
      word: "resilient",
      phonetic: "/rɪˈzɪliənt/",
      pos: "adj.",
      definitions: [{ zh: "有韧性的", en: "able to recover quickly" }],
      examples: [{ en: "The team stayed resilient.", zh: "团队保持了韧性。" }],
      collocations: ["stay resilient"],
      mistakes: "不要和 resistant 混用。",
      roots: "resil-（跳回）",
    },
    ...overrides,
  };
}

beforeEach(() => {
  useWordsStore.getState().reset();
  vi.resetAllMocks();
  tauri.wordList.mockResolvedValue([]);
  tauri.wordUsage.mockResolvedValue(USAGE);
  tauri.wordExplain.mockResolvedValue(makeDetail());
  tauri.wordDelete.mockResolvedValue(undefined);
  tauri.wordSetNote.mockImplementation(async (word: string, note: string) =>
    makeDetail({ word, note }),
  );
});

afterEach(() => cleanup());

describe("WordDetailView 词条详情", () => {
  it("完整解释逐段显示，并标「AI 生成」", () => {
    useWordsStore.setState({ detail: makeDetail() });
    render(<WordDetailView canRequest />);

    expect(screen.getByRole("heading", { name: "resilient", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("AI 生成")).toBeInTheDocument();
    for (const label of ["音标", "词性", "释义", "例句", "搭配", "常见错误", "词根"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("/rɪˈzɪliənt/")).toBeInTheDocument();
    expect(screen.getByText("able to recover quickly")).toBeInTheDocument();
    expect(screen.getByText("The team stayed resilient.")).toBeInTheDocument();
    expect(screen.getByText("stay resilient")).toBeInTheDocument();
    expect(screen.getByText("resil-（跳回）")).toBeInTheDocument();
  });

  it("缺省字段不占行", () => {
    useWordsStore.setState({
      detail: makeDetail({
        explanation: {
          word: "resilient",
          definitions: [{ zh: "有韧性的" }],
          examples: [],
        },
      }),
    });
    render(<WordDetailView canRequest />);

    expect(screen.getByText("释义")).toBeInTheDocument();
    expect(screen.queryByText("音标")).toBeNull();
    expect(screen.queryByText("词性")).toBeNull();
    expect(screen.queryByText("例句")).toBeNull();
    expect(screen.queryByText("搭配")).toBeNull();
    expect(screen.queryByText("常见错误")).toBeNull();
    expect(screen.queryByText("词根")).toBeNull();
  });

  it("发音按钮调用 wordSpeak，失败给一句提示", async () => {
    useWordsStore.setState({ detail: makeDetail() });
    tauri.wordSpeak.mockRejectedValue(new Error("say_failed"));
    render(<WordDetailView canRequest />);

    fireEvent.click(screen.getByRole("button", { name: "发音" }));

    await waitFor(() => expect(tauri.wordSpeak).toHaveBeenCalledWith("resilient"));
    expect(await screen.findByRole("alert")).toHaveTextContent("发音失败，稍后重试");
  });

  it("编辑备注保存成功后更新详情与列表行", async () => {
    useWordsStore.setState({
      detail: makeDetail({ note: undefined }),
      items: [makeDetail()],
    });
    render(<WordDetailView canRequest />);

    expect(screen.getByText("还没有备注。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("备注内容"), {
      target: { value: "  在故障演练里见过  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(tauri.wordSetNote).toHaveBeenCalledWith("resilient", "在故障演练里见过"),
    );
    expect(await screen.findByText("在故障演练里见过")).toBeInTheDocument();
    expect(screen.queryByLabelText("备注内容")).toBeNull();
    expect(useWordsStore.getState().detail?.note).toBe("在故障演练里见过");
    expect(useWordsStore.getState().items[0]?.note).toBe("在故障演练里见过");
  });

  it("保存备注失败时保留编辑态与草稿", async () => {
    tauri.wordSetNote.mockRejectedValue(new Error("timeout"));
    useWordsStore.setState({ detail: makeDetail(), items: [makeDetail()] });
    render(<WordDetailView canRequest />);

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("备注内容"), {
      target: { value: "还没保存的草稿" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请求超时");
    expect(screen.getByLabelText("备注内容")).toHaveValue("还没保存的草稿");
    expect(useWordsStore.getState().detail?.note).toBeUndefined();
  });

  it("换词时退出编辑并清空草稿", async () => {
    useWordsStore.setState({ detail: makeDetail(), items: [makeDetail()] });
    render(<WordDetailView canRequest />);

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("备注内容"), { target: { value: "临时草稿" } });

    act(() => {
      useWordsStore.setState({
        detail: makeDetail({ id: "throughput", word: "throughput", firstDefinition: "吞吐量" }),
      });
    });

    await waitFor(() => expect(screen.queryByLabelText("备注内容")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.getByLabelText("备注内容")).toHaveValue("");
  });

  it("失败词条可以重试解释", async () => {
    useWordsStore.setState({
      detail: makeDetail({ status: "failed", explanation: undefined, lastError: "model_error" }),
    });
    render(<WordDetailView canRequest />);

    expect(screen.getAllByText(/解释失败/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "重试解释" }));

    await waitFor(() => expect(tauri.wordExplain).toHaveBeenCalledWith("resilient", undefined));
    await waitFor(() => expect(screen.getByText("AI 生成")).toBeInTheDocument());
    expect(useWordsStore.getState().detail?.status).toBe("ready");
  });

  it("删除需要二次确认", async () => {
    useWordsStore.setState({ detail: makeDetail() });
    render(<WordDetailView canRequest />);

    fireEvent.click(screen.getByRole("button", { name: /删除词条/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/删除「resilient」？/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "删除词条" }));

    await waitFor(() => expect(tauri.wordDelete).toHaveBeenCalledWith("resilient"));
    expect(useWordsStore.getState().detail).toBeNull();
  });

  it("未同意 / 无 Key 时不显示重试按钮", () => {
    useWordsStore.setState({ detail: makeDetail({ status: "failed" }) });
    render(<WordDetailView canRequest={false} />);

    expect(screen.getByRole("button", { name: "重试解释" })).toBeDisabled();
    expect(screen.getByText("先完成同意 / 配置 Key。")).toBeInTheDocument();
  });
});
