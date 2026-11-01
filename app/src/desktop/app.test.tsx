import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/desktop/features/connect/components/connection-panel", () => ({
  ConnectionPanel: () => <div>connection-panel</div>,
}));
vi.mock("@/desktop/features/chat/components/chat-panel", () => ({
  ChatPanel: () => <div>chat-panel</div>,
}));
vi.mock("@/desktop/features/clipboard/components/clipboard-panel", () => ({
  ClipboardPanel: () => <div>clipboard-panel</div>,
}));
vi.mock("@/desktop/features/hook/components/hook-panel", () => ({
  HookPanel: () => <div>hook-panel</div>,
}));
vi.mock("@/desktop/features/settings/components/settings-sheet", () => ({
  SettingsSheet: () => null,
}));
vi.mock("@/desktop/features/mic-receiver/mic-status-overlay", () => ({
  MicStatusOverlay: () => null,
}));
vi.mock("./use-desktop-connection", () => ({
  useDesktopConnection: () => ({
    status: "connected",
    info: null,
    error: null,
    sendText: vi.fn(),
    retry: vi.fn(),
  }),
}));

import { DesktopApp } from "./app";

afterEach(cleanup);

describe("DesktopApp 视图切换", () => {
  it("默认聊天，可切到剪贴板和 AI 联动", () => {
    render(<DesktopApp />);

    expect(screen.getByText("chat-panel")).toBeInTheDocument();
    expect(screen.queryByText("clipboard-panel")).toBeNull();
    expect(screen.queryByText("hook-panel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "剪贴板" }));
    expect(screen.getByText("clipboard-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI 联动" }));
    expect(screen.getByText("hook-panel")).toBeInTheDocument();
    expect(screen.queryByText("clipboard-panel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "聊天" }));
    expect(screen.getByText("chat-panel")).toBeInTheDocument();
  });
});
