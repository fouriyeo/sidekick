import { Info, Keyboard, MessageCircle, Palette, Plug, Smartphone } from "lucide-react";
import { useState } from "react";
import { ChatSection } from "@/desktop/features/chat/components/chat-section";
import { ConnectionSection } from "@/desktop/features/connect/components/connection-section";
import { HookSection } from "@/desktop/features/hook/components/hook-section";
import { describeHookStatus, useHookStore } from "@/desktop/features/hook/hook-store";
import { AccessibilityCard } from "@/desktop/features/settings/components/accessibility-card";
import {
  DESKTOP_NAV,
  type DesktopNav,
  SETTINGS_SECTION_TITLE,
  type SettingsSection,
} from "@/desktop/lib/desktop-nav";
import { ListActionRow, ListGroup, ListRow } from "@/desktop/shell/list";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageShell } from "@/desktop/shell/page-shell";
import type { DesktopConnection } from "@/desktop/use-desktop-connection";
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

type SettingsPageProps = {
  connection: DesktopConnection;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  nav: DesktopNav;
};

/**
 * 设置：一张 iOS 分组列表，点进二级页再返回。
 *
 * 首页只放「会改的东西」：外观、自动输入、手机连接、AI 联动、关于；
 * 每一项右侧只有一个短值，不放解释性长句。二级页共用同一个返回壳。
 * 语音是独立一级页（D104）；剪贴板也是独立一级页，历史与设置都在那一页（D119），
 * 设置里不再有剪贴板行与二级页。
 */
export function SettingsPage({ connection, section, onSectionChange, nav }: SettingsPageProps) {
  if (section === "root") {
    return <SettingsRoot connection={connection} onSectionChange={onSectionChange} />;
  }

  const title = SETTINGS_SECTION_TITLE[section];
  return (
    <PageShell transition="push">
      <PageHeader title={title} backLabel="设置" onBack={() => onSectionChange("root")} />
      <PageBody>
        <div key={section} className="flex flex-col gap-6">
          {section === "connection" && <ConnectionSettings connection={connection} />}
          {section === "hook" && <HookSection />}
          {section === "accessibility" && <AccessibilityCard showHeading={false} />}
          {section === "about" && <AboutSettings />}
          {section === "messages" && (
            <ChatSection
              onSend={connection.sendText}
              info={connection.info}
              status={connection.status}
              onOpenOverview={() => nav.go("overview")}
              onOpenConnection={() => onSectionChange("connection")}
            />
          )}
        </div>
      </PageBody>
    </PageShell>
  );
}

function SettingsRoot({
  connection,
  onSectionChange,
}: {
  connection: DesktopConnection;
  onSectionChange: (section: SettingsSection) => void;
}) {
  const hookStatus = useHookStore((state) => state.status);

  const connected = connection.status === "connected";
  const address = connection.info ? `${connection.info.ip}:${connection.info.port}` : null;
  const hookLabel = describeHookStatus(hookStatus).label;

  return (
    <PageShell>
      <PageHeader title="设置" />
      <PageBody>
        <ListGroup>
          <ListRow
            icon={<Palette aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
            iconTone="purple"
            title="外观"
            control={<ThemeOptions className="w-[188px]" />}
          />
          <ListRow
            icon={<Keyboard aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
            iconTone="blue"
            title="自动输入"
            meta="辅助功能"
            chevron
            onClick={() => onSectionChange("accessibility")}
          />
        </ListGroup>

        <ListGroup title="功能">
          <ListRow
            icon={<Smartphone aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
            iconTone="green"
            title="手机连接"
            meta={connected ? (address ?? "已连接") : "未启动"}
            mono={connected}
            chevron
            onClick={() => onSectionChange("connection")}
          />
          <ListRow
            icon={<Plug aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
            iconTone="teal"
            title="AI 联动"
            meta={hookLabel}
            chevron
            onClick={() => onSectionChange("hook")}
          />
        </ListGroup>

        <ListGroup title="关于">
          <ListRow
            icon={<Info aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
            iconTone="gray"
            title="关于本机"
            meta="v0.1.0"
            chevron
            onClick={() => onSectionChange("about")}
          />
          <ListRow
            icon={<MessageCircle aria-hidden="true" className="size-[16px]" strokeWidth={2.2} />}
            iconTone="gray"
            title="消息通道"
            meta="调试"
            chevron
            onClick={() => onSectionChange("messages")}
          />
        </ListGroup>
      </PageBody>
    </PageShell>
  );
}

function ConnectionSettings({ connection }: { connection: DesktopConnection }) {
  const [qrOpen, setQrOpen] = useState(true);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="dsl-action-group mb-4 flex items-center justify-end self-end">
        <Button type="button" variant="outline" size="sm" onClick={connection.retry}>
          重新搜索
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={qrOpen}
          onClick={() => setQrOpen((open) => !open)}
        >
          {qrOpen ? "收起二维码" : "二维码"}
        </Button>
      </div>
      <ConnectionSection
        info={connection.info}
        status={connection.status}
        error={connection.error}
        onRetry={connection.retry}
        qrOpen={qrOpen}
        onToggleQr={() => setQrOpen((open) => !open)}
      />
    </div>
  );
}

function AboutSettings() {
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <>
      <ListGroup>
        <ListRow title="版本" meta="0.1.0 · 简约 iOS" />
        <ListRow title="平台" meta="macOS · 局域网直连" />
        <ListRow title="数据目录" meta="~/.sidekick" mono />
      </ListGroup>

      <ListGroup title="隐私">
        <ListActionRow onClick={() => setPrivacyOpen(true)}>隐私说明</ListActionRow>
      </ListGroup>

      <ListGroup title="快捷键">
        {DESKTOP_NAV.map((item) => (
          <ListRow key={item.id} title={item.label} meta={item.shortcut} mono />
        ))}
      </ListGroup>

      <p className="px-1 text-[12px] leading-[1.45] text-muted-foreground">
        数据只在本机；语音识别时音频实时发送到百炼。
      </p>

      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent>
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
    </>
  );
}
