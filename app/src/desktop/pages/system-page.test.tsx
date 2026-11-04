import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/desktop/features/connect/components/connection-section", () => ({
  ConnectionSection: ({ qrOpen }: { qrOpen: boolean }) => (
    <div>connection-section:{qrOpen ? "qr-open" : "qr-closed"}</div>
  ),
}));
vi.mock("@/desktop/features/models/models-section", () => ({
  ModelsSection: () => <div>models-section</div>,
}));
vi.mock("@/desktop/features/hook/components/hook-section", () => ({
  HookSection: () => <div>hook-section</div>,
}));
vi.mock("@/desktop/features/chat/components/chat-section", () => ({
  ChatSection: () => <div>chat-section</div>,
}));

import { useDesktopClientsStore } from "@/desktop/lib/desktop-clients-store";
import type { DesktopNav, SystemSection } from "@/desktop/lib/desktop-nav";
import type { DesktopConnection } from "@/desktop/use-desktop-connection";
import { SystemPage } from "./system-page";

function makeConnection(overrides: Partial<DesktopConnection> = {}): DesktopConnection {
  return {
    status: "connected",
    info: {
      ip: "192.168.1.23",
      port: 47810,
      url: "http://192.168.1.23:47810",
      discoveryPort: 47820,
    },
    error: null,
    sendText: vi.fn(),
    cancelMic: vi.fn(),
    requestStatus: vi.fn(),
    requestFocus: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

function makeNav(): DesktopNav {
  return { go: vi.fn(), goSystem: vi.fn() };
}

function renderSystem(section: SystemSection = "connection") {
  const onSectionChange = vi.fn();
  render(
    <SystemPage
      connection={makeConnection()}
      section={section}
      onSectionChange={onSectionChange}
      nav={makeNav()}
    />,
  );
  return onSectionChange;
}

beforeEach(() => {
  useDesktopClientsStore.getState().reset();
});

afterEach(cleanup);

describe("SystemPage 四段切换", () => {
  it("默认连接段：页头标题、4 个分段与连接内容", () => {
    renderSystem("connection");

    expect(screen.getByRole("heading", { name: "连接" })).toBeInTheDocument();
    for (const label of ["连接", "语音", "联动", "消息"]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText("connection-section:qr-closed")).toBeInTheDocument();
  });

  it("切到语音 / 联动 / 消息，只渲染对应内容", () => {
    const onSectionChange = renderSystem("connection");

    fireEvent.click(screen.getByRole("tab", { name: "语音" }));
    expect(onSectionChange).toHaveBeenCalledWith("voice");

    fireEvent.click(screen.getByRole("tab", { name: "联动" }));
    expect(onSectionChange).toHaveBeenCalledWith("hook");

    fireEvent.click(screen.getByRole("tab", { name: "消息" }));
    expect(onSectionChange).toHaveBeenCalledWith("chat");
  });

  it("不同分段渲染对应内容与页头标题", () => {
    const { rerender } = render(
      <SystemPage
        connection={makeConnection()}
        section="voice"
        onSectionChange={vi.fn()}
        nav={makeNav()}
      />,
    );
    expect(screen.getByText("models-section")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "语音引擎" })).toBeInTheDocument();

    rerender(
      <SystemPage
        connection={makeConnection()}
        section="hook"
        onSectionChange={vi.fn()}
        nav={makeNav()}
      />,
    );
    expect(screen.getByText("hook-section")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI 联动" })).toBeInTheDocument();

    rerender(
      <SystemPage
        connection={makeConnection()}
        section="chat"
        onSectionChange={vi.fn()}
        nav={makeNav()}
      />,
    );
    expect(screen.getByText("chat-section")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "消息" })).toBeInTheDocument();
  });

  it("连接段页头「显示二维码」控制展开/收起", () => {
    renderSystem("connection");

    fireEvent.click(screen.getByRole("button", { name: "显示二维码" }));
    expect(screen.getByText("connection-section:qr-open")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起二维码" }));
    expect(screen.getByText("connection-section:qr-closed")).toBeInTheDocument();
  });

  it("连接段页头「重新搜索」触发重新读取连接信息", () => {
    const connection = makeConnection();
    render(
      <SystemPage
        connection={connection}
        section="connection"
        onSectionChange={vi.fn()}
        nav={makeNav()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "重新搜索" }));
    expect(connection.retry).toHaveBeenCalled();
  });
});
