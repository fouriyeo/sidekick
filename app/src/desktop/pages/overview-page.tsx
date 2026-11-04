import { cn } from "cn";
import { Activity, Home, Mic, Plug } from "lucide-react";
import { type ReactNode, useState } from "react";
import { EmptyState } from "@/desktop/components/empty-state";
import {
  describeHookStatus,
  formatHookHeartbeat,
  type HookStatusTone,
  useHookStore,
} from "@/desktop/features/hook/hook-store";
import { useDesktopActivityStore } from "@/desktop/lib/desktop-activity-store";
import {
  deviceCountFromClients,
  useDesktopClientsStore,
} from "@/desktop/lib/desktop-clients-store";
import type { DesktopNav } from "@/desktop/lib/desktop-nav";
import { useDesktopStatusStore } from "@/desktop/lib/desktop-status-store";
import { useDesktopVoiceStore } from "@/desktop/lib/desktop-voice-store";
import { Card, CardHint, MetaRow } from "@/desktop/shell/card";
import { PageChip, type PageTone, StateTag } from "@/desktop/shell/page-chips";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageFooter, PageShell } from "@/desktop/shell/page-shell";
import type { DesktopConnection } from "@/desktop/use-desktop-connection";
import type { StatusState } from "@/protocol/messages";
import type { ActivityKind } from "@/shared/lib/activity";
import { formatRelativeTime } from "@/shared/lib/format";
import {
  rowTime,
  type SessionRow,
  sessionTitle,
  visibleSessions,
  workingActionText,
} from "@/shared/lib/sessions";
import { AI_STATE_LABEL, AI_STATE_LEVEL, AI_STATE_TONE } from "@/shared/lib/status";
import { Button } from "@/shared/ui/button";
import { SignalBars } from "@/shared/ui/signal-bars";

const HOOK_TONE: Record<HookStatusTone, PageTone> = {
  connected: "signal",
  waiting: "decide",
  error: "danger",
  muted: "muted",
};

const ACTIVITY_KIND: Record<ActivityKind, { label: string; tone: PageTone }> = {
  voice: { label: "语音", tone: "muted" },
  ai: { label: "AI", tone: "signal" },
  connection: { label: "连接", tone: "muted" },
  clipboard: { label: "剪贴板", tone: "muted" },
  system: { label: "系统", tone: "muted" },
};

const VOICE_OUTCOME: Record<
  "inserted" | "copied" | "failed",
  { label: string; detail: string; tone: PageTone }
> = {
  inserted: { label: "已输入", detail: "已输入到当前窗口", tone: "signal" },
  copied: { label: "已复制", detail: "已复制到电脑", tone: "muted" },
  failed: { label: "失败", detail: "没听清或转写失败", tone: "danger" },
};

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

type OverviewPageProps = {
  connection: DesktopConnection;
  nav: DesktopNav;
};

/**
 * 总览（默认首页）：现在卡（唯一主行动位）+ 最近语音 + 最近事件 + 这台电脑 + AI 联动摘要。
 * 所有数字都来自真实可得信息（端口、设备近似值、状态更新时间），不编造延迟/心跳读数。
 */
