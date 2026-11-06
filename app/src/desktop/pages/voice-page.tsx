import { Cloud, Tag } from "lucide-react";
import { useEffect } from "react";
import { CloudAsrForm } from "@/desktop/features/models/cloud-asr-form";
import {
  type CloudLanguage,
  hintsToLanguage,
  useCloudAsrStore,
} from "@/desktop/features/models/cloud-asr-store";
import { formatCnyMicros, formatTokens } from "@/desktop/features/models/format";
import { MAX_KEYWORDS } from "@/desktop/features/models/keywords";
import { KeywordsPage } from "@/desktop/features/models/keywords-page";
import { UsageStatsPanel } from "@/desktop/features/models/usage-stats";
import { useUsageStore } from "@/desktop/features/models/usage-store";
import type { VoicePane } from "@/desktop/lib/desktop-nav";
import { ListGroup, ListRow } from "@/desktop/shell/list";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageShell } from "@/desktop/shell/page-shell";
import type { UsageSummary } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";

const LANGUAGE_LABEL: Record<CloudLanguage, string> = {
  zh: "中文",
  auto: "自动识别",
  "zh-en": "中英混说",
};

type VoicePageProps = {
  pane: VoicePane;
  onPaneChange: (pane: VoicePane) => void;
};

/**
 * 语音（一级页，D94）：首屏只做「状态 / 关键词 / 今天」三组摘要，
 * 配置、关键词、用量各自 push 进二级页；不写页面说明句、不放表单。
 */
export function VoicePage({ pane, onPaneChange }: VoicePageProps) {
  const loadCloud = useCloudAsrStore((state) => state.load);
  const loadUsage = useUsageStore((state) => state.load);

  useEffect(() => {
    void loadCloud();
    void loadUsage();
  }, [loadCloud, loadUsage]);

  // 用户通常在手机上说话，回到电脑窗口时刷新音量与配置状态。
  useEffect(() => {
    const onFocus = () => {
      void loadCloud();
      void loadUsage();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadCloud, loadUsage]);

  if (pane === "config") {
    return (
      <PageShell transition="push">
        <PageHeader title="连接与识别" backLabel="语音" onBack={() => onPaneChange("root")} />
        <PageBody>
          <CloudAsrForm />
        </PageBody>
      </PageShell>
    );
  }

  if (pane === "keywords") {
    return <KeywordsPage onBack={() => onPaneChange("root")} />;
  }

  if (pane === "usage") {
    return (
      <PageShell transition="push">
        <PageHeader title="语音用量" backLabel="语音" onBack={() => onPaneChange("root")} />
        <PageBody>
          <UsageStatsPanel />
        </PageBody>
      </PageShell>
    );
  }

  return <VoiceOverview onPaneChange={onPaneChange} />;
}

function VoiceOverview({ onPaneChange }: { onPaneChange: (pane: VoicePane) => void }) {
  const status = useCloudAsrStore((state) => state.status);
  const usage = useUsageStore((state) => state.stats);

  const configured = status?.configured ?? false;
  const language = status ? LANGUAGE_LABEL[hintsToLanguage(status.config.languageHints)] : null;
  const keywords = status?.config.vocabulary ?? [];

  return (
    <PageShell>
      <PageHeader title="语音" />
      <PageBody>
        {status !== null && !configured && (
          <div
            role="status"
            className="dsl-glass flex min-h-[56px] items-center gap-3 rounded-[16px] px-4 py-2.5"
          >
            <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-decide" />
            <p className="min-w-0 flex-1 truncate text-[15px] leading-tight">还没配置百炼</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => onPaneChange("config")}>
              去配置
            </Button>
          </div>
        )}

        <ListGroup title="识别">
          <ListRow
            icon={<Cloud aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
            iconTone={configured ? "green" : "gray"}
            title="百炼"
            detail={status ? `${status.config.model} · ${language ?? ""}` : "—"}
            meta={status ? (configured ? "已配置" : "未配置") : "—"}
            tone={configured ? "signal" : "muted"}
            chevron
            onClick={() => onPaneChange("config")}
          />
          <ListRow
            icon={<Tag aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
            iconTone="purple"
            title="关键词"
            meta={`${keywords.length} / ${MAX_KEYWORDS}`}
            chevron
            onClick={() => onPaneChange("keywords")}
          />
        </ListGroup>

        <ListGroup title="今天">
          <ListRow
            title="今天"
            meta={usageLabel(usage?.today)}
            chevron
            onClick={() => onPaneChange("usage")}
          />
          <ListRow
            title="近 7 天"
            meta={usageLabel(usage?.last7Days)}
            chevron
            onClick={() => onPaneChange("usage")}
          />
        </ListGroup>
      </PageBody>
    </PageShell>
  );
}

function usageLabel(summary: UsageSummary | undefined): string {
  if (!summary) return "—";
  return `${formatTokens(summary.sessions)} 次 · ${formatCnyMicros(summary.costCnyMicros)}`;
}
