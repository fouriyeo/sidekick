import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WordDetail,
  WordGenerateResult,
  WordStatusInfo,
  WordSummary,
  WordUsageStats,
} from "@/protocol/words";

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

import {
  filterWordItems,
  MIN_GENERATE_WORDS,
  useWordsStore,
  validateWordInput,
  wordErrorText,
} from "./words-store";

function makeSummary(overrides: Partial<WordSummary> = {}): WordSummary {
  return {
    id: "resilient",
    word: "resilient",
    status: "ready",
    source: "manual",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
    phonetic: "/rɪˈzɪliənt/",
    pos: "adj.",
    firstDefinition: "有韧性的",
    ...overrides,
  };
}

function makeDetail(overrides: Partial<WordDetail> = {}): WordDetail {
  return {
    ...makeSummary(),
    explanation: {
      word: "resilient",
      phonetic: "/rɪˈzɪliənt/",
      pos: "adj.",
      definitions: [{ zh: "有韧性的", en: "able to recover quickly" }],
      examples: [{ en: "The team stayed resilient.", zh: "团队保持了韧性。" }],
    },
    model: "qwen3.8-flash",
    ...overrides,
  };
}

function makeUsage(overrides: Partial<WordUsageStats> = {}): WordUsageStats {
  return {
    today: { calls: 4, promptTokens: 700, completionTokens: 800, costCnyMicros: 2_746 },
    last30Days: {
      calls: 26,
      promptTokens: 4_394,
      completionTokens: 5_120,
      costCnyMicros: 17_344,
    },
    days: [],
    priceNote: "按百炼价格估算，实际以账单为准。",
    ...overrides,
  };
}

function makeStatus(overrides: Partial<WordStatusInfo> = {}): WordStatusInfo {
  return { hasKey: true, agreed: true, model: "qwen3.8-flash", total: 1, ...overrides };
}

function makeResult(): WordGenerateResult {
  return {
    model: "qwen3.8-flash",
    sentences: [{ en: "Sentence one.", zh: "第一句。", words: ["resilient"] }],
  };
}

beforeEach(() => {
  useWordsStore.getState().reset();
  vi.resetAllMocks();
  tauri.wordStatus.mockResolvedValue(makeStatus());
  tauri.wordList.mockResolvedValue([makeSummary()]);
  tauri.wordUsage.mockResolvedValue(makeUsage());
  tauri.wordGet.mockResolvedValue(makeDetail());
  tauri.wordAdd.mockResolvedValue(makeDetail({ status: "pending", explanation: undefined }));
  tauri.wordExplain.mockResolvedValue(makeDetail());
  tauri.wordDelete.mockResolvedValue(undefined);
  tauri.wordSetNote.mockImplementation(async (word: string, note: string) =>
    makeDetail({ word, note }),
  );
  tauri.wordGenerate.mockResolvedValue(makeResult());
  tauri.wordConsent.mockResolvedValue(makeStatus());
});

describe("wordErrorText", () => {
  it("已知错误码映射成中文", () => {
    expect(wordErrorText("need_consent")).toContain("同意");
    expect(wordErrorText("no_key")).toContain("API Key");
    expect(wordErrorText("model_error")).toContain("模型");
    expect(wordErrorText("rate_limited")).toContain("频繁");
    expect(wordErrorText("timeout")).toContain("超时");
    expect(wordErrorText("bad_json")).toContain("解析");
    expect(wordErrorText("invalid_word")).toContain("英文单词");
  });

  it("错误码带细节时也能识别，未知错误保留原文", () => {
    expect(wordErrorText(new Error("model_error: HTTP 500"))).toContain("模型");
    expect(wordErrorText(new Error("自定义失败"))).toBe("自定义失败");
    expect(wordErrorText("")).toBe("操作失败，请重试。");
  });
});

describe("validateWordInput", () => {
  it("空 / 超长 / 非英文给出内联提示", () => {
    expect(validateWordInput("   ").error).toBe("请输入一个英文单词");
    expect(validateWordInput("a".repeat(65)).error).toContain("单词太长");
    expect(validateWordInput("韧性").error).toContain("只支持英文单词");
    expect(validateWordInput("hello123").error).toContain("只支持英文单词");
  });

  it("英文单词 / 短语通过，并折叠多余空白", () => {
    expect(validateWordInput("  resilient ")).toEqual({ word: "resilient", error: null });
    expect(validateWordInput("take   off")).toEqual({ word: "take off", error: null });
    expect(validateWordInput("well-known")).toEqual({ word: "well-known", error: null });
    expect(validateWordInput("don't")).toEqual({ word: "don't", error: null });
  });
});

describe("filterWordItems", () => {
  it("按单词或首条释义过滤", () => {
    const items = [
      makeSummary(),
      makeSummary({ id: "throughput", word: "throughput", firstDefinition: "吞吐量" }),
    ];
    expect(filterWordItems(items, "")).toHaveLength(2);
    expect(filterWordItems(items, "RESIL")).toEqual([items[0]]);
    expect(filterWordItems(items, "吞吐")).toEqual([items[1]]);
    expect(filterWordItems(items, "不存在")).toEqual([]);
  });
});

