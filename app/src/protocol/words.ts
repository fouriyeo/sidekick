/**
 * 英语角（生词本）双端共享类型。
 *
 * 只放「两端都要一致」的形状：Tauri 命令入参/出参、`word-changed` 事件、
 * 同步协议里外发的词条。Rust 侧对应 `app/src-tauri/src/word/types.rs`，
 * 字段名统一 camelCase（serde rename_all）。
 */

/** 词条状态：pending 待解释 / ready 已解释 / failed 解释失败（可重试）。 */
export type WordStatus = "pending" | "ready" | "failed";

/** 词条来源：手输 / 粘贴 / 从剪贴板候选 / 手机端新增。 */
export type WordSource = "manual" | "paste" | "clipboard" | "mobile";

export type WordDefinition = {
  zh: string;
  en?: string;
};

export type WordExample = {
  en: string;
  zh: string;
};

/** AI 解释结果（严格 JSON 解析后的形状；不确定的字段允许缺失）。 */
export type WordExplanation = {
  word: string;
  phonetic?: string;
  pos?: string;
  definitions: WordDefinition[];
  examples: WordExample[];
  collocations?: string[];
  mistakes?: string;
  roots?: string;
};

/** 列表行：不携带完整解释，避免列表页拖大数据。 */
export type WordSummary = {
  id: string;
  word: string;
  status: WordStatus;
  source: WordSource;
  createdAt: number;
  updatedAt: number;
  phonetic?: string;
  pos?: string;
  /** 第一条中文释义，列表里做副标题。 */
  firstDefinition?: string;
  note?: string;
  deletedAt?: number | null;
};

/** 详情：列表行 + 完整解释 + 语境与失败原因。 */
export type WordDetail = WordSummary & {
  explanation?: WordExplanation;
  context?: string;
  lastError?: string;
  model?: string;
};

export type WordSentence = {
  en: string;
  zh: string;
  /** 这句实际用到的词（模型回填，用于逐词标注）。 */
  words: string[];
};

export type WordGenerateResult = {
  sentences: WordSentence[];
  model: string;
};

export type WordUsageSummary = {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costCnyMicros: number;
};

export type WordUsageStats = {
  today: WordUsageSummary;
  last30Days: WordUsageSummary;
  days: {
    date: string;
    calls: number;
    promptTokens: number;
    completionTokens: number;
    costCnyMicros: number;
  }[];
  priceNote: string;
};

/** 英语角就绪状态：Key / 同意 / 配对（手机）/ 当前模型。 */
export type WordStatusInfo = {
  /** 本机是否已有百炼 Key。 */
  hasKey: boolean;
  /** 是否已同意把单词原文发送到百炼（首次使用必须显式同意）。 */
  agreed: boolean;
  /** 手机端：是否已与电脑配对（决定能否同步）。 */
  paired?: boolean;
  /** 实际使用的模型 id（Phase 0 探测后确定）。 */
  model: string;
  /** 本机词条数（含待解释）。 */
  total?: number;
};

/** 同步/本地变更后 Rust 广播的「列表变了」事件，载荷为空对象。 */
export type WordChangedEvent = Record<string, never>;

export function isWordStatus(value: unknown): value is WordStatus {
  return value === "pending" || value === "ready" || value === "failed";
}

export function isWordSummary(value: unknown): value is WordSummary {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.word === "string" && isWordStatus(row.status);
}

export function isWordChangedEvent(value: unknown): value is WordChangedEvent {
  return typeof value === "object" && value !== null;
}
