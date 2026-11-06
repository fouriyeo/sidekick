/** 官方限制：Qwen-Audio-ASR 系列即时热词最多 2000 个。 */
export const MAX_KEYWORDS = 2_000;
export const MAX_WORD_CHARS = 15;
export const MAX_ASCII_SEGMENTS = 7;

export type KeywordValidation = {
  ok: boolean;
  errors: string[];
};

export function isAsciiWord(text: string): boolean {
  return Array.from(text.trim()).every((char) => char.charCodeAt(0) <= 0x7f);
}

export function wordTextError(text: string): string | null {
  const value = text.trim();
  if (!value) return "关键词不能为空";
  if (/[\r\n]/.test(value)) return "关键词不能包含换行";

  const chars = Array.from(value).length;
  if (!isAsciiWord(value)) {
    return chars > MAX_WORD_CHARS ? `「${value}」太长：中文等最多 ${MAX_WORD_CHARS} 个字符` : null;
  }
  const segments = value.split(/\s+/).filter(Boolean).length;
  return segments > MAX_ASCII_SEGMENTS ? `「${value}」英文最多 ${MAX_ASCII_SEGMENTS} 段` : null;
}

/** 保存前把行数组变成关键词列表：trim、去空行、保序去重。 */
export function normalizeKeywordRows(rows: readonly string[]): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const row of rows) {
    const text = row.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    words.push(text);
  }
  return words;
}

export function validateKeywords(keywords: readonly string[]): KeywordValidation {
  const errors: string[] = [];
  if (keywords.length > MAX_KEYWORDS) {
    errors.push(`关键词最多 ${MAX_KEYWORDS} 个（当前 ${keywords.length}）`);
  }
  keywords.forEach((word, index) => {
    const problem = wordTextError(word);
    if (problem) errors.push(`第 ${index + 1} 个：${problem}`);
  });
  return { ok: errors.length === 0, errors };
}
