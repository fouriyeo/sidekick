import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MicStatusOverlay } from "./mic-status-overlay";
import { useDesktopMicStore } from "./mic-status-store";

function renderOverlay(onCancel = vi.fn(() => true)) {
  render(<MicStatusOverlay onCancel={onCancel} />);
  return onCancel;
}

beforeEach(() => {
  useDesktopMicStore.setState({
    phase: "listening",
    session: "session-1",
    startedAt: Date.now(),
    message: "",
    visible: true,
    partialText: "帮我把这段异步的注释",
    partialRev: 2,
  });
});

afterEach(() => {
  cleanup();
  useDesktopMicStore.getState().reset();
});

describe("MicStatusOverlay 流式回显", () => {
  it("显示计时、来源徽标和实时文本", () => {
    renderOverlay();

    expect(screen.getByText(/正在听/)).toBeInTheDocument();
    expect(screen.getByText("百炼")).toBeInTheDocument();
    expect(screen.getByText("帮我把这段异步的注释")).toBeInTheDocument();
  });

  it("转写中保留最后一段实时文本", () => {
    useDesktopMicStore.setState({ phase: "processing" });
    renderOverlay();

    expect(screen.getByText("转写中…")).toBeInTheDocument();
    expect(screen.getByText("帮我把这段异步的注释")).toBeInTheDocument();
  });

  it("结果阶段只显示最终文案，不再出现本机回退提示", () => {
    useDesktopMicStore.setState({
      phase: "delivered",
      message: "已输入",
    });
    renderOverlay();

    expect(screen.getByText("已输入")).toBeInTheDocument();
    expect(screen.queryByText(/本机转写/)).toBeNull();
  });
});

describe("MicStatusOverlay 电脑端中断入口", () => {
  it("正在听时提供「取消录音」，点击把当前 session 交给服务端", () => {
    const onCancel = renderOverlay();

    fireEvent.click(screen.getByRole("button", { name: "取消录音" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith("session-1");
  });

  it("转写中/已输入不显示取消按钮", () => {
    useDesktopMicStore.setState({ phase: "processing" });
    renderOverlay();
    expect(screen.queryByRole("button", { name: "取消录音" })).toBeNull();
    cleanup();

    useDesktopMicStore.setState({ phase: "delivered", message: "已输入" });
    renderOverlay();
    expect(screen.queryByRole("button", { name: "取消录音" })).toBeNull();
  });

  it("本机 WS 没连上时给出重试提示", () => {
    renderOverlay(vi.fn(() => false));

    fireEvent.click(screen.getByRole("button", { name: "取消录音" }));

    expect(screen.getByText("电脑端服务没连上，稍后再试。")).toBeInTheDocument();
  });

  it("取消后浮层清空，按钮消失", () => {
    renderOverlay();

    act(() => {
      useDesktopMicStore.setState({
        phase: "idle",
        session: null,
        startedAt: null,
        message: "已取消",
        visible: true,
      });
    });

    expect(screen.queryByRole("button", { name: "取消录音" })).toBeNull();
    expect(screen.getByText("已取消")).toBeInTheDocument();
  });
});
