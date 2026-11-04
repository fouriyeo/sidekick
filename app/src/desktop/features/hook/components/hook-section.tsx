import { cn } from "cn";
import {
  ChevronDown,
  ListChecks,
  Loader2,
  Plug,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useDesktopStatusStore } from "@/desktop/lib/desktop-status-store";
import { Card, CardHint } from "@/desktop/shell/card";
import { type PageTone, StateTag } from "@/desktop/shell/page-chips";
import { formatRelativeTime } from "@/shared/lib/format";
import {
  displayStateText,
  rowTime,
  sessionTitle,
  visibleSessions,
  workingActionText,
} from "@/shared/lib/sessions";
import type { DshHookState } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import {
  defaultHookProfile,
  describeHookStatus,
  formatHookEventSource,
  formatHookHeartbeat,
  HOOK_STATE_LABELS,
  type HookStatusTone,
  useHookStore,
} from "../hook-store";

const TONE_PAGE: Record<HookStatusTone, PageTone> = {
  connected: "signal",
  waiting: "decide",
  error: "danger",
  muted: "muted",
};

const SIMULATE_OPTIONS: ReadonlyArray<{ state: DshHookState; label: string }> = [
  { state: "working", label: "工作中" },
  { state: "asking", label: "等你决定" },
  { state: "completed", label: "完成" },
  { state: "idle", label: "静态" },
];

const EVENT_MAPPING: ReadonlyArray<{ event: string; state: string }> = [
  { event: "turn/start", state: "工作中" },
  { event: "approval/asked · ask_user_question · exit_plan_mode", state: "等你决定" },
  { event: "approval/decided · 用户回复", state: "回工作中" },
  { event: "turn/end completed", state: "完成（3 秒）" },
  { event: "turn/end blocked", state: "等你决定" },
  { event: "error · aborted · 15 秒无心跳", state: "静态" },
];

type HookSectionProps = {
  onOpenSessions: () => void;
};

/**
 * 系统 › 联动：状态、AI 会话预览、诊断与隐私同页；断开态直接给三步排查。
 * 首次写入需要确认，写入后 profile 锁定；「模拟一次状态」只在 DEV 可见。
 */
