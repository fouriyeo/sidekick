import { create } from "zustand";
import type {
  WordDetail,
  WordGenerateResult,
  WordStatus,
  WordStatusInfo,
  WordSummary,
  WordUsageStats,
} from "@/protocol/words";
import {
  normalizeError,
  wordAdd,
  wordConsent,
  wordDelete,
  wordExplain,
  wordGenerate,
  wordGet,
  wordList,
  wordSetNote,
  wordStatus,
  wordSyncNow,
  wordUsage,
} from "@/shared/lib/tauri";

/** 列表状态点的中文口径（详情页也用同一套）。 */
export const WORD_STATUS_LABEL: Record<WordStatus, string> = {
  pending: "待解释",
  ready: "已解释",
  failed: "解释失败",
};

/** 错误码 → 中文。后端错误码是稳定契约，这里只做展示层映射。 */
const WORD_ERROR_TEXT: Record<string, string> = {
  need_consent: "需要先同意隐私说明，才能把单词发给百炼解释。",
  no_key: "还没有百炼 Key。请在电脑上配对手机，或去设置里配对。",
  not_paired: "还没和电脑配对。连上电脑后会自动同步词库。",
  model_error: "模型暂时没返回结果，稍后重试一次。",
  rate_limited: "调用太频繁了，等一会儿再试。",
  timeout: "等太久没有回应，检查网络后重试。",
  bad_json: "模型返回的内容读不懂，重试一次试试。",
  invalid_word: "这不像一个英文单词，检查一下再保存。",
  sync_failed: "同步没成功，连上电脑后会自动重试。",
};

/**
 * 把 `normalizeError` 的字符串（错误码或原始消息）转成用户能懂的一句话。
 *
 * 后端按契约直接抛错误码；这里对整串做一次包含匹配，兼容 Rust 可能带上的
 * 「command: code」前缀。未知错误保留原文，不吞信息。
 */
export function wordErrorText(error: unknown): string {
  const raw = normalizeError(error).trim();
  if (!raw) return "出错了，重试一次。";
  for (const [code, text] of Object.entries(WORD_ERROR_TEXT)) {
    if (raw === code || raw.includes(code)) return text;
  }
  return raw;
}

/** 详情 → 列表行；列表不携带完整解释，避免把大 JSON 放进 store。 */
function summaryFromDetail(detail: WordDetail): WordSummary {
  return {
    id: detail.id,
    word: detail.word,
    status: detail.status,
    source: detail.source,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    phonetic: detail.phonetic,
    pos: detail.pos,
    firstDefinition: detail.firstDefinition,
    note: detail.note,
    deletedAt: detail.deletedAt,
  };
}

function patchSummary(items: WordSummary[], detail: WordDetail): WordSummary[] {
  const next = summaryFromDetail(detail);
  const index = items.findIndex((item) => item.id === detail.id);
  if (index < 0) return [next, ...items];
  return items.map((item) => (item.id === detail.id ? next : item));
}

/** 申明此为解释失败时给详情页兜底用的最小详情。 */
function failedDetail(
  error: { word: string; context?: string; previous: WordDetail | null },
  text: string,
): WordDetail {
  if (error.previous) return { ...error.previous, status: "failed", lastError: text };
  const now = Date.now();
  return {
    id: error.word,
    word: error.word,
    status: "failed",
    source: "manual",
    createdAt: now,
    updatedAt: now,
    context: error.context,
    lastError: text,
  };
}

type WordsState = {
  /** 就绪状态：Key / 同意 / 配对 / 模型。 */
  status: WordStatusInfo | null;
  statusLoading: boolean;
  statusError: string | null;

  /** 词库列表（word_list 全量，搜索在前端过滤）。 */
  items: WordSummary[];
  loading: boolean;
  error: string | null;

  /** 当前详情（页内 push 时用）。 */
  detail: WordDetail | null;
  detailWord: string | null;
  detailLoading: boolean;
  detailError: string | null;
  explaining: boolean;

  /** 造句。 */
  generated: WordGenerateResult | null;
  generating: boolean;
  generateError: string | null;

  /** 用量。 */
  usage: WordUsageStats | null;
  usageLoading: boolean;
  usageError: string | null;

  loadStatus: () => Promise<void>;
  agree: () => Promise<WordStatusInfo | null>;
  load: (query?: string) => Promise<void>;
  syncNow: () => Promise<void>;
  loadDetail: (word: string) => Promise<void>;
  clearDetail: () => void;
  add: (input: { word: string; context?: string }) => Promise<WordDetail>;
  explain: (word: string, context?: string) => Promise<WordDetail | null>;
  remove: (word: string) => Promise<void>;
  saveNote: (word: string, note: string) => Promise<WordDetail>;
  generateSentences: (words: string[]) => Promise<WordGenerateResult | null>;
  loadUsage: () => Promise<void>;
  reset: () => void;
};

