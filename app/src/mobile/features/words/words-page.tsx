import { cn } from "cn";
import { ChartColumn, ChevronRight, Download, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { WordAddPage } from "@/mobile/features/words/word-add";
import { WordDetail } from "@/mobile/features/words/word-detail";
import { WordExport } from "@/mobile/features/words/word-export";
import { WordGenerate } from "@/mobile/features/words/word-generate";
import { WordReview } from "@/mobile/features/words/word-review";
import { WordUsage } from "@/mobile/features/words/word-usage";
import { useWordsStore, WORD_STATUS_LABEL } from "@/mobile/features/words/words-store";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { pushBackHandler } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";
import type { WordStatus, WordSummary } from "@/protocol/words";
import { formatRelativeTime } from "@/shared/lib/format";
import { subscribeWordChanged } from "@/shared/lib/tauri";

const CARD = "overflow-hidden rounded-2xl border-[0.5px] border-border bg-card";
const ROW = "flex min-h-[60px] w-full items-center gap-3 px-4 text-left";
const PILL =
  "flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] leading-[18px] text-primary active:bg-wash disabled:opacity-50";

const STATUS_DOT: Record<WordStatus, string> = {
  pending: "bg-decide",
  ready: "bg-signal",
  failed: "bg-destructive",
};

type PageMode = "list" | "generate" | "usage";
type DetailTarget = { word: string; autoExplain: boolean };

/** 浏览器 QA 用：?wordsView=generate|usage 直接打开子页（仅 dev）。 */
function initialMode(): PageMode {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const requested = new URLSearchParams(window.location.search).get("wordsView");
    if (requested === "generate" || requested === "usage") return requested;
  }
  return "list";
}

function WordRow({ item, onOpen }: { item: WordSummary; onOpen: () => void }) {
  const label = WORD_STATUS_LABEL[item.status];
  const subtitle =
    item.status === "ready"
      ? item.firstDefinition?.trim() || "已解释，点开看完整内容"
      : item.status === "failed"
        ? "解释失败，点开重试"
        : "等待 AI 解释";
  return (
    <button
      type="button"
      aria-label={`${item.word}，${label}`}
      className={cn(ROW, "active:bg-wash")}
      onClick={onOpen}
    >
      <span
        role="img"
        aria-label={`状态：${label}`}
        className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[item.status])}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-[21px] text-foreground">
          {item.word}
        </span>
        <span className="mt-0.5 block truncate text-[12px] leading-[17px] text-muted-foreground">
          {item.phonetic && <span className="mr-1.5">{item.phonetic}</span>}
          {subtitle}
        </span>
      </span>
      <span className="shrink-0 text-[11.5px] leading-[16px] text-muted-foreground">
        {formatRelativeTime(item.updatedAt)}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/70" />
    </button>
  );
}