describe("英语角 store", () => {
  it("加载状态 / 词库 / 用量", async () => {
    await useWordsStore.getState().load();

    const state = useWordsStore.getState();
    expect(state.status?.model).toBe("qwen3.8-flash");
    expect(state.items).toHaveLength(1);
    expect(state.usage?.today.calls).toBe(4);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("词库读取失败时状态与用量仍可用，错误码转中文", async () => {
    tauri.wordList.mockRejectedValue(new Error("timeout"));

    await useWordsStore.getState().load();

    const state = useWordsStore.getState();
    expect(state.status).not.toBeNull();
    expect(state.items).toEqual([]);
    expect(state.error).toContain("请求超时");
    expect(state.usage?.today.calls).toBe(4);
  });

  it("新增：先入库再解释，成功后刷新列表与用量", async () => {
    const added = await useWordsStore.getState().add("resilient", "Stay resilient.");

    expect(added).toBe(true);
    expect(tauri.wordAdd).toHaveBeenCalledWith({
      word: "resilient",
      context: "Stay resilient.",
      source: "manual",
    });
    expect(tauri.wordExplain).toHaveBeenCalledWith("resilient", "Stay resilient.");
    // load 之外又刷新了一次列表与用量。
    expect(tauri.wordList).toHaveBeenCalledTimes(1);
    expect(tauri.wordUsage).toHaveBeenCalledTimes(1);
    expect(useWordsStore.getState().addError).toBeNull();
  });

  it("新增校验失败不调用命令", async () => {
    const added = await useWordsStore.getState().add("中文");

    expect(added).toBe(false);
    expect(tauri.wordAdd).not.toHaveBeenCalled();
    expect(useWordsStore.getState().addError).toContain("只支持英文单词");
  });

  it("解释失败：词条仍算新增成功，并提示可重试", async () => {
    tauri.wordExplain.mockRejectedValue(new Error("model_error"));

    const added = await useWordsStore.getState().add("resilient");

    expect(added).toBe(true);
    expect(useWordsStore.getState().addError).toContain("已加入词库");
    expect(useWordsStore.getState().addError).toContain("模型");
    expect(tauri.wordList).toHaveBeenCalled();
  });

  it("失败重试成功后更新详情并刷新", async () => {
    useWordsStore.setState({
      detail: makeDetail({ status: "failed", explanation: undefined, lastError: "model_error" }),
    });

    await useWordsStore.getState().retry("resilient");

    const state = useWordsStore.getState();
    expect(tauri.wordExplain).toHaveBeenCalledWith("resilient", undefined);
    expect(state.detail?.status).toBe("ready");
    expect(state.retrying).toBe(false);
    expect(state.detailError).toBeNull();
    expect(tauri.wordList).toHaveBeenCalled();
  });

  it("重试失败保留详情并写错误", async () => {
    useWordsStore.setState({ detail: makeDetail({ status: "failed" }) });
    tauri.wordExplain.mockRejectedValue(new Error("bad_json"));

    await useWordsStore.getState().retry("resilient");

    const state = useWordsStore.getState();
    expect(state.detail?.status).toBe("failed");
    expect(state.detailError).toContain("解析");
  });

  it("保存备注更新详情与列表行", async () => {
    useWordsStore.setState({ detail: makeDetail({ note: undefined }), items: [makeSummary()] });

    const saved = await useWordsStore.getState().saveNote("resilient", "  记忆点  ");

    expect(tauri.wordSetNote).toHaveBeenCalledWith("resilient", "记忆点");
    expect(saved.note).toBe("记忆点");
    expect(useWordsStore.getState().detail?.note).toBe("记忆点");
    expect(useWordsStore.getState().items[0]?.note).toBe("记忆点");
  });

  it("删除后清空详情并刷新列表", async () => {
    useWordsStore.setState({ detail: makeDetail() });

    const removed = await useWordsStore.getState().remove("resilient");

    expect(removed).toBe(true);
    expect(tauri.wordDelete).toHaveBeenCalledWith("resilient");
    expect(useWordsStore.getState().detail).toBeNull();
    expect(tauri.wordList).toHaveBeenCalled();
  });

  it("造句：少于 5 个词不调用命令", async () => {
    const words = ["a", "b", "c", "d"];
    const ok = await useWordsStore.getState().generate(words);

    expect(ok).toBe(false);
    expect(words).toHaveLength(4);
    expect(MIN_GENERATE_WORDS).toBe(5);
    expect(tauri.wordGenerate).not.toHaveBeenCalled();
    expect(useWordsStore.getState().generateError).toContain("5–10");
  });

  it("造句：5 个词成功并保存结果、刷新用量", async () => {
    const ok = await useWordsStore.getState().generate(["a", "b", "c", "d", "e"]);

    expect(ok).toBe(true);
    expect(tauri.wordGenerate).toHaveBeenCalledWith(["a", "b", "c", "d", "e"]);
    expect(useWordsStore.getState().generateResult?.sentences).toHaveLength(1);
    expect(tauri.wordUsage).toHaveBeenCalled();
  });

  it("造句失败映射限流错误", async () => {
    tauri.wordGenerate.mockRejectedValue(new Error("rate_limited"));

    const ok = await useWordsStore.getState().generate(["a", "b", "c", "d", "e"]);

    expect(ok).toBe(false);
    expect(useWordsStore.getState().generateError).toContain("频繁");
    expect(useWordsStore.getState().generating).toBe(false);
  });

  it("用量读取失败只影响用量区", async () => {
    tauri.wordUsage.mockRejectedValue(new Error("timeout"));

    await useWordsStore.getState().loadUsage();

    expect(useWordsStore.getState().usageError).toContain("超时");
    expect(useWordsStore.getState().usageLoading).toBe(false);
  });

  it("同意后写入状态", async () => {
    useWordsStore.setState({ status: makeStatus({ agreed: false }) });

    await useWordsStore.getState().agree();

    expect(tauri.wordConsent).toHaveBeenCalledWith(true);
    expect(useWordsStore.getState().status?.agreed).toBe(true);
    expect(useWordsStore.getState().consenting).toBe(false);
  });
});
