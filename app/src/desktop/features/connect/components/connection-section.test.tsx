import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDesktopClientsStore } from "@/desktop/lib/desktop-clients-store";
import type { ServerInfo } from "@/protocol/messages";
import { ConnectionSection } from "./connection-section";

const qr = vi.hoisted(() => ({ toCanvas: vi.fn() }));

vi.mock("qrcode", () => ({ default: qr }));

const INFO: ServerInfo = {
  ip: "192.168.1.23",
  port: 47810,
  url: "http://192.168.1.23:47810",
  discoveryPort: 47820,
};

const writeText = vi.fn(() => Promise.resolve());

function renderSection(overrides: Partial<Parameters<typeof ConnectionSection>[0]> = {}) {
  return render(
    <ConnectionSection
      info={INFO}
      status="connected"
      error={null}
      onRetry={vi.fn()}
      qrOpen
      onToggleQr={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  qr.toCanvas.mockReset();
  qr.toCanvas.mockResolvedValue(undefined);
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  useDesktopClientsStore.setState({ clients: 2 });
});

afterEach(() => {
  cleanup();
  useDesktopClientsStore.setState({ clients: null });
});

describe("ConnectionSection 手机连接", () => {
  it("只显示服务 / 发现端口 / 在线设备三行短值", async () => {
    renderSection();

    expect(screen.getByText("服务")).toBeInTheDocument();
    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.getByText("发现端口")).toBeInTheDocument();
    expect(screen.getByText("UDP 47820")).toBeInTheDocument();
    expect(screen.getByText("在线设备")).toBeInTheDocument();
    expect(screen.getByText("1 台")).toBeInTheDocument();

    // 二维码渲染成卡内一块，下面一行地址。
    await waitFor(() => expect(qr.toCanvas).toHaveBeenCalled());
    expect(screen.getByRole("img", { name: "手机连接二维码" })).toBeInTheDocument();
    expect(screen.getByText("192.168.1.23:47810")).toBeInTheDocument();
    expect(screen.queryByText(/三种连接方式|推荐度|手动输入地址/)).not.toBeInTheDocument();
  });

  it("点地址行的复制按钮写入剪贴板并给出文字反馈", async () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: /复制地址/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("192.168.1.23:47810"));
    expect(screen.getByRole("button", { name: /复制地址/ })).toHaveTextContent("已复制");
  });

  it("二维码失败只留一行结论，地址仍可复制", async () => {
    qr.toCanvas.mockRejectedValueOnce(new Error("canvas unavailable"));
    renderSection();

    expect(await screen.findByText("二维码生成失败")).toBeInTheDocument();
    expect(screen.queryByText(/手动输入地址|排障|防火墙/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /复制地址/ })).toBeInTheDocument();
  });

  it("二维码收起时只留地址行，不重复页头按钮", () => {
    renderSection({ qrOpen: false });

    expect(screen.queryByRole("img", { name: "手机连接二维码" })).not.toBeInTheDocument();
    expect(screen.getByText("连接地址")).toBeInTheDocument();
    expect(screen.getByText("192.168.1.23:47810")).toBeInTheDocument();
    expect(screen.queryByText("二维码")).not.toBeInTheDocument();
  });

  it("错误态只有一行结论 + 重试，不展示错误详情", () => {
    const onRetry = vi.fn();
    renderSection({ status: "error", error: "server_info failed: boom", onRetry });

    expect(screen.getByText("连接失败")).toBeInTheDocument();
    expect(screen.queryByText(/server_info failed/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