export function OverviewPage({ connection, nav }: OverviewPageProps) {
  const status = useDesktopStatusStore((state) => state.status);
  const sessionList = useDesktopStatusStore((state) => state.sessionList);
  const clients = useDesktopClientsStore((state) => state.clients);
  const voice = useDesktopVoiceStore((state) => state.last);
  const events = useDesktopActivityStore((state) => state.events);
  const hookStatus = useHookStore((state) => state.status);

  const [copied, setCopied] = useState(false);
  const info = connection.info;
  const address = info ? `${info.ip}:${info.port}` : null;
  const discoveryPort = info?.discoveryPort ?? null;
  const devices = deviceCountFromClients(clients);
  const phoneConnected = devices > 0;
  const connected = connection.status === "connected";

  const rows = visibleSessions(sessionList, {});
  const asking = rows.find((row) => row.display === "asking") ?? null;
  const working = rows.find((row) => row.display === "working") ?? null;
  const completed = rows.find((row) => row.display === "completed") ?? null;
  const aiState: StatusState = status?.state ?? "idle";

  async function handleCopy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="总览"
        description="打开软件第一眼：服务在不在、手机连没连、AI 在干什么，以及现在该点哪里。"
        chips={
          <>
            <PageChip
              label={phoneConnected ? `已连接 · ${devices} 台设备` : "手机未连接"}
              tone={phoneConnected ? "signal" : "muted"}
              title="设备数 = 服务端客户端总数 − 1（含本机窗口与网页预览），手机台数为近似值"
            />
            <PageChip
              label={status ? `AI ${AI_STATE_LABEL[aiState]}` : "AI 还没开启联动"}
              tone={status ? AI_STATE_TONE[aiState] : "muted"}
            />
          </>
        }
      />

      <PageBody>
        <NowCard
          connection={connection}
          nav={nav}
          status={status}
          aiState={aiState}
          asking={asking}
          working={working}
          completed={completed}
          devices={devices}
          sessionCount={rows.length}
        />

        <div className="grid min-h-0 shrink-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col gap-3">
            <Card
              title={
                <>
                  <Mic aria-hidden="true" />
                  最近一次语音输入
                </>
              }
              subtitle={voice ? `VOICE · ${formatRelativeTime(voice.at)}` : "VOICE · 最近没有记录"}
              pill={
                voice ? (
                  <StateTag
                    label={VOICE_OUTCOME[voice.outcome].label}
                    tone={VOICE_OUTCOME[voice.outcome].tone}
                  />
                ) : undefined
              }
              className="shrink-0"
              footer={
                voice ? (
                  <>
                    <CardHint>录音不保存，只留最终文本；完整历史在「内容」页。</CardHint>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => nav.go("content")}
                    >
                      打开内容
                    </Button>
                  </>
                ) : (
                  <>
                    <CardHint>录音不保存，只留最终文本。</CardHint>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => nav.goSystem("connection")}
                    >
                      连接手机
                    </Button>
                  </>
                )
              }
            >
              {voice ? (
                <>
                  <p className="line-clamp-3 text-[13px] leading-relaxed">
                    {voice.text ? `「${voice.text}」` : "（没有识别到文字）"}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StateTag label="语音" tone="muted" />
                    <StateTag label={VOICE_OUTCOME[voice.outcome].detail} tone="muted" />
                    <StateTag label={`${voice.text.length} 字`} tone="muted" />
                  </div>
                </>
              ) : (
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  还没用手机说过话。手机装好 App 后按住说话，结果会出现在这里。
                </p>
              )}
            </Card>

            <Card
              title={
                <>
                  <Activity aria-hidden="true" />
                  最近事件
                </>
              }
              subtitle="EVENTS · 只在本机保留"
              pill={<StateTag label={`${events.length} 条`} tone="muted" />}
              className="min-h-0 flex-1"
              bodyClassName="min-h-0"
              footer={
                <>
                  <CardHint>语音输入、AI 状态与连接变化都在这里；重启后清空。</CardHint>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => nav.go("sessions")}
                  >
                    查看会话
                  </Button>
                </>
              }
            >
              {events.length === 0 ? (
                <div className="flex min-h-[150px] flex-1 items-center justify-center">
                  <EmptyState
                    icon={<Activity className="size-4" />}
                    title="今天还没有事件"
                    description="连上手机、开启 AI 联动后，语音输入、AI 状态与连接变化都会记在这里。"
                    action={
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button type="button" size="sm" onClick={() => nav.goSystem("connection")}>
                          扫码连接手机
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => nav.goSystem("hook")}
                        >
                          开启 AI 联动
                        </Button>
                      </div>
                    }
                  />
                </div>
              ) : (
                <ul className="flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto p-0">
                  {events.slice(0, 5).map((event) => {
                    const kind = ACTIVITY_KIND[event.kind];
                    return (
                      <li
                        key={event.id}
                        className="flex items-start gap-2.5 border-b border-border/60 py-1.5 last:border-0"
                      >
                        <span className="mt-0.5 w-9 shrink-0 font-mono text-[10px] text-muted-foreground">
                          {formatClock(event.at)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium">{event.title}</p>
                          {event.detail && (
                            <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                              {event.detail}
                            </p>
                          )}
                        </div>
                        <StateTag label={kind.label} tone={kind.tone} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <div className="flex min-h-0 flex-col gap-3">
            <Card
              title={
                <>
                  <Home aria-hidden="true" />
                  这台电脑
                </>
              }
              subtitle="THIS MAC · 局域网直连"
              pill={
                <StateTag
                  label={connected ? "服务在跑" : "服务没起来"}
                  tone={connected ? "signal" : "danger"}
                />
              }
              className="shrink-0"
              footer={
                <>
                  <CardHint>手机与电脑需在同一 Wi-Fi；企业网用扫码。</CardHint>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => nav.goSystem("connection")}
                  >
                    连接手机
                  </Button>
                </>
              }
            >
              <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-[8px] border border-border bg-popover px-2.5 py-1.5 font-mono text-[11px]">
                  {address ?? "…"}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={!address}
                  onClick={() => void handleCopy()}
                >
                  {copied ? "已复制" : "复制"}
                </Button>
              </div>
              <MetaRow
                label="UDP 自动发现"
                value={discoveryPort !== null ? `${discoveryPort} · 监听中` : "未开启"}
                mono
              />
              <MetaRow label="手机连接" value={`${devices} 台设备（近似值）`} mono />
            </Card>

            <Card
              title={
                <>
                  <Plug aria-hidden="true" />
                  AI 联动
                </>
              }
              subtitle={`DSH HOOK · ${describeHookStatus(hookStatus).label}`}
              pill={
                <StateTag
                  label={describeHookStatus(hookStatus).label}
                  tone={HOOK_TONE[describeHookStatus(hookStatus).tone]}
                />
              }
              className="min-h-0 flex-1"
              footer={
                <>
                  <CardHint>只同步状态与会话标题，不发送提示词、回复或路径。</CardHint>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => nav.goSystem("hook")}
                  >
                    打开联动设置
                  </Button>
                </>
              }
            >
              {hookStatus ? (
                <>
                  <MetaRow label="最近心跳" value={formatHookHeartbeat(hookStatus)} />
                  <MetaRow label="进行中会话" value={`${hookStatus.sessions} 个`} />
                  <MetaRow
                    label="等你决定"
                    value={`${rows.filter((row) => row.display === "asking").length} 个`}
                  />
                </>
              ) : (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  正在读取联动状态；开启后这里会显示 DSH 的心跳与会话数。
                </p>
              )}
            </Card>
          </div>
        </div>
      </PageBody>

      <PageFooter>
        <span>小跟班 Sidekick</span>
        <span>v0.1 · 深海声呐</span>
        <span className="ml-auto">局域网直连 · 数据只在本机</span>
      </PageFooter>
    </PageShell>
  );
}

function NowCard({
  connection,
  nav,
  status,
  aiState,
  asking,
  working,
  completed,
  devices,
  sessionCount,
}: {
  connection: DesktopConnection;
  nav: DesktopNav;
  status: ReturnType<typeof useDesktopStatusStore.getState>["status"];
  aiState: StatusState;
  asking: SessionRow | null;
  working: SessionRow | null;
  completed: SessionRow | null;
  devices: number;
  sessionCount: number;
}) {
  const phoneOffline = devices === 0;
  const tone = status ? AI_STATE_TONE[aiState] : "muted";
  const level = status ? AI_STATE_LEVEL[aiState] : 1;

  let label: string;
  let title: string;
  let meta: string;
  let action: ReactNode;

  if (connection.status === "error") {
    label = "服务没起来";
    title = "电脑服务没连上";
    meta = "先恢复本机服务；端口被占用时会自动顺延";
    action = (
      <Button type="button" size="sm" onClick={connection.retry}>
        重试
      </Button>
    );
  } else if (connection.status !== "connected") {
    label = "服务连接中";
    title = "正在连接本机服务…";
    meta = "窗口和服务一起启动，稍等几秒";
    action = (
      <Button type="button" variant="outline" size="sm" onClick={connection.retry}>
        重试
      </Button>
    );
  } else if (!status && phoneOffline) {
    label = "还没连上手机";
    title = "先连接手机，AI 状态和语音输入才能到手机";
    meta = "同一 Wi-Fi 打开 App 会自动发现；企业网用扫码";
    action = (
      <Button type="button" size="sm" onClick={() => nav.goSystem("connection")}>
        连接手机
      </Button>
    );
  } else if (!status) {
    label = "AI 还没开启联动";
    title = "开启 AI 联动，看 DeepSeek Harness 在做什么";
    meta = "只同步状态与会话标题，不读取对话内容";
    action = (
      <Button type="button" size="sm" onClick={() => nav.goSystem("hook")}>
        去开启联动
      </Button>
    );
  } else if (asking) {
    label = "等你决定";
    title = `${sessionTitle(asking)} · DSH 已暂停，等你的选择`;
    meta = `${asking.askKind === "approval" ? "等你审批" : "等你回答"} · ${rowTime(asking)}`;
    action = (
      <Button
        type="button"
        size="sm"
        className="border-decide/40 bg-decide/15 text-decide hover:bg-decide/25"
        onClick={() => nav.go("sessions")}
      >
        去看是谁在等
      </Button>
    );
  } else if (working) {
    label = "工作中";
    title = sessionTitle(working);
    meta = `${workingActionText(working.tool)} · ${rowTime(working)} · ${status.sessions} 个会话进行中`;
    action = (
      <Button type="button" variant="ghost" size="sm" onClick={() => nav.go("sessions")}>
        查看会话
      </Button>
    );
  } else if (completed) {
    label = "完成";
    title = `${sessionTitle(completed)} · 完成`;
    meta = `已推送到手机 · ${rowTime(completed)}`;
    action = (
      <Button type="button" variant="ghost" size="sm" onClick={() => nav.go("sessions")}>
        查看会话
      </Button>
    );
  } else {
    label = "空闲";
    title = "现在没有要处理的事";
    meta = sessionCount > 0 ? "会话都在空闲；下一轮开始时会出现在这里" : "还没有会话快照";
    action =
      sessionCount > 0 ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => nav.go("sessions")}>
          查看会话
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => nav.goSystem("hook")}>
          开启 AI 联动
        </Button>
      );
  }

  return (
    <section
      className={cn(
        "flex shrink-0 flex-col gap-2 rounded-[14px] border bg-card px-4 py-2.5",
        tone === "decide" && "border-decide/60",
        tone === "signal" && "border-signal/45",
        tone === "danger" && "border-destructive/50",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <SignalBars level={level} tone={tone === "danger" ? "danger" : tone} />
        <span
          className={cn(
            "shrink-0 text-[13px] font-semibold",
            tone === "decide" && "text-decide",
            tone === "signal" && "text-signal",
            tone === "success" && "text-success",
            tone === "danger" && "text-destructive",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          {label}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] leading-snug font-medium">{title}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {phoneOffline && connection.status === "connected" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => nav.goSystem("connection")}
            >
              连接手机
            </Button>
          )}
          {action}
        </div>
      </div>
    </section>
  );
}
