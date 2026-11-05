import { Clipboard, Info, Keyboard, SunMoon } from "lucide-react";
import { useEffect, useState } from "react";
import { useClipboardStore } from "@/desktop/features/clipboard/clipboard-store";
import { AccessibilityCard } from "@/desktop/features/settings/components/accessibility-card";
import { DESKTOP_NAV } from "@/desktop/lib/desktop-nav";
import { Card, CardHint, MetaRow } from "@/desktop/shell/card";
import { PageChip, StateTag } from "@/desktop/shell/page-chips";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageFooter, PageShell } from "@/desktop/shell/page-shell";
import { useTheme } from "@/shared/lib/theme";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { ThemeOptions } from "@/shared/ui/theme-options";

const THEME_LABEL = {
  system: "外观跟随系统",
  light: "外观浅色",
  dark: "外观深色",
} as const;

const SHORTCUTS = DESKTOP_NAV.map((item) => ({ key: item.shortcut, label: item.label }));

/**
 * 设置：外观 / 自动输入权限 / 剪贴板 / 关于与隐私 / 快捷键。
 * 只影响这台电脑，不改变手机设置；不做桌面 AI 音效试听（音效在手机端）。
 */
export function SettingsPage() {
  const { preference } = useTheme();
  const snapshot = useClipboardStore((state) => state.snapshot);
  const refresh = useClipboardStore((state) => state.refresh);
  const setEnabled = useClipboardStore((state) => state.setEnabled);
  const clear = useClipboardStore((state) => state.clear);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enabled = snapshot?.enabled ?? true;
  const count = snapshot?.items.length ?? 0;
  const maxItems = snapshot?.maxItems ?? 100;

  return (
    <PageShell>
      <PageHeader
        title="设置"
        description="外观、自动输入权限、剪贴板与隐私；这些设置只影响这台电脑，不改变手机设置。"
        chips={<PageChip label={THEME_LABEL[preference]} tone="signal" />}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => setPrivacyOpen(true)}>
            隐私说明
          </Button>
        }
      />

      <PageBody className="overflow-y-auto pr-0.5">
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <Card
              title={
                <>
                  <SunMoon aria-hidden="true" />
                  外观
                </>
              }
              subtitle="APPEARANCE · 双主题"
              pill={<StateTag label={THEME_LABEL[preference]} tone="signal" />}
            >
              <ThemeOptions />
              <CardHint>
                默认跟随系统（D76）；界面与手机宠物舞台一起跟随，切浅色后海玻璃舞台会变亮。
              </CardHint>
            </Card>

            <Card title="自动输入权限" subtitle="ACCESSIBILITY · MACOS" className="min-h-0">
              <AccessibilityCard showHeading={false} />
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <Card
              title={
                <>
                  <Clipboard aria-hidden="true" />
                  剪贴板历史
                </>
              }
              subtitle="CLIPBOARD · 只存本机"
              pill={
                <StateTag
                  label={enabled ? "正在记录" : "已暂停"}
                  tone={enabled ? "signal" : "muted"}
                />
              }
              footer={
                <>
                  <CardHint>点条目复制、置顶与全文都在「内容」页。</CardHint>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void setEnabled(!enabled)}
                    >
                      {enabled ? "暂停" : "继续"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={count === 0}
                      onClick={() => setConfirmOpen(true)}
                    >
                      清空
                    </Button>
                  </div>
                </>
              }
            >
              <MetaRow label="状态" value={enabled ? "正在记录" : "记录已暂停"} />
              <MetaRow label="当前 / 上限" value={`${count} / ${maxItems} 条`} mono />
              <MetaRow label="隐私过滤" value="密码框 / 隐藏类型不记录" />
            </Card>

            <Card
              title={
                <>
                  <Info aria-hidden="true" />
                  关于与隐私
                </>
              }
              subtitle="ABOUT · LOCAL ONLY"
              footer={
                <>
                  <CardHint>没有账号体系，也没有云同步。</CardHint>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setPrivacyOpen(true)}
                  >
                    完整隐私说明
                  </Button>
                </>
              }
            >
              <MetaRow label="版本" value="v0.1.0 · 深海声呐" mono />
              <MetaRow label="平台" value="macOS · 局域网直连" />
              <MetaRow label="数据目录" value="~/.sidekick/（0600）" mono />
              <MetaRow label="隐私" value="数据只在本机；识别音频发往百炼" />
            </Card>

            <Card
              title={
                <>
                  <Keyboard aria-hidden="true" />
                  快捷键
                </>
              }
              subtitle="KEYBOARD · 一级导航"
            >
              <ul className="flex list-none flex-col gap-1 p-0">
                {SHORTCUTS.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-popover px-2.5 py-1.5"
                  >
                    <span className="text-[11.5px] text-muted-foreground">{item.label}</span>
                    <kbd className="rounded-[5px] border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                      {item.key}
                    </kbd>
                  </li>
                ))}
              </ul>
              <CardHint>在任意页面按 ⌘1–⌘6 切换一级页；输入框里不会触发。</CardHint>
            </Card>
          </div>
        </div>
      </PageBody>

      <PageFooter>
        <span>小跟班 Sidekick</span>
        <span>v0.1 · 深海声呐</span>
        <span className="ml-auto">局域网直连 · 数据只在本机</span>
      </PageFooter>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <p className="font-mono text-[9px] tracking-[0.16em] text-destructive uppercase">
            确认 · 破坏性操作
          </p>
          <DialogHeader>
            <DialogTitle>清空剪贴板历史？</DialogTitle>
            <DialogDescription>所有记录都会被删除，且不能恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void clear().then(() => setConfirmOpen(false));
              }}
            >
              清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent>
          <p className="font-mono text-[9px] tracking-[0.16em] text-signal uppercase">隐私说明</p>
          <DialogHeader>
            <DialogTitle>数据只在本机</DialogTitle>
            <DialogDescription className="leading-relaxed">
              剪贴板、模型配置、用量与宠物数据都保存在
              ~/.sidekick/（0600）。语音输入时音频实时发送到阿里云百炼做转写，不落盘、不保存录音；AI
              联动只向手机发送状态与会话标题，不发送提示词、回复或工具内容。没有账号体系，也没有云同步。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setPrivacyOpen(false)}>
              知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
