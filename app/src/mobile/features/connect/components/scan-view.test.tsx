import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBackHandlers, handleBack } from "@/mobile/system-back";

const scan = vi.hoisted(() => ({
  startScan: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("../scan-camera", () => ({
  startScan: scan.startScan,
}));

const connection = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock("../connection-store", () => ({
  useConnectionStore: (selector: (state: { connect: typeof connection.connect }) => unknown) =>
    selector({ connect: connection.connect }),
}));

const { ScanView } = await import("./scan-view");

function renderScan(onClose = vi.fn()) {
  return render(<ScanView open onClose={onClose} />);
}

describe("ScanView", () => {
  beforeEach(() => {
    scan.startScan.mockReset();
    scan.stop.mockReset();
    connection.connect.mockReset();
    connection.connect.mockResolvedValue(null);
    scan.startScan.mockResolvedValue({ stop: scan.stop });
    clearBackHandlers();
  });

  afterEach(() => {
    cleanup();
    clearBackHandlers();
  });

  it("打开时启动相机", async () => {
    renderScan();
    await waitFor(() => expect(scan.startScan).toHaveBeenCalledTimes(1));
    expect(scan.startScan.mock.calls[0][0].video).toBeInstanceOf(HTMLVideoElement);
  });

  it("扫到电脑二维码时按 ip:端口 发起连接并关闭", async () => {
    const onClose = vi.fn();
    renderScan(onClose);
    await waitFor(() => expect(scan.startScan).toHaveBeenCalled());

    const { onResult } = scan.startScan.mock.calls[0][0];
    act(() => onResult("http://192.168.1.5:47810"));

    await waitFor(() => expect(connection.connect).toHaveBeenCalledWith("192.168.1.5:47810"));
    expect(scan.stop).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("扫到非 Sidekick 二维码时提示并继续扫，不发起连接", async () => {
    renderScan();
    await waitFor(() => expect(scan.startScan).toHaveBeenCalled());

    const { onResult } = scan.startScan.mock.calls[0][0];
    act(() => onResult("https://example.com/abc"));

    expect(await screen.findByText(/这不是 Sidekick 的电脑二维码/)).toBeTruthy();
    expect(connection.connect).not.toHaveBeenCalled();
    expect(scan.stop).not.toHaveBeenCalled();
  });

  it("拒绝相机权限时给出提示", async () => {
    renderScan();
    await waitFor(() => expect(scan.startScan).toHaveBeenCalled());

    const { onError } = scan.startScan.mock.calls[0][0];
    act(() => onError("permission_denied"));

    expect(await screen.findByText(/需要相机权限才能扫码/)).toBeTruthy();
  });

  it("关闭按钮会释放相机", async () => {
    const onClose = vi.fn();
    renderScan(onClose);
    await waitFor(() => expect(scan.startScan).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("系统返回键消费掉这次返回并关闭页面", async () => {
    const onClose = vi.fn();
    renderScan(onClose);
    await waitFor(() => expect(scan.startScan).toHaveBeenCalled());

    const consumed = handleBack();

    expect(consumed).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });
});
