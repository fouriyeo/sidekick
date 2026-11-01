import { cn } from "cn";
import { ChevronDown, Loader2, Plug, PlugZap, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/shared/lib/format";
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

const TONE_DOT_CLASS: Record<HookStatusTone, string> = {
  connected: "bg-success",
  waiting: "bg-warning",
  error: "bg-destructive",
  muted: "bg-muted-foreground/50",
};

const TONE_TEXT_CLASS: Record<HookStatusTone, string> = {
  connected: "text-success",
  waiting: "text-warning",
  error: "text-destructive",
  muted: "text-muted-foreground",
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

export function HookPanel() {
  const status = useHookStore((state) => state.status);
  const loading = useHookStore((state) => state.loading);
  const error = useHookStore((state) => state.error);
  const action = useHookStore((state) => state.busy);
  const init = useHookStore((state) => state.init);
  const refresh = useHookStore((state) => state.refresh);
  const install = useHookStore((state) => state.install);
  const setEnabled = useHookStore((state) => state.setEnabled);
  const remove = useHookStore((state) => state.remove);
  const simulate = useHookStore((state) => state.simulate);
  const clearError = useHookStore((state) => state.clearError);

  const [profile, setProfile] = useState<string | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  useEffect(() => {
    init();
    void refresh();
  }, [init, refresh]);

  const summary = describeHookStatus(status);
  const installed = status?.installed ?? false;
  const enabled = status?.enabled ?? false;
  const connected = status?.connected ?? false;
  // 已写入后不允许直接换 profile：旧 profile 的 patch 标记还在，静默重装会留下两份。
  // P0 让用户先移除联动，再选择新的 profile 写入。
  const profileLocked = installed;
  const selectedProfile = profile ?? defaultHookProfile(status);
  const profiles = status?.profiles ?? [];
  const recentEvents = status?.recentEvents ?? [];
  const alert = error ?? status?.error ?? null;
  const installing = action === "install";
  const removing = action === "remove";
  const idle = action === null;

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
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Plug className="size-4 text-muted-foreground" />
            AI 联动
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">把 AI 的工作状态同步给手机宠物</p>
        </div>
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
      </div>

      <div className="mt-4 flex flex-col gap-3.5">
        <section
          aria-label="DeepSeek Harness 联动"
          className="rounded-xl border border-border bg-background/40 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 inline-flex size-2 shrink-0 rounded-full",
                  TONE_DOT_CLASS[summary.tone],
                )}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">DeepSeek Harness</h3>
                  <span className={cn("text-xs font-medium", TONE_TEXT_CLASS[summary.tone])}>
                    {summary.label}
                  </span>
                  {status?.pluginVersion !== null && status?.pluginVersion !== undefined && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      插件 v{status.pluginVersion}
                    </span>
                  )}
                </div>
                <p
                  aria-live="polite"
                  className="mt-1 text-xs leading-relaxed text-muted-foreground"
                >
                  {summary.detail}
                </p>
              </div>
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
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
              <MetaItem label="宠物状态" value={HOOK_STATE_LABELS[status.currentState]} />
              <MetaItem label="进行中会话" value={`${status.sessions} 个`} />
              <MetaItem label="最近心跳" value={formatHookHeartbeat(status)} />
              <MetaItem label="本机端点" value={status.endpoint ?? "连接后分配"} mono />
            </dl>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              {loading ? "正在读取联动状态…" : "暂时读不到联动状态，点「刷新」重试。"}
            </p>
          )}

          {profiles.length > 1 && (
            <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="dsh-hook-profile" className="text-xs text-muted-foreground">
                  DSH profile
                </Label>
                <select
                  id="dsh-hook-profile"
                  value={selectedProfile}
                  disabled={profileLocked || !idle}
                  onChange={(event) => setProfile(event.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
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
            <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-xs font-medium">还没有写入联动</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                打开「启用」会先在本机写入配置、同步脚本和一小段 cordis 补丁；不会安装 npm
                包，也不会读取对话内容。
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                首次写入后需要重启一次 DeepSeek Harness。
              </p>
            </div>
          )}

          {installed && !enabled && (
            <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              联动已暂停：脚本停止上报，宠物回到静态；安装会保留，下次打开开关即可。
            </p>
          )}

          {installed && enabled && !connected && (
            <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
              已写入，等待 DeepSeek Harness
              重启/连接。启动后会自动出现「已连接」，不需要再点其他按钮。
            </p>
          )}

          {connected && status?.lastEventAt === null && (
            <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
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
              className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
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
        </section>

        <section className="rounded-xl border border-border bg-background/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">模拟一次状态</h3>
            <span className="text-[11px] text-muted-foreground">会真的推送到手机</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
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
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            不需要启动 DeepSeek Harness 也能验收手机四态；模拟状态会被下一次 DSH 心跳覆盖。
          </p>
        </section>

        <section className="rounded-xl border border-border bg-background/40 p-4">
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
                    <td className="py-1.5 pl-3 whitespace-nowrap text-foreground">{row.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-background/40 p-4">
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
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-[11px]"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-muted-foreground">{formatRelativeTime(event.at)}</span>
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

        <details className="group rounded-xl border border-border bg-background/40 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
            文件位置
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <dl className="mt-2 space-y-1.5 text-[11px]">
            <PathRow label="配置" value={status?.configPath} />
            <PathRow label="脚本" value={status?.pluginPath} />
            <PathRow label="补丁" value={status?.patchPath} />
          </dl>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            只同步状态、会话数和时间；不含提示词、对话内容或文件路径。桌面端只监听本机回环地址
            127.0.0.1，事件日志只保存在内存。
          </p>
        </details>

        <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">移除联动</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              删除 Sidekick 写入的配置、同步脚本和 cordis 补丁标记；不会影响 DeepSeek Harness
              本身，下次启动不再加载。
            </p>
          </div>
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
        </div>

        <section className="rounded-xl border border-dashed border-border bg-background/20 p-4 text-muted-foreground">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Claude Code / Qoder</h3>
              <p className="mt-1 text-[11px] leading-relaxed">
                同类联动（开始工作 / 等你决定 / 完成）会在后续版本提供。
              </p>
            </div>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">
              后续版本
            </span>
          </div>
        </section>
      </div>

      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>写入 AI 联动？</DialogTitle>
            <DialogDescription>
              Sidekick 会在本机写入三处内容，不会安装 npm 包，也不会读取或上传任何对话内容。
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
    </section>
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
