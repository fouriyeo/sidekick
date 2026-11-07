import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCloudAsrStore } from "@/desktop/features/models/cloud-asr-store";
import {
  MAX_KEYWORDS,
  normalizeKeywordRows,
  validateKeywords,
} from "@/desktop/features/models/keywords";
import { ListActionRow, ListEmpty, ListGroup } from "@/desktop/shell/list";
import { normalizeError } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

type KeywordRow = {
  id: number;
  value: string;
};

/** 词列表 → 表单行；末尾永远补一个空行，方便继续输入。 */
function makeRows(nextId: React.RefObject<number>, words: readonly string[]): KeywordRow[] {
  const rows = words.map((value) => ({ id: nextId.current++, value }));
  rows.push({ id: nextId.current++, value: "" });
  return rows;
}

/**
 * 设置 › 语音输入 › 关键词：一段可嵌进单页的分组列表，一行一个词；
 * 加号加一行，保存写入 asr.json。不做分组/启停/权重；
 * 录音时整份列表作为即时热词（权重 4）发送。
 *
 * 配置状态的读取由所在页面负责（本组件只读 store 的 status），
 * 读到了再初始化表单，避免把已有词覆盖成空表。
 */
export function KeywordsPanel() {
  const status = useCloudAsrStore((state) => state.status);
  const loadError = useCloudAsrStore((state) => state.error);
  const saveKeywords = useCloudAsrStore((state) => state.saveKeywords);

  const nextId = useRef(1);

  const [rows, setRows] = useState<KeywordRow[]>(() => makeRows(nextId, []));
  const [initialized, setInitialized] = useState(false);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (initialized) return;
    // 等配置读完（或读取失败）再初始化，避免把已有词覆盖成空表。
    if (!status && !loadError) return;
    setRows(makeRows(nextId, status?.config.vocabulary ?? []));
    setInitialized(true);
  }, [status, loadError, initialized]);

  const keywords = normalizeKeywordRows(rows.map((row) => row.value));

  function updateRow(id: number, value: string) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, value } : row)));
    setErrors([]);
    setSaved(null);
  }

  function addRow() {
    const id = nextId.current++;
    setRows((current) => [...current, { id, value: "" }]);
    setFocusId(id);
    setSaved(null);
  }

  function removeRow(id: number) {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id);
      return next.length > 0 ? next : [{ id: nextId.current++, value: "" }];
    });
    setFocusId(null);
    setErrors([]);
    setSaved(null);
  }

  async function save() {
    const problems = validateKeywords(keywords);
    if (!problems.ok) {
      setErrors(problems.errors);
      setSaved(null);
      return;
    }

    setSaving(true);
    setErrors([]);
    setSaved(null);
    try {
      await saveKeywords(keywords);
      setRows(makeRows(nextId, keywords));
      setSaved("已保存");
    } catch (cause) {
      setErrors([`保存失败：${normalizeError(cause)}`]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <ListGroup
        title="关键词"
        action={
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {keywords.length} / {MAX_KEYWORDS}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={saving || !initialized}
              onClick={() => void save()}
            >
              {saving && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
              保存
            </Button>
          </div>
        }
      >
        {!initialized ? (
          <ListEmpty>正在读取关键词…</ListEmpty>
        ) : (
          rows.map((row, index) => (
            <div key={row.id} className="dsl-row">
              <span
                aria-hidden="true"
                className="w-[22px] shrink-0 text-[13px] text-muted-foreground tabular-nums"
              >
                {index + 1}
              </span>
              <Input
                value={row.value}
                placeholder="输入关键词"
                aria-label={`第 ${index + 1} 个关键词`}
                // 新加的一行自动聚焦；其余行按普通输入框处理。
                autoFocus={focusId === row.id}
                className="min-w-0 flex-1"
                onChange={(event) => updateRow(row.id, event.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`删除第 ${index + 1} 行`}
                onClick={() => removeRow(row.id)}
              >
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          ))
        )}
        <ListActionRow disabled={!initialized} onClick={addRow}>
          <Plus aria-hidden="true" className="size-3.5" />
          加一行
        </ListActionRow>
      </ListGroup>

      <div className="flex flex-col gap-1 px-1.5">
        <p className="text-[13px] leading-[1.45] text-muted-foreground">
          关键词只在本机 asr.json 与百炼识别请求中使用，不写日志、不上传其他位置。
        </p>
        {errors.slice(0, 4).map((message) => (
          <p key={message} role="alert" className="text-[13px] leading-[1.45] text-destructive">
            {message}
          </p>
        ))}
        {errors.length > 4 && (
          <p className="text-[13px] leading-[1.45] text-destructive">
            还有 {errors.length - 4} 条问题
          </p>
        )}
        {saved && (
          <p role="status" className="text-[13px] leading-[1.45] text-signal">
            {saved}
          </p>
        )}
      </div>
    </div>
  );
}