/** 首次使用隐私说明：同意后才允许把单词原文发给百炼。 */
function ConsentGate({
  agreeing,
  error,
  onAgree,
}: {
  agreeing: boolean;
  error: string | null;
  onAgree: () => void;
}) {
  return (
    <div className="mt-4 rounded-2xl border-[0.5px] border-border bg-card px-4 py-4">
      <h2 className="m-0 text-[15px] leading-[21px] text-foreground">先把这件事说清楚</h2>
      <p className="mt-2 text-[13px] leading-[20px] text-muted-foreground">
        解释、造句会把单词原文（以及你填的语境句）发送到阿里云百炼，用 qwen3.8-flash 生成内容。
        词库本身只存在这台手机和已配对的电脑上，不会上传整本词库、剪贴板或设备信息。
      </p>
      <p className="mt-1.5 text-[12px] leading-[18px] text-muted-foreground">
        不联网时也能看本地词库，只是不能生成解释和例句。
      </p>
      {error && (
        <p role="alert" className="mt-2 text-[12px] leading-[18px] text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-[15px] leading-[21px] text-primary-foreground active:opacity-90 disabled:opacity-60"
        disabled={agreeing}
        onClick={onAgree}
      >
        {agreeing ? "正在保存…" : "同意并开始使用"}
      </button>
    </div>
  );
}

/**
 * 手机「英语角（生词本）」全屏页：词库列表 + 页内 push 的详情/新增/造句/用量。
 *
 * 列表只读本地词库（Rust 侧 SQLite），同步与解释都在后台命令里完成；
 * 页内子页各自压返回栈，返回键先回列表，再回宠物页。
 */
export function WordsPage() {
  const setView = useUiStore((state) => state.setView);
  const openOffline = useUiStore((state) => state.openOffline);
  const connected = useConnectionStore((state) => state.status === "connected");

  const status = useWordsStore((state) => state.status);
  const statusError = useWordsStore((state) => state.statusError);
  const items = useWordsStore((state) => state.items);
  const loading = useWordsStore((state) => state.loading);
  const error = useWordsStore((state) => state.error);
  const loadStatus = useWordsStore((state) => state.loadStatus);
  const load = useWordsStore((state) => state.load);
  const syncNow = useWordsStore((state) => state.syncNow);
  const agree = useWordsStore((state) => state.agree);

  const [mode, setMode] = useState<PageMode>(initialMode);
  const [search, setSearch] = useState("");
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [adding, setAdding] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [agreeing, setAgreeing] = useState(false);

  // 列表/状态只在进入英语角时拉一次；之后靠 word-changed 事件刷新。
  useEffect(() => {
    void loadStatus();
    void load();
    void syncNow();
  }, [load, loadStatus, syncNow]);

  // 连上电脑后补一次同步，成功后再拉列表；未连接时静默。
  useEffect(() => {
    if (!connected) return;
    void syncNow().then(() => load());
  }, [connected, load, syncNow]);

  // Rust 在本机或对端改词库后广播：列表刷新，详情打开时一起刷新。
  useEffect(
    () =>
      subscribeWordChanged(() => {
        void useWordsStore.getState().load();
        const current = useWordsStore.getState().detailWord;
        if (current) void useWordsStore.getState().loadDetail(current);
      }),
    [],
  );

  // 页内子页先消费返回：造句/用量 → 列表；详情/新增各自压栈更靠上。
  useEffect(
    () =>
      pushBackHandler(() => {
        if (mode !== "list") {
          setMode("list");
          return true;
        }
        return false;
      }),
    [mode],
  );

  const closeDetail = useCallback(() => {
    setDetailTarget(null);
    void load();
  }, [load]);

  const handleAgree = useCallback(() => {
    setAgreeing(true);
    void agree()
      .then((next) => {
        if (!next) return;
        toast.success("已同意，可以开始用英语角了");
        void load();
      })
      .finally(() => setAgreeing(false));
  }, [agree, load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter(
      (item) =>
        item.word.toLowerCase().includes(query) ||
        item.firstDefinition?.toLowerCase().includes(query),
    );
  }, [items, search]);

  if (detailTarget) {
    return (
      <WordDetail
        word={detailTarget.word}
        autoExplain={detailTarget.autoExplain}
        onBack={closeDetail}
      />
    );
  }

  if (adding) {
    return (
      <WordAddPage
        onBack={() => setAdding(false)}
        onSaved={(word) => {
          setAdding(false);
          setDetailTarget({ word, autoExplain: true });
        }}
      />
    );
  }

  if (mode === "generate") {
    return <WordGenerate onBack={() => setMode("list")} />;
  }

  if (mode === "usage") {
    return <WordUsage onBack={() => setMode("list")} />;
  }

  if (exportOpen) {
    return <WordExport onBack={() => setExportOpen(false)} />;
  }

  const showConsent = status !== null && !status.agreed;
  const statusFailed = status === null && statusError !== null;
  // 状态没回来之前不闪搜索/工具行，避免空词库/隐私门一闪而过。
  const gated = showConsent || statusFailed || status === null;

  return (
    <MobilePage aria-label="英语角">
      <PageHeader
        title="英语角"
        sub="生词本 · 词库只在本机与电脑"
        onBack={() => setView("pet")}
        backLabel="返回宠物"
        right={
          gated ? undefined : (
            <button
              type="button"
              aria-label="新增单词"
              className="flex size-11 items-center justify-center rounded-full text-primary active:bg-wash"
              onClick={() => setAdding(true)}
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.8} />
            </button>
          )
        }
      />

      {!gated && (
        <>
          <div className="flex flex-none items-center gap-2 px-4 pt-1">
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3">
              <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <input
                type="search"
                aria-label="搜索单词"
                className="min-w-0 flex-1 bg-transparent text-[14px] leading-[20px] text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="搜索单词或释义"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-none items-center justify-between px-4 pt-2 pb-1">
            <span className="text-[12px] leading-[17px] text-muted-foreground">
              {items.length > 0 ? `共 ${items.length} 个词` : "还没有词"}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="用已解释的词造句"
                className={PILL}
                onClick={() => setMode("generate")}
              >
                <Sparkles aria-hidden="true" className="size-4" strokeWidth={1.6} />
                造句
              </button>
              <button
                type="button"
                aria-label="查看英语角用量"
                className={PILL}
                onClick={() => setMode("usage")}
              >
                <ChartColumn aria-hidden="true" className="size-4" strokeWidth={1.6} />
                用量
              </button>
            </div>
          </div>
        </>
      )}

      <PageScroll className="pt-1">
        {status === null && !statusFailed ? (
          <div className="mt-16 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            正在读取…
          </div>
        ) : statusFailed ? (
          <div
            role="alert"
            className="mt-4 rounded-2xl border-[0.5px] border-destructive bg-card px-4 py-3"
          >
            <p className="m-0 text-[13px] leading-[19px] text-foreground">{statusError}</p>
            <button
              type="button"
              className="mt-2 flex min-h-11 items-center text-[13px] font-medium text-destructive"
              onClick={() => void loadStatus()}
            >
              重试
            </button>
          </div>
        ) : showConsent ? (
          <ConsentGate agreeing={agreeing} error={statusError} onAgree={handleAgree} />
        ) : (
          <>
            {statusError && (
              <p
                role="alert"
                className="mb-2 rounded-2xl border-[0.5px] border-destructive bg-card px-4 py-2 text-[12px] leading-[18px] text-destructive"
              >
                {statusError}
              </p>
            )}

            {status && !status.hasKey && (
              <div className="mb-2 flex items-center gap-2 rounded-2xl border-[0.5px] border-decide bg-card px-4 py-3">
                <span className="min-w-0 flex-1 text-[13px] leading-[19px] text-foreground">
                  还没有百炼 Key，解释和造句用不了。先在电脑上配对手机，或去设置里配对。
                </span>
                <button
                  type="button"
                  className="flex min-h-11 shrink-0 items-center text-[13px] text-decide"
                  onClick={() => setView("settings")}
                >
                  去设置
                </button>
              </div>
            )}

            {(!connected || status?.paired === false) && (
              <div className="mb-2 flex items-center gap-2 rounded-2xl border-[0.5px] border-border bg-card px-4 py-3">
                <span className="min-w-0 flex-1 text-[13px] leading-[19px] text-muted-foreground">
                  连上电脑后自动同步。现在看到的是本机词库。
                </span>
                <button
                  type="button"
                  className="flex min-h-11 shrink-0 items-center text-[13px] text-primary"
                  onClick={() => (connected ? setView("settings") : openOffline())}
                >
                  {connected ? "去配对" : "去连接"}
                </button>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mb-2 rounded-2xl border-[0.5px] border-destructive bg-card px-4 py-2"
              >
                <p className="m-0 text-[12px] leading-[18px] text-destructive">{error}</p>
                <button
                  type="button"
                  className="mt-1 flex min-h-11 items-center text-[13px] font-medium text-destructive"
                  onClick={() => void load()}
                >
                  重试
                </button>
              </div>
            )}

            <WordReview items={items} />

            {loading && items.length === 0 ? (
              <div className="mt-10 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                正在读取…
              </div>
            ) : items.length === 0 ? (
              <div className="mt-12 px-6 text-center">
                <p className="m-0 text-[15px] leading-[21px] text-foreground">还没有生词</p>
                <p className="mt-1 text-[13px] leading-[19px] text-muted-foreground">
                  点右上角 ＋ 添加第一个单词，保存后会立刻让 AI 解释。
                </p>
              </div>
            ) : visible.length === 0 ? (
              <div className="mt-12 px-6 text-center">
                <p className="m-0 text-[15px] leading-[21px] text-foreground">没有匹配的词</p>
                <p className="mt-1 text-[13px] leading-[19px] text-muted-foreground">
                  换个关键词，或清空搜索。
                </p>
              </div>
            ) : (
              <div className={CARD}>
                {visible.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <div aria-hidden="true" className="ml-9 h-[0.5px] bg-border" />}
                    <WordRow
                      item={item}
                      onOpen={() => setDetailTarget({ word: item.word, autoExplain: false })}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-center">
              <button
                type="button"
                aria-label="导出词库 Markdown"
                className="flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[13px] leading-[19px] text-muted-foreground active:bg-wash disabled:opacity-50"
                disabled={items.length === 0}
                onClick={() => setExportOpen(true)}
              >
                <Download aria-hidden="true" className="size-4" strokeWidth={1.6} />
                导出 Markdown
              </button>
            </div>
          </>
        )}
      </PageScroll>
    </MobilePage>
  );
}
