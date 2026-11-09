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
  wordUsage,
} from "@/shared/lib/tauri";

/** 单词最长 64 字符；与 Rust 侧剪贴板候选上限一致，避免超长输入打到模型。 */
export const WORD_MAX_LENGTH = 64;

/** 造句卡一次选 5–10 个已解释的词，Rust 侧同样校验。 */
export const MIN_GENERATE_WORDS = 5;
export const MAX_GENERATE_WORDS = 10;

/** 列表状态点旁的文字；详情和列表共用。 */
export const WORD_STATUS_LABEL: Record<WordStatus, string> = {
  pending: "待解释",
  ready: "已解释",
  failed: "解释失败",
};

/** 后端错误码 → 中文可读提示；未知错误保留原文，便于排查。 */
const WORD_ERROR_TEXT: Record<string, string> = {
  need_consent: "还没有同意把单词发送到百炼，先点「同意并开始使用」。",
  no_key: "还没有百炼 API Key，去「语音」页 › 百炼配置后再试。",
  not_paired: "手机还没有和电脑配对，先在设置里完成配对。",
  invalid_word: "这不是有效的英文单词，换一个再试。",
  model_error: "模型这次没有返回结果，稍后重试。",
  rate_limited: "请求太频繁，等一会儿再试。",
  timeout: "请求超时，检查网络后重试。",
  bad_json: "模型返回的内容解析失败，重试一次。",
  sync_failed: "词库同步失败，稍后会自动重试。",
};

export function wordErrorText(error: unknown): string {
  const raw = normalizeError(error).trim();
  if (!raw) return "操作失败，请重试。";
  // Rust 命令可能把错误码连同细节一起抛出（如 `model_error: HTTP 500`）。
  const code = raw.split(/[:\s]/)[0]?.toLowerCase() ?? "";
  return WORD_ERROR_TEXT[code] ?? raw;
}

/** 添加卡的本地校验：空 / 超长 / 非英文；通过时返回折叠空白后的单词。 */
export function validateWordInput(raw: string): { word: string; error: string | null } {
  const word = raw.trim().replace(/\s+/g, " ");
  if (!word) return { word, error: "请输入一个英文单词" };
  if (word.length > WORD_MAX_LENGTH) {
    return { word, error: `单词太长（最多 ${WORD_MAX_LENGTH} 个字符）` };
  }
  if (!/^[A-Za-z][A-Za-z' -]*$/.test(word)) {
    return { word, error: "只支持英文单词（字母、空格、连字符、撇号）" };
  }
  return { word, error: null };
}

/** 详情 → 列表行：只保留 WordSummary 字段，用于保存备注后原地刷新列表行。 */
function toSummary(detail: WordDetail): WordSummary {
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

/** 搜索：匹配单词本身或首条中文释义，大小写不敏感。 */
export function filterWordItems(items: WordSummary[], query: string): WordSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) =>
      item.word.toLowerCase().includes(needle) ||
      (item.firstDefinition ?? "").toLowerCase().includes(needle),
  );
}

type WordsState = {
  status: WordStatusInfo | null;
  loading: boolean;
  error: string | null;
  items: WordSummary[];
  detail: WordDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  consenting: boolean;
  adding: boolean;
  addError: string | null;
  retrying: boolean;
  deleting: boolean;
  deleteError: string | null;
  usage: WordUsageStats | null;
  usageLoading: boolean;
  usageError: string | null;
  generating: boolean;
  generateResult: WordGenerateResult | null;
  generateError: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  loadUsage: () => Promise<void>;
  agree: () => Promise<void>;
  add: (word: string, context?: string) => Promise<boolean>;
  clearAddError: () => void;
  open: (word: string) => Promise<void>;
  close: () => void;
  retry: (word: string) => Promise<void>;
  saveNote: (word: string, note: string) => Promise<WordDetail>;
  remove: (word: string) => Promise<boolean>;
  generate: (words: string[]) => Promise<boolean>;
  reset: () => void;
};

const initialData = {
  status: null,
  loading: false,
  error: null,
  items: [] as WordSummary[],
  detail: null,
  detailLoading: false,
  detailError: null,
  consenting: false,
  adding: false,
  addError: null,
  retrying: false,
  deleting: false,
  deleteError: null,
  usage: null,
  usageLoading: false,
  usageError: null,
  generating: false,
  generateResult: null,
  generateError: null,
};

/**
 * 英语角（生词本）桌面状态：状态/词库/详情/用量/造句都在这里。
 *
 * 写操作完成后统一刷新列表与用量；失败只写错误提示，不吞掉已有数据。
 * 页面挂载时 `load()`，之后由 `word-changed` 事件触发 `refresh()`。
 */
