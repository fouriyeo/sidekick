import { useEffect } from "react";
import { WordAddCard } from "@/desktop/features/words/components/word-add-card";
import { WordDetailView } from "@/desktop/features/words/components/word-detail";
import { WordExportButton } from "@/desktop/features/words/components/word-export";
import { WordGenerateCard } from "@/desktop/features/words/components/word-generate-card";
import { WordList } from "@/desktop/features/words/components/word-list";
import { WordReviewCard } from "@/desktop/features/words/components/word-review-card";
import { WordUsagePanel } from "@/desktop/features/words/components/word-usage-panel";
import { useWordsStore } from "@/desktop/features/words/words-store";
import type { DesktopNav } from "@/desktop/lib/desktop-nav";
import { ListActionRow, ListEmpty, ListGroup } from "@/desktop/shell/list";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageShell } from "@/desktop/shell/page-shell";
import { subscribeWordChanged } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";

/**
 * 英语角（一级页 ⌘7）：添加卡 → 词库列表 → 造句卡 → 页内 AI 用量。
 *
 * 未同意时只展示隐私说明与同意按钮（词库仍可看）；没有百炼 Key 时提示去
 * 「语音」页配置。点词条行在页内 push 到详情，返回回到列表。
 */
export function WordsPage({ nav }: { nav?: DesktopNav }) {
  const status = useWordsStore((state) => state.status);
  const loading = useWordsStore((state) => state.loading);
  const error = useWordsStore((state) => state.error);
  const items = useWordsStore((state) => state.items);
  const detail = useWordsStore((state) => state.detail);
  const detailLoading = useWordsStore((state) => state.detailLoading);
  const detailError = useWordsStore((state) => state.detailError);
  const consenting = useWordsStore((state) => state.consenting);
  const load = useWordsStore((state) => state.load);
  const refresh = useWordsStore((state) => state.refresh);
  const agree = useWordsStore((state) => state.agree);
  const open = useWordsStore((state) => state.open);

  const canRequest = Boolean(status?.agreed && status.hasKey);

  useEffect(() => {
    void load();
    // 本机或对端改了词库：刷新列表与用量；详情打开时顺带刷新当前词条。
    return subscribeWordChanged(() => {
      void refresh();
      const current = useWordsStore.getState().detail;
      if (current) void useWordsStore.getState().open(current.word);
    });
  }, [load, refresh]);

  // 页内 push：详情打开时整页换成详情，返回后回到列表。
  if (detail !== null || detailLoading || detailError !== null) {
    return <WordDetailView canRequest={canRequest} />;
  }

  return (
    <PageShell>
      <PageHeader title="英语角" actions={<WordExportButton disabled={items.length === 0} />} />
      <PageBody>
        {error && (
          <p role="alert" className="px-1.5 text-[13px] leading-[1.45] text-destructive">
            {error}
          </p>
        )}

        {!status && (
          <ListGroup title="词库">
            {loading ? (
              <ListEmpty>正在读取词库…</ListEmpty>
            ) : (
              <>
                <ListEmpty>读取词库失败，检查后端命令是否已实现。</ListEmpty>
                <ListActionRow onClick={() => void load()}>重试</ListActionRow>
              </>
            )}
          </ListGroup>
        )}

        {status && !status.agreed && (
          <ConsentGate consenting={consenting} onAgree={() => void agree()} />
        )}

        {status?.agreed && !status.hasKey && (
          <NoKeyNotice onGoVoice={nav ? () => nav.go("voice") : undefined} />
        )}

        {status?.agreed && <WordAddCard canRequest={canRequest} />}

        {status && <WordReviewCard items={items} />}

        {status && <WordList items={items} loading={loading} onOpen={(word) => void open(word)} />}

        {status?.agreed && <WordGenerateCard items={items} canRequest={canRequest} />}

        {status && <WordUsagePanel />}
      </PageBody>
    </PageShell>
  );
}

/** 首次使用：隐私说明 + 显式同意；未同意不调用百炼。 */
function ConsentGate({ consenting, onAgree }: { consenting: boolean; onAgree: () => void }) {
  return (
    <ListGroup title="首次使用">
      <div className="dsl-row flex-col items-start gap-2">
        <p className="m-0 text-[15px] leading-[1.55] text-foreground">
          单词原文与可选语境句会发送到阿里云百炼；解释只存本机；不发送整个词库或剪贴板历史。
        </p>
        <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">
          百炼按调用量计费，本页只显示估算金额。不同意也可以先查看本机已有词条。
        </p>
      </div>
      <div className="dsl-row">
        <span className="mr-auto min-w-0 text-[13px] leading-[1.45] text-muted-foreground">
          同意后才会调用百炼。
        </span>
        <Button type="button" size="sm" disabled={consenting} onClick={onAgree}>
          同意并开始使用
        </Button>
      </div>
    </ListGroup>
  );
}

/** 未配置百炼 Key：提示去「语音」页，不在英语角里重复做配置表单。 */
function NoKeyNotice({ onGoVoice }: { onGoVoice?: () => void }) {
  return (
    <ListGroup title="需要配置">
      <div className="dsl-row flex-col items-start gap-1">
        <p className="m-0 text-[15px] leading-[1.5] text-foreground">
          还没有百炼 API Key，查词和造句暂时不能用。
        </p>
        <p className="m-0 text-[13px] leading-[1.45] text-muted-foreground">
          去「语音」页 › 百炼 填 Key 后回来。
        </p>
      </div>
      {onGoVoice && <ListActionRow onClick={onGoVoice}>去「语音」页配置</ListActionRow>}
    </ListGroup>
  );
}
