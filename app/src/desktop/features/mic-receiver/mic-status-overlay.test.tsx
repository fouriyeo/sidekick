import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MicStatusOverlay } from "./mic-status-overlay";
import { useDesktopMicStore } from "./mic-status-store";

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
    render(<MicStatusOverlay />);

    expect(screen.getByText(/正在听/)).toBeInTheDocument();
    expect(screen.getByText("百炼")).toBeInTheDocument();
    expect(screen.getByText("帮我把这段异步的注释")).toBeInTheDocument();
  });

  it("转写中保留最后一段实时文本", () => {
    useDesktopMicStore.setState({ phase: "processing" });
    render(<MicStatusOverlay />);

    expect(screen.getByText("转写中…")).toBeInTheDocument();
    expect(screen.getByText("帮我把这段异步的注释")).toBeInTheDocument();
  });

  it("结果阶段只显示最终文案，不再出现本机回退提示", () => {
    useDesktopMicStore.setState({
      phase: "delivered",
      message: "已输入",
    });
    render(<MicStatusOverlay />);

    expect(screen.getByText("已输入")).toBeInTheDocument();
    expect(screen.queryByText(/本机转写/)).toBeNull();
  });
});
