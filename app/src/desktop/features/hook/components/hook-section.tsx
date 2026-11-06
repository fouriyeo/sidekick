import { Loader2, RefreshCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { ListActionRow, ListEmpty, ListGroup, ListRow } from "@/desktop/shell/list";
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
import { Switch } from "@/shared/ui/switch";
import {
  defaultHookProfile,
  describeHookStatus,
  formatHookHeartbeat,
  useHookStore,
} from "../hook-store";

/** 诊断组展开/收起：高度 + 透明度过渡；reduce-motion 下直接出现。 */
const EXPAND_TRANSITION = { duration: 0.22, ease: [0.2, 0.9, 0.25, 1] } as const;

const SIMULATE_OPTIONS: ReadonlyArray<{ state: DshHookState; label: string }> = [
  { state: "working", label: "工作中" },
  { state: "asking", label: "等你决定" },
  { state: "completed", label: "完成" },
  { state: "idle", label: "静态" },
];

/**
 * 设置 › AI 联动（DSH hook）：三组 iOS 列表。
 *
 * 状态（联动状态 / 插件版本 / profile / 最近心跳）→ 开关与安装 → 诊断；
 * 错误态才出现诊断组，DEV 才出现模拟按钮。写入与移除都走二次确认弹窗。
 * 隐私承诺只留一句：只发状态和会话标题。
 */
export function HookSection() {
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
  const reduced = useReducedMotion();

  const [profile, setProfile] = useState<string | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = describeHookStatus(status);
  const installed = status?.installed ?? false;
  const enabled = status?.enabled ?? false;
  // 已写入后不允许直接换 profile：旧 profile 的 patch 标记还在，静默重装会留下两份。
  const profileLocked = installed;
  const selectedProfile = profile ?? defaultHookProfile(status);
  const profiles = status?.profiles ?? [];
  const selectedProfileLabel =
    profiles.find((item) => item.name === selectedProfile)?.label ?? selectedProfile;
  const alert = error ?? status?.error ?? null;
  const installing = action === "install";
  const removing = action === "remove";
  const idle = action === null;

  function handleToggle(next: boolean) {
    if (!status) return;
    if (!status.installed) {
      // 首次开启：先确认写入，确认后再安装并开启。
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
    <>
      <ListGroup
        title="状态"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading}
            aria-label="刷新 AI 联动状态"
            onClick={() => void refresh()}
          >
            {loading ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-3.5" />
            )}
            刷新
          </Button>
        }
      >
        {status ? (
          <>
            <ListRow
              title="联动状态"
              meta={<span aria-live="polite">{summary.label}</span>}
              tone={summary.tone === "error" ? "danger" : "default"}
            />
            <ListRow
              title="插件版本"
              meta={status.pluginVersion === null ? "—" : `v${status.pluginVersion}`}
              mono
            />
            {profiles.length > 1 ? (
              <ListRow
                title="DSH profile"
                detail={profileLocked ? "已写入，先移除再切换" : undefined}
                control={
                  <select
                    aria-label="DSH profile"
                    value={selectedProfile}
                    disabled={profileLocked || !idle}
                    onChange={(event) => setProfile(event.target.value)}
                    className="max-w-[170px]"
                  >
                    {profiles.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.label}
                        {item.active ? " · 运行中" : ""}
                      </option>
                    ))}
                  </select>
                }
              />
            ) : (
              <ListRow title="DSH profile" meta={selectedProfileLabel} />
            )}
            <ListRow title="最近心跳" meta={formatHookHeartbeat(status)} />
          </>
        ) : (
          <ListEmpty>{loading ? "正在读取…" : "读不到联动状态"}</ListEmpty>
        )}
      </ListGroup>

      <ListGroup title="开关与安装">
        <ListRow
          title="启用联动"
          control={
            <Switch
              aria-label="启用 AI 联动"
              checked={enabled}
              disabled={!status || loading || !idle}
              onCheckedChange={handleToggle}
            />
          }
        />
        {installed ? (
          <ListActionRow tone="danger" disabled={!idle} onClick={() => setRemoveOpen(true)}>
            移除联动
          </ListActionRow>
        ) : (
          <ListActionRow
            disabled={!status || loading || !idle}
            onClick={() => setInstallOpen(true)}
          >
            写入联动
          </ListActionRow>
        )}
      </ListGroup>

      <AnimatePresence initial={false}>
        {(alert || import.meta.env.DEV) && (
          <motion.div
            key="diagnose"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduced ? { duration: 0 } : EXPAND_TRANSITION}
            className="overflow-hidden"
          >
            <ListGroup title="诊断">
              {alert && (
                <div role="alert" className="dsl-row">
                  <span className="min-w-0 flex-1 text-[13px] leading-[1.45] text-destructive">
                    {alert}
                  </span>
                </div>
              )}
              {alert && status && (
                <ListActionRow disabled={!idle} onClick={() => setInstallOpen(true)}>
                  修复 / 重新写入
                </ListActionRow>
              )}
              {alert && !status && (
                <ListActionRow disabled={loading} onClick={() => void refresh()}>
                  重试
                </ListActionRow>
              )}
              {error && (
                <ListActionRow tone="default" onClick={clearError}>
                  知道了
                </ListActionRow>
              )}
              {import.meta.env.DEV && (
                <div className="dsl-row">
                  <div className="flex w-full flex-col gap-2">
                    <span className="text-[13px] text-muted-foreground">模拟一次状态</span>
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
                  </div>
                </div>
              )}
            </ListGroup>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="px-1.5 text-[13px] leading-[1.45] text-muted-foreground">
        只发状态和会话标题。
      </p>

      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>写入 AI 联动？</DialogTitle>
            <DialogDescription>写入后需要重启一次 DeepSeek Harness。</DialogDescription>
          </DialogHeader>
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
              {installing ? "正在写入…" : "确认写入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>移除 AI 联动？</DialogTitle>
            <DialogDescription>
              删除 Sidekick 写入的配置、脚本与补丁标记，DeepSeek Harness 本身不受影响。
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
    </>
  );
}
