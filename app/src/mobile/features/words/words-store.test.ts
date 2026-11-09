import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WordDetail,
  WordGenerateResult,
  WordStatusInfo,
  WordSummary,
  WordUsageStats,
} from "@/protocol/words";

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

import { useWordsStore, wordErrorText } from "./words-store";

function summary(overrides: Partial<WordSummary> = {}): WordSummary {
  return {
    id: "resilience",
    word: "resilience",
    status: "ready",
    source: "mobile",
    createdAt: 1000,
    updatedAt: 2000,
    firstDefinition: "韧性；恢复力",
    ...overrides,
  };
}

function detail(overrides: Partial<WordDetail> = {}): WordDetail {
  return {
    ...summary(),
    explanation: {
      word: "resilience",
      phonetic: "/rɪˈzɪliəns/",
      pos: "n.",
      definitions: [{ zh: "韧性；恢复力", en: "the ability to recover" }],
      examples: [{ en: "Her resilience inspired us.", zh: "她的韧性鼓舞了我们。" }],
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

function usage(): WordUsageStats {
  return {
    today: { calls: 2, promptTokens: 300, completionTokens: 200, costCnyMicros: 1200 },
    last30Days: { calls: 9, promptTokens: 1000, completionTokens: 900, costCnyMicros: 5800 },
    days: [
      {
        date: "2026-11-09",
        calls: 2,
        promptTokens: 300,
        completionTokens: 200,
        costCnyMicros: 1200,
      },
    ],
    priceNote: "qwen3.8-flash · 估算",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useWordsStore.getState().reset();
  api.wordSyncNow.mockResolvedValue(undefined);
  api.wordDelete.mockResolvedValue(undefined);
});

describe("英语角 store", () => {
  it("加载就绪状态与词库列表", async () => {
    api.wordStatus.mockResolvedValue(status());
    api.wordList.mockResolvedValue([summary(), summary({ id: "throughput", word: "throughput" })]);

    await useWordsStore.getState().loadStatus();
    await useWordsStore.getState().load();

    expect(useWordsStore.getState().status?.agreed).toBe(true);
    expect(useWordsStore.getState().statusError).toBeNull();
    expect(useWordsStore.getState().items.map((item) => item.word)).toEqual([
      "resilience",
      "throughput",
    ]);
  });

  it("列表加载失败保留中文错误", async () => {
    api.wordList.mockRejectedValue(new Error("not_paired"));
    await useWordsStore.getState().load();
    expect(useWordsStore.getState().error).toContain("配对");
    expect(useWordsStore.getState().loading).toBe(false);
  });

  it("新增：word_add 回包立即进列表，状态为 pending", async () => {
    api.wordAdd.mockResolvedValue(detail({ status: "pending", explanation: undefined }));
    const created = await useWordsStore.getState().add({
      word: "resilience",
      context: "after the outage",
    });

    expect(api.wordAdd).toHaveBeenCalledWith({
      word: "resilience",
      context: "after the outage",
      source: "mobile",
    });
    expect(created.status).toBe("pending");
    expect(useWordsStore.getState().items[0]?.word).toBe("resilience");
    expect(useWordsStore.getState().items[0]?.status).toBe("pending");
  });

  it("解释失败：详情与列表都标 failed，重试成功转 ready", async () => {
    useWordsStore.setState({
      items: [summary({ status: "pending", firstDefinition: undefined })],
      detail: detail({ status: "pending" }),
      detailWord: "resilience",
    });
    api.wordExplain.mockRejectedValueOnce(new Error("model_error"));

    const failed = await useWordsStore.getState().explain("resilience");
    expect(failed).toBeNull();
    expect(useWordsStore.getState().explaining).toBe(false);
    expect(useWordsStore.getState().detail?.status).toBe("failed");
    expect(useWordsStore.getState().detail?.lastError).toContain("模型");
    expect(useWordsStore.getState().detailError).toContain("模型");
    expect(useWordsStore.getState().items[0]?.status).toBe("failed");

    api.wordExplain.mockResolvedValueOnce(detail());
    const ready = await useWordsStore.getState().explain("resilience", "after the outage");

    expect(api.wordExplain).toHaveBeenLastCalledWith("resilience", "after the outage");
    expect(ready?.status).toBe("ready");
    expect(useWordsStore.getState().detail?.explanation?.definitions).toHaveLength(1);
    expect(useWordsStore.getState().items[0]?.status).toBe("ready");
    expect(useWordsStore.getState().detailError).toBeNull();
  });

  it("删除：从列表移除并清空当前详情", async () => {
    useWordsStore.setState({
      items: [summary(), summary({ id: "throughput", word: "throughput" })],
      detail: detail(),
      detailWord: "resilience",
    });

    await useWordsStore.getState().remove("resilience");

    expect(api.wordDelete).toHaveBeenCalledWith("resilience");
    expect(useWordsStore.getState().items.map((item) => item.id)).toEqual(["throughput"]);
    expect(useWordsStore.getState().detail).toBeNull();
    expect(useWordsStore.getState().detailWord).toBeNull();
  });

  it("保存备注：回包更新详情与列表行", async () => {
    useWordsStore.setState({
      items: [summary()],
      detail: detail(),
      detailWord: "resilience",
    });
    api.wordSetNote.mockResolvedValue(detail({ note: "在性能报告里看到的" }));

    await useWordsStore.getState().saveNote("resilience", "  在性能报告里看到的  ");

    expect(api.wordSetNote).toHaveBeenCalledWith("resilience", "在性能报告里看到的");
    expect(useWordsStore.getState().detail?.note).toBe("在性能报告里看到的");
    expect(useWordsStore.getState().items[0]?.note).toBe("在性能报告里看到的");
  });

  it("造句：不足 5 个词不发请求；5–10 个词才调用并保存结果", async () => {
    await useWordsStore.getState().generateSentences(["a", "b"]);
    expect(api.wordGenerate).not.toHaveBeenCalled();
    expect(useWordsStore.getState().generateError).toContain("5–10");

    const result: WordGenerateResult = {
      model: "qwen3.8-flash",
      sentences: [{ en: "We stayed resilient.", zh: "我们保持韧性。", words: ["resilient"] }],
    };
    api.wordGenerate.mockResolvedValue(result);

    const generated = await useWordsStore
      .getState()
      .generateSentences(["one", "two", "three", "four", "five"]);

    expect(api.wordGenerate).toHaveBeenCalledWith(["one", "two", "three", "four", "five"]);
    expect(generated).toEqual(result);
    expect(useWordsStore.getState().generated?.sentences).toHaveLength(1);
  });

  it("造句失败映射错误码并清空旧结果", async () => {
    api.wordGenerate.mockRejectedValue(new Error("rate_limited"));
    await useWordsStore.getState().generateSentences(["one", "two", "three", "four", "five"]);

    expect(useWordsStore.getState().generating).toBe(false);
    expect(useWordsStore.getState().generated).toBeNull();
    expect(useWordsStore.getState().generateError).toContain("太频繁");
  });

  it("用量回包写入 today / last30Days", async () => {
    api.wordUsage.mockResolvedValue(usage());
    await useWordsStore.getState().loadUsage();

    expect(useWordsStore.getState().usage?.today.calls).toBe(2);
    expect(useWordsStore.getState().usage?.last30Days.costCnyMicros).toBe(5800);
    expect(useWordsStore.getState().usageError).toBeNull();
  });

  it("同意后状态变为 agreed", async () => {
    api.wordConsent.mockResolvedValue(status({ agreed: true }));
    const next = await useWordsStore.getState().agree();

    expect(api.wordConsent).toHaveBeenCalledWith(true);
    expect(next?.agreed).toBe(true);
    expect(useWordsStore.getState().status?.agreed).toBe(true);
  });

  it("未连接时 syncNow 静默失败，不写页面错误", async () => {
    api.wordSyncNow.mockRejectedValue(new Error("sync_failed"));
    await expect(useWordsStore.getState().syncNow()).resolves.toBeUndefined();
    expect(useWordsStore.getState().error).toBeNull();
  });
});

describe("wordErrorText 错误码映射", () => {
  it("覆盖契约里的错误码", () => {
    expect(wordErrorText("need_consent")).toContain("隐私");
    expect(wordErrorText("no_key")).toContain("百炼 Key");
    expect(wordErrorText("not_paired")).toContain("配对");
    expect(wordErrorText("model_error")).toContain("模型");
    expect(wordErrorText("rate_limited")).toContain("频繁");
    expect(wordErrorText("timeout")).toContain("等太久");
    expect(wordErrorText("bad_json")).toContain("读不懂");
    expect(wordErrorText("invalid_word")).toContain("英文单词");
  });

  it("兼容带命令前缀的错误串，未知错误保留原文", () => {
    expect(wordErrorText("word_explain: timeout")).toContain("等太久");
    expect(wordErrorText("词条不存在")).toBe("词条不存在");
    expect(wordErrorText("")).toContain("出错了");
  });
});
