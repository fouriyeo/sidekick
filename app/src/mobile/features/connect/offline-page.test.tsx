import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useUiStore } from "@/mobile/ui-store";
import { SERVER_ADDR_KEY } from "@/shared/lib/local-storage";
import { OfflinePage } from "./offline-page";

const tauri = vi.hoisted(() => ({
  connectServer: vi.fn(async () => undefined),
  discoverServers: vi.fn(async () => [] as unknown[]),
}));

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  connectServer: tauri.connectServer,
  discoverServers: tauri.discoverServers,
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

const LAPTOP = {
  name: "开发者的 MacBook",
  ip: "192.168.1.5",
  port: 47810,
  addr: "192.168.1.5:47810",
};

beforeEach(() => {
  localStorage.clear();
  window.localStorage.clear();
  useUiStore.setState({ view: "offline", scanOpen: false, offlineReturnView: "pet" });
  useConnectionStore.setState({
    addr: "",
    status: "disconnected",
    error: null,
    hydrated: true,
    devices: [],
    discovering: false,
    hasDiscovered: false,
    discoverError: null,
    retryAttempt: 0,
    retryAt: null,
    retrying: false,
    retryPaused: true,
  });
  useConnectionStore.getState().pauseRetry();
  tauri.connectServer.mockReset();
  tauri.connectServer.mockResolvedValue(undefined);
  tauri.discoverServers.mockReset();
  tauri.discoverServers.mockResolvedValue([]);
});

afterEach(() => {
  useConnectionStore.getState().pauseRetry();
  cleanup();
});

describe("OfflinePage 扫码与手动地址", () => {
  it("扫码是主按钮，打开全屏扫码页", () => {
    render(<OfflinePage />);

    fireEvent.click(screen.getByRole("button", { name: "扫码连接" }));
    expect(useUiStore.getState().scanOpen).toBe(true);
  });

  it("手动地址可展开，连接后保存地址", async () => {
    render(<OfflinePage />);

    expect(screen.queryByLabelText("电脑地址")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /手动输入地址/ }));
    fireEvent.change(screen.getByLabelText("电脑地址"), {
      target: { value: "10.0.0.9:47810" },
    });
    fireEvent.click(screen.getByRole("button", { name: "连接" }));

    await waitFor(() => expect(tauri.connectServer).toHaveBeenCalledWith("10.0.0.9:47810"));
    expect(localStorage.getItem(SERVER_ADDR_KEY)).toBe("10.0.0.9:47810");
  });

  it("自动发现到的电脑列表可以点按连接", () => {
    useConnectionStore.setState({ devices: [LAPTOP], hasDiscovered: true });
    render(<OfflinePage />);

    expect(screen.getByText("开发者的 MacBook")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "连接 开发者的 MacBook" }));
    expect(tauri.connectServer).toHaveBeenCalledWith("192.168.1.5:47810");
  });
});

describe("OfflinePage 状态与排障", () => {
  it("搜索中显示「正在找电脑…」", () => {
    useConnectionStore.setState({ discovering: true });
    render(<OfflinePage />);

    expect(screen.getByText("正在找电脑…")).toBeInTheDocument();
    expect(screen.getByText(/同一 Wi-Fi 下通常 1–2 秒完成/)).toBeInTheDocument();
  });

  it("0 台时给出原因与 Android 16+ 局域网权限提示", () => {
    useConnectionStore.setState({ hasDiscovered: true, devices: [] });
    render(<OfflinePage />);

    expect(screen.getAllByText("附近没有电脑").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/0 台电脑回应/)).toBeInTheDocument();
    expect(screen.getByText(/Android 16\+ 需要允许「附近的设备」/)).toBeInTheDocument();
  });

  it("连接失败显示原因与下一步", () => {
    useConnectionStore.setState({ status: "error", error: "连接失败: Connection refused" });
    render(<OfflinePage />);

    expect(screen.getByText("连不上电脑")).toBeInTheDocument();
    expect(screen.getByText(/Connection refused/)).toBeInTheDocument();
    expect(screen.getByText(/下一步：确认电脑端 Sidekick 正在运行/)).toBeInTheDocument();
  });

  it("上次地址可以直接连接", () => {
    useConnectionStore.setState({ addr: "192.168.1.8:47810" });
    render(<OfflinePage />);

    expect(screen.getByText("上次连过")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "直接连接" }));
    expect(tauri.connectServer).toHaveBeenCalledWith("192.168.1.8:47810");
  });

  it("重新搜索与立即重连都会重新发现", async () => {
    useConnectionStore.setState({ hasDiscovered: true, retryPaused: false });
    render(<OfflinePage />);

    const before = tauri.discoverServers.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "重新搜索" }));
    await waitFor(() => expect(tauri.discoverServers.mock.calls.length).toBe(before + 1));

    fireEvent.click(screen.getByRole("button", { name: "立即重连" }));
    await waitFor(() =>
      expect(tauri.discoverServers.mock.calls.length).toBeGreaterThanOrEqual(before + 2),
    );
  });

  it("显示自动重连倒计时", () => {
    useConnectionStore.setState({
      hasDiscovered: true,
      retryPaused: false,
      retryAttempt: 2,
      retryAt: Date.now() + 5000,
    });
    render(<OfflinePage />);

    expect(screen.getByText(/秒后自动重连（第 2 次）/)).toBeInTheDocument();
  });

  it("返回按钮回到打开连接页的上一页", () => {
    render(<OfflinePage />);

    fireEvent.click(screen.getByRole("button", { name: "返回上一页" }));
    expect(useUiStore.getState().view).toBe("pet");
  });

  it("已连接时显示当前地址", () => {
    act(() => {
      useConnectionStore.setState({ status: "connected", addr: "192.168.1.5:47810" });
    });
    render(<OfflinePage />);

    expect(screen.getByText("已连接 · 电脑")).toBeInTheDocument();
    expect(screen.getByText(/192\.168\.1\.5:47810/)).toBeInTheDocument();
  });
});