const EMPTY_DATA = {
  status: null as WordStatusInfo | null,
  statusLoading: false,
  statusError: null as string | null,
  items: [] as WordSummary[],
  loading: false,
  error: null as string | null,
  detail: null as WordDetail | null,
  detailWord: null as string | null,
  detailLoading: false,
  detailError: null as string | null,
  explaining: false,
  generated: null as WordGenerateResult | null,
  generating: false,
  generateError: null as string | null,
  usage: null as WordUsageStats | null,
  usageLoading: false,
  usageError: null as string | null,
};

/**
 * 英语角 store：列表 / 详情 / 造句 / 用量都走这里。
 *
 * 页面只做展示与交互，命令调用、错误码映射、列表回包更新集中在这里，
 * 方便在 vitest 里不渲染 UI 直接验证失败重试与删除。
 */
export const useWordsStore = create<WordsState>((set, get) => ({
  ...EMPTY_DATA,

  loadStatus: async () => {
    set({ statusLoading: true, statusError: null });
    try {
      const status = await wordStatus();
      set({ status, statusLoading: false });
    } catch (error) {
      set({ statusLoading: false, statusError: wordErrorText(error) });
    }
  },

  agree: async () => {
    try {
      const status = await wordConsent(true);
      set({ status, statusError: null });
      return status;
    } catch (error) {
      set({ statusError: wordErrorText(error) });
      return null;
    }
  },

  load: async (query) => {
    set({ loading: true, error: null });
    try {
      const items = await wordList(query);
      set({ items, loading: false });
    } catch (error) {
      set({ loading: false, error: wordErrorText(error) });
    }
  },

  syncNow: async () => {
    // 未连接/未配对是常态：Rust 侧静默返回，失败也不打扰页面。
    try {
      await wordSyncNow();
    } catch {
      // 同步失败由连接横幅与 word.changed 事件兜底。
    }
  },

  loadDetail: async (word) => {
    const previous = get().detail;
    set({
      detailWord: word,
      detailLoading: true,
      detailError: null,
      explaining: false,
      detail: previous?.word === word ? previous : null,
    });
    try {
      const detail = await wordGet(word);
      if (get().detailWord !== word) return;
      set({ detail, detailLoading: false });
      if (detail) {
        set((state) => ({ items: patchSummary(state.items, detail) }));
      } else {
        set({ detailError: "词条不存在或已删除。" });
      }
    } catch (error) {
      if (get().detailWord !== word) return;
      set({ detail: null, detailLoading: false, detailError: wordErrorText(error) });
    }
  },

  clearDetail: () =>
    set({
      detail: null,
      detailWord: null,
      detailLoading: false,
      detailError: null,
      explaining: false,
    }),

  add: async (input) => {
    const detail = await wordAdd({
      word: input.word.trim(),
      context: input.context?.trim() || undefined,
      source: "mobile",
    });
    set((state) => ({ items: patchSummary(state.items, detail) }));
    return detail;
  },

  explain: async (word, context) => {
    const previous = get().detail?.word === word ? get().detail : null;
    set({ explaining: true, detailError: null });
    try {
      const detail = await wordExplain(word, context);
      set((state) => ({
        explaining: false,
        detail: state.detailWord === word ? detail : state.detail,
        items: patchSummary(state.items, detail),
      }));
      return detail;
    } catch (error) {
      const text = wordErrorText(error);
      const fallback = failedDetail({ word, context, previous }, text);
      set((state) => ({
        explaining: false,
        detailError: state.detailWord === word ? text : state.detailError,
        detail: state.detailWord === word ? fallback : state.detail,
        items: patchSummary(state.items, fallback),
      }));
      return null;
    }
  },

  remove: async (word) => {
    await wordDelete(word);
    set((state) => ({
      items: state.items.filter((item) => item.id !== word),
      detail: state.detail?.word === word ? null : state.detail,
      detailWord: state.detailWord === word ? null : state.detailWord,
      detailError: null,
      explaining: false,
    }));
  },

  saveNote: async (word, note) => {
    // 空字符串表示清空（后端存 NULL/空都按没有备注展示）。
    const detail = await wordSetNote(word, note.trim());
    set((state) => ({
      detail: state.detailWord === word ? detail : state.detail,
      items: patchSummary(state.items, detail),
    }));
    return detail;
  },

  generateSentences: async (words) => {
    if (words.length < 5 || words.length > 10) {
      set({ generateError: "选 5–10 个已解释的词再生成。", generated: null });
      return null;
    }
    set({ generating: true, generateError: null });
    try {
      const result = await wordGenerate(words);
      set({ generated: result, generating: false });
      return result;
    } catch (error) {
      set({ generating: false, generateError: wordErrorText(error), generated: null });
      return null;
    }
  },

  loadUsage: async () => {
    set({ usageLoading: true, usageError: null });
    try {
      const usage = await wordUsage();
      set({ usage, usageLoading: false });
    } catch (error) {
      set({ usageLoading: false, usageError: wordErrorText(error) });
    }
  },

  reset: () => set({ ...EMPTY_DATA }),
}));