export const useWordsStore = create<WordsState>((set, get) => ({
  ...initialData,

  load: async () => {
    set({ loading: true, error: null });
    const [status, list, usage] = await Promise.allSettled([wordStatus(), wordList(), wordUsage()]);

    const patch: Partial<WordsState> = { loading: false };
    const failures: string[] = [];

    if (status.status === "fulfilled") {
      patch.status = status.value;
    } else {
      failures.push(`读取词库状态失败：${wordErrorText(status.reason)}`);
    }

    if (list.status === "fulfilled") {
      patch.items = list.value;
    } else {
      failures.push(`读取词库失败：${wordErrorText(list.reason)}`);
    }

    if (usage.status === "fulfilled") {
      patch.usage = usage.value;
      patch.usageError = null;
    } else {
      patch.usageError = wordErrorText(usage.reason);
    }

    if (failures.length > 0) patch.error = failures.join(" ");
    set(patch);
  },

  refresh: async () => {
    const [list, usage] = await Promise.allSettled([wordList(), wordUsage()]);
    if (list.status === "fulfilled") set({ items: list.value, error: null });
    else set({ error: `读取词库失败：${wordErrorText(list.reason)}` });
    if (usage.status === "fulfilled") set({ usage: usage.value, usageError: null });
    else set({ usageError: wordErrorText(usage.reason) });
  },

  loadUsage: async () => {
    set({ usageLoading: true, usageError: null });
    try {
      set({ usage: await wordUsage(), usageLoading: false });
    } catch (cause) {
      set({ usageLoading: false, usageError: wordErrorText(cause) });
    }
  },

  agree: async () => {
    set({ consenting: true, error: null });
    try {
      set({ status: await wordConsent(true), consenting: false });
    } catch (cause) {
      set({ consenting: false, error: wordErrorText(cause) });
    }
  },

  add: async (rawWord, context) => {
    const { word, error } = validateWordInput(rawWord);
    if (error) {
      set({ addError: error });
      return false;
    }

    const trimmedContext = context?.trim() || undefined;
    set({ adding: true, addError: null });

    try {
      await wordAdd({ word, context: trimmedContext, source: "manual" });
    } catch (cause) {
      set({ adding: false, addError: wordErrorText(cause) });
      return false;
    }

    try {
      await wordExplain(word, trimmedContext);
    } catch (cause) {
      // 词条已落库（Rust 保留为 failed），解释失败只提示，可到详情里重试。
      set({ addError: `已加入词库，但解释失败：${wordErrorText(cause)}` });
    }

    set({ adding: false });
    await get().refresh();
    return true;
  },

  clearAddError: () => set({ addError: null }),

  open: async (word) => {
    set({ detailLoading: true, detail: null, detailError: null, deleteError: null });
    try {
      const detail = await wordGet(word);
      if (detail) set({ detail, detailLoading: false });
      else set({ detailLoading: false, detailError: "没有找到这个词条，可能已被删除。" });
    } catch (cause) {
      set({ detailLoading: false, detailError: wordErrorText(cause) });
    }
  },

  close: () => set({ detail: null, detailLoading: false, detailError: null, deleteError: null }),

  retry: async (word) => {
    set({ retrying: true, detailError: null });
    try {
      const detail = await wordExplain(word, get().detail?.context);
      set({ detail, retrying: false });
      await get().refresh();
    } catch (cause) {
      set({ retrying: false, detailError: wordErrorText(cause) });
      await get().refresh();
    }
  },

  saveNote: async (word, note) => {
    // 空字符串表示清空备注；成功后同时更新详情与列表行（updatedAt 会变）。
    const detail = await wordSetNote(word, note.trim());
    set((state) => ({
      detail: state.detail?.word === word ? detail : state.detail,
      items: state.items.map((item) => (item.id === detail.id ? toSummary(detail) : item)),
    }));
    return detail;
  },

  remove: async (word) => {
    set({ deleting: true, deleteError: null });
    try {
      await wordDelete(word);
      set({ deleting: false, detail: null, detailError: null });
      await get().refresh();
      return true;
    } catch (cause) {
      set({ deleting: false, deleteError: wordErrorText(cause) });
      return false;
    }
  },

  generate: async (words) => {
    const unique = [...new Set(words.map((word) => word.trim()).filter(Boolean))];
    if (unique.length < MIN_GENERATE_WORDS || unique.length > MAX_GENERATE_WORDS) {
      set({
        generateError: `选 ${MIN_GENERATE_WORDS}–${MAX_GENERATE_WORDS} 个已解释的词再生成。`,
        generateResult: null,
      });
      return false;
    }

    set({ generating: true, generateError: null, generateResult: null });
    try {
      const result = await wordGenerate(unique);
      set({ generateResult: result, generating: false });
      await get().loadUsage();
      return true;
    } catch (cause) {
      set({ generating: false, generateError: wordErrorText(cause) });
      return false;
    }
  },

  reset: () => set({ ...initialData }),
}));