export function HookSection({ onOpenSessions }: HookSectionProps) {
  const status = useHookStore((state) => state.status);
  const loading = useHookStore((state) => state.loading);
  const error = useHookStore((state) => state.error);
  const action = useHookStore((state) => state.busy);
  const refresh = useHookStore((state) => state.refresh);
  const install = useHookStore((state) => state.install);
  const setEnabled = useHookStore((state) => state.setEnabled);
  const remove = useHookStore((state) => state.remove);
  const simulate = useHookStore((state) => state.simulate);
  const clearError = useHookStore((state) => state.clearError);
  const sessionList = useDesktopStatusStore((state) => state.sessionList);

  const [profile, setProfile] = useState<string | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = describeHookStatus(status);
  const installed = status?.installed ?? false;
  const enabled = status?.enabled ?? false;
  const connected = status?.connected ?? false;
  // 已写入后不允许直接换 profile：旧 profile 的 patch 标记还在，静默重装会留下两份。
  const profileLocked = installed;
  const selectedProfile = profile ?? defaultHookProfile(status);
  const profiles = status?.profiles ?? [];
  const recentEvents = status?.recentEvents ?? [];
  const alert = error ?? status?.error ?? null;
  const installing = action === "install";
  const removing = action === "remove";
  const idle = action === null;

  const rows = visibleSessions(sessionList, {});
  const askingCount = rows.filter((row) => row.display === "asking").length;
  const preview = rows.slice(0, 5);

  function handleToggle(next: boolean) {
    if (!status) return;
    if (!status.installed) {
      // 首次开启：先确认写入了哪些文件，确认后再安装并开启。
      if (next) setInstallOpen(true);
      return;
    }
    void setEnabled(next);
  }

  async function confirmInstall() {
    const ok = await install(selectedProfile);
    if (ok) setProfile(null);
    // 失败也收起弹窗，让页面里的错误与「修复 / 重新写入」露出来。
    setInstallOpen(false);
  }

  async function confirmRemove() {
    const ok = await remove();
    if (ok) setProfile(null);
    setRemoveOpen(false);
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto pr-0.5 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
        <Card
          title={
            <>
              <Plug aria-hidden="true" />
              DeepSeek Harness
            </>
          }
          subtitle="LINK · DSH HOOK"
          pill={<StateTag label={summary.label} tone={TONE_PAGE[summary.tone]} />}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p aria-live="polite" className="text-xs leading-relaxed text-muted-foreground">
                {summary.detail}
              </p>
              {status?.pluginVersion !== null && status?.pluginVersion !== undefined && (
                <span className="mt-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  插件 v{status.pluginVersion}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Label htmlFor="dsh-hook-enabled" className="text-xs text-muted-foreground">
                启用
              </Label>
              <Switch
                id="dsh-hook-enabled"
                aria-label="启用 AI 联动"
                checked={enabled}
                disabled={!status || loading || !idle}
                onCheckedChange={handleToggle}
              />
            </div>
          </div>

          {status ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
              <MetaItem label="宠物状态" value={HOOK_STATE_LABELS[status.currentState]} />
              <MetaItem label="进行中会话" value={`${status.sessions} 个`} />
              <MetaItem label="最近心跳" value={formatHookHeartbeat(status)} />
              <MetaItem label="本机端点" value={status.endpoint ?? "连接后分配"} mono />
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">
              {loading ? "正在读取联动状态…" : "暂时读不到联动状态，点「刷新」重试。"}
            </p>
          )}

          {profiles.length > 1 && (
            <div className="rounded-lg border border-border bg-popover px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="dsh-hook-profile" className="text-xs text-muted-foreground">
                  DSH profile
                </Label>
                <select
                  id="dsh-hook-profile"
                  value={selectedProfile}
                  disabled={profileLocked || !idle}
                  onChange={(event) => setProfile(event.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {profiles.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.label}
                      {item.active ? " · 运行中" : ""}
                    </option>
                  ))}
                </select>
                {profileLocked ? (
                  <span className="text-[11px] text-muted-foreground">
                    切换 profile 请先移除联动
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    写入后不可直接切换，需先移除
                  </span>
                )}
              </div>
            </div>
          )}

          {!installed && (
            <div className="rounded-lg border border-border bg-popover px-3 py-2">
              <p className="text-xs font-medium">还没有写入联动</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                打开「启用」会先在本机写入配置、同步脚本和一小段 cordis 补丁；不会安装 npm
                包，只读取会话标题、状态与粗粒度工具类别，不读取对话正文或工具参数。
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                首次写入后需要重启一次 DeepSeek Harness。
              </p>
            </div>
          )}

          {installed && !enabled && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-popover px-3 py-2">
              <StateTag label="已暂停" tone="decide" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                联动已暂停：脚本停止上报，宠物回到静态；安装会保留，下次打开开关即可。
              </p>
            </div>
          )}

          {installed && enabled && !connected && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-popover px-3 py-2">
              <StateTag label="等待连接" tone="decide" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                已写入，等待 DeepSeek Harness
                重启/连接。启动后会自动出现「已连接」，不需要再点其他按钮。
              </p>
            </div>
          )}

          {connected && status?.lastEventAt === null && (
            <div className="rounded-lg border border-border bg-popover px-3 py-2">
              <p className="text-xs font-medium">已连接，还没有收到事件</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                在 DeepSeek Harness 里开始一轮对话后就会出现状态。如果一直没有，可能是 DSH
                版本更新导致事件变化，可以修复或移除联动。
              </p>
            </div>
          )}

          {alert && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            >
              <p className="font-medium">联动没有正常工作</p>
              <p className="mt-1 leading-relaxed">{alert}</p>
              <p className="mt-1 leading-relaxed text-destructive/80">
                下一步：先点「修复 / 重新写入」；如果 DSH 正在运行，重启一次再试。
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {status ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!idle}
                    onClick={() => setInstallOpen(true)}
                  >
                    修复 / 重新写入
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => void refresh()}
                  >
                    重试
                  </Button>
                )}
                {error && (
                  <Button type="button" variant="ghost" size="sm" onClick={clearError}>
                    知道了
                  </Button>
                )}
              </div>
            </div>
          )}

          <footer className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2">
            <CardHint>首次开启需要重启一次 DSH；之后热开关 1 秒内生效。</CardHint>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              disabled={loading}
              aria-label="刷新 AI 联动状态"
              onClick={() => void refresh()}
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              刷新
            </Button>
          </footer>
        </Card>

        <Card
          title={
            <>
              <ListChecks aria-hidden="true" />
              当前 AI 会话
            </>
          }
          subtitle="SESSIONS · 标题 ≤ 80 字 · 最多 50 条"
          pill={
            askingCount > 0 ? (
              <StateTag label={`${askingCount} 个待决定`} tone="decide" />
            ) : (
              <StateTag label={`${rows.length} 个`} tone="muted" />
            )
          }
          className="min-h-0 flex-1"
          bodyClassName="min-h-0"
          footer={
            <>
              <CardHint>完整列表与筛选在「会话」页；这里只做预览。</CardHint>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={onOpenSessions}
              >
                全部会话
              </Button>
            </>
          }
        >
          {preview.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              还没有会话快照。在 DSH 里开始一轮对话后会出现。
            </p>
          ) : (
            <ul className="flex min-h-0 list-none flex-col gap-1 overflow-y-auto p-0">
              {preview.map((row) => {
                const tone: PageTone =
                  row.display === "asking"
                    ? "decide"
                    : row.display === "working"
                      ? "signal"
                      : row.display === "completed"
                        ? "success"
                        : "muted";
                return (
                  <li
                    key={row.id}
                    className="flex min-h-9 items-center gap-2 rounded-lg border border-border bg-popover px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium">{sessionTitle(row)}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {row.display !== "working" && (
                          <StateTag label={displayStateText(row)} tone={tone} />
                        )}
                        {row.display === "working" && (
                          <span className="inline-flex min-w-0 items-center gap-1 truncate">
                            <Loader2 className="size-2.5 shrink-0 animate-spin" />
                            {workingActionText(row.tool)}
                          </span>
                        )}
                        <span className="shrink-0">{rowTime(row)}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
        {import.meta.env.DEV && (
          <Card title="模拟一次状态" subtitle="DEV ONLY · 会真的推送到手机" className="shrink-0">
            <div className="flex flex-wrap gap-1.5">
              {SIMULATE_OPTIONS.map((option) => (
                <Button
                  key={option.state}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!status || !idle}
                  aria-label={`模拟${option.label}`}
                  onClick={() => void simulate(option.state)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <CardHint>不需要启动 DeepSeek Harness 也能验收手机四态；会被下一次心跳覆盖。</CardHint>
          </Card>
        )}

        <details className="group shrink-0 rounded-[14px] border border-border bg-card p-3.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold">
            <span className="flex items-center gap-1.5">
              <ShieldCheck aria-hidden="true" className="size-3.5 text-muted-foreground" />
              高级诊断
              <span className="font-mono text-[9px] font-normal tracking-[0.1em] text-muted-foreground">
                状态映射 · 最近事件 · 隐私
              </span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>

          <div className="mt-3 flex flex-col gap-3">
            <section>
              <h3 className="text-sm font-semibold">状态怎么映射</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                DSH 只把事件映射成四种宠物状态，不读取事件内容。
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="pb-1 font-medium">DSH 事件</th>
                      <th className="pb-1 pl-3 font-medium">宠物状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {EVENT_MAPPING.map((row) => (
                      <tr key={row.event} className="border-t border-border">
                        <td className="py-1.5 pr-3 font-mono text-[10px] break-words text-muted-foreground">
                          {row.event}
                        </td>
                        <td className="py-1.5 pl-3 whitespace-nowrap text-foreground">
                          {row.state}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">最近事件</h3>
                <span className="text-[11px] text-muted-foreground">最多 20 条 · 不含内容</span>
              </div>
              {recentEvents.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  还没有收到事件。启动 DeepSeek Harness 并跑一轮对话试试。
                </p>
              ) : (
                <ul className="mt-2 flex list-none flex-col gap-1 p-0">
                  {recentEvents.map((event) => (
                    <li
                      key={`${event.at}-${event.state}-${event.sessions}-${event.source}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px]"
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-muted-foreground">
                          {formatRelativeTime(event.at)}
                        </span>
                        <span className="font-medium text-foreground">
                          {HOOK_STATE_LABELS[event.state]}
                        </span>
                        <span className="text-muted-foreground">{event.sessions} 个会话</span>
                      </span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {formatHookEventSource(event.source)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold">隐私边界</h3>
              <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                只同步状态、会话标题、当前工具类别、数量和事件时间；工具类别只取固定枚举，不含工具名原文、提示词、回复、工具参数或文件路径。桌面端只监听本机回环地址
                127.0.0.1，事件日志只保存在内存。
              </p>
            </section>

            <section>
              <h3 className="text-sm font-semibold">文件位置</h3>
              <dl className="mt-1.5 space-y-1.5 text-[11px]">
                <PathRow label="配置" value={status?.configPath} />
                <PathRow label="脚本" value={status?.pluginPath} />
                <PathRow label="补丁" value={status?.patchPath} />
              </dl>
            </section>
          </div>
        </details>

        <Card
          title="移除联动"
          subtitle="DESTRUCTIVE"
          className="shrink-0 border-destructive/30"
          footer={
            <>
              <CardHint>移除后 DSH 恢复原样，需要重启一次；之后可重新写入。</CardHint>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="shrink-0"
                disabled={!installed || !idle}
                onClick={() => setRemoveOpen(true)}
              >
                <Trash2 className="size-3.5" />
                移除联动
              </Button>
            </>
          }
        >
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            删除 Sidekick 写入的配置、同步脚本和 cordis 补丁标记；不会影响 DeepSeek Harness
            本身，下次启动不再加载。
          </p>
        </Card>

        <Card
          title="Claude Code / Qoder"
          subtitle="后续版本"
          className="shrink-0 border-dashed text-muted-foreground"
        >
          <p className="text-[11px] leading-relaxed">
            同类联动（开始工作 / 等你决定 / 完成）会在后续版本提供。
          </p>
        </Card>
      </div>

      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>写入 AI 联动？</DialogTitle>
            <DialogDescription>
              Sidekick 会在本机写入三处内容，不会安装 npm
              包；只读取会话标题、状态与粗粒度工具类别，不读取或上传对话正文或工具参数。
            </DialogDescription>
          </DialogHeader>
          <ul className="flex list-none flex-col gap-2 p-0 text-xs">
            <li>
              <code className="font-mono text-[11px] text-foreground">
                ~/.dsh/sidekick/config.json
              </code>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                联动开关与令牌，仅本机可读（0600）。
              </p>
            </li>
            <li>
              <code className="font-mono text-[11px] break-all text-foreground">
                ~/.dsh/profiles/&lt;profile&gt;/plugins/sidekick-hook.mjs
              </code>
              <p className="mt-0.5 text-[11px] text-muted-foreground">状态同步脚本。</p>
            </li>
            <li>
              <code className="font-mono text-[11px] break-all text-foreground">
                ~/.dsh/profiles/&lt;profile&gt;/cordis.patch.yml
              </code>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                只追加 sidekick 标记，写入前先备份，不动其他配置。
              </p>
            </li>
          </ul>
          {profiles.length > 1 && (
            <p className="text-[11px] text-muted-foreground">
              将写入 profile：
              {profiles.find((item) => item.name === selectedProfile)?.label ?? selectedProfile}
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            首次写入后需要重启一次 DeepSeek Harness；状态会通过本机回环地址 127.0.0.1 发送，之后每 5
            秒一次心跳。
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={installing}
              onClick={() => setInstallOpen(false)}
            >
              取消
            </Button>
            <Button type="button" disabled={installing} onClick={() => void confirmInstall()}>
              {installing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <PlugZap className="size-3.5" />
              )}
              写入联动
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>移除 AI 联动？</DialogTitle>
            <DialogDescription>
              会删除 Sidekick 写入的同步脚本、配置和 cordis.patch.yml 里的 sidekick
              标记，并先还原改动前的备份。DeepSeek Harness 本身不受影响。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={removing}
              onClick={() => setRemoveOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removing}
              onClick={() => void confirmRemove()}
            >
              {removing ? "正在移除…" : "确认移除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetaItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn("mt-0.5 truncate text-foreground", mono && "font-mono text-[10px]")}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function PathRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-8 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 font-mono text-[10px] break-all text-foreground/80">
        {value ?? "—"}
      </dd>
    </div>
  );
}
