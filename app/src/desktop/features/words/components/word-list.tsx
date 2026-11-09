import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ListEmpty, ListGroup, ListRow } from "@/desktop/shell/list";
import type { WordStatus, WordSummary } from "@/protocol/words";
import { formatRelativeTime } from "@/shared/lib/format";
import { SignalDot, type SignalStatus } from "@/shared/ui/signal-dot";
import { filterWordItems, WORD_STATUS_LABEL } from "../words-store";

const DOT_STATUS: Record<WordStatus, SignalStatus> = {
  pending: "waiting",
  ready: "connected",
  failed: "error",
};

/**
 * 词库列表：搜索 + 状态点 + 首条释义 + 更新时间；点整行 push 到词条详情。
 *
 * 列表最多 2000 条（Rust 侧 LIMIT），搜索在本地过滤，不再发一次命令。
 */
export function WordList({
  items,
  loading,
  onOpen,
}: {
  items: WordSummary[];
  loading: boolean;
  onOpen: (word: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterWordItems(items, query), [items, query]);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="dsl-search">
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索单词或释义"
          aria-label="搜索词库"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <ListGroup
        title={
          query ? `词库 · ${filtered.length} / ${items.length} 个` : `词库 · ${items.length} 个`
        }
      >
        {filtered.length === 0 ? (
          <ListEmpty>
            {items.length === 0
              ? loading
                ? "正在读取词库…"
                : "词库还是空的。输入一个英文单词，点「查词」。"
              : `没有匹配「${query.trim()}」的词条。`}
          </ListEmpty>
        ) : (
          filtered.map((item) => {
            const statusLabel = WORD_STATUS_LABEL[item.status];
            return (
              <ListRow
                key={item.id}
                icon={<SignalDot status={DOT_STATUS[item.status]} pulse={false} />}
                title={item.word}
                detail={item.firstDefinition || statusLabel}
                meta={formatRelativeTime(item.updatedAt)}
                chevron
                onClick={() => onOpen(item.word)}
                titleAttr={statusLabel}
              />
            );
          })
        )}
      </ListGroup>
    </div>
  );
}
