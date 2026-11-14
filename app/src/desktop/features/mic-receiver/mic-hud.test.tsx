import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteHudPayload } from "@/protocol/remote-mic";

const tauri = vi.hoisted(() => ({
  subscribeMicHud: vi.fn((_handler: (payload: RemoteHudPayload) => void) => () => {}),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { MicHud } from "./mic-hud";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function emit(payload: RemoteHudPayload) {
  const calls = tauri.subscribeMicHud.mock.calls;
  const handler = calls[calls.length - 1]?.[0];
  act(() => handler?.(payload));
}

describe("MicHud", () => {
  it("没收到状态时不渲染任何东西", () => {
    const { container } = render(<MicHud />);
    expect(container).toBeEmptyDOMElement();
  });

  it("没连手机：顶部提示「未连接手机麦克风」", () => {
    render(<MicHud />);
    emit({ v: 1, state: "unavailable", reason: "no_phone", ts: 1 });
    expect(screen.getByText("未连接手机麦克风")).toBeInTheDocument();
    expect(screen.getByText(/留在小跟班页面/)).toBeInTheDocument();
  });

  it("多台手机时提示只保留一台", () => {
    render(<MicHud />);
    emit({ v: 1, state: "unavailable", reason: "multi_phone", ts: 1 });
    expect(screen.getByText("检测到多台手机")).toBeInTheDocument();
  });

  it("录音中显示计时与 Esc 提示", () => {
    render(<MicHud />);
    emit({ v: 1, state: "listening", startedAt: Date.now() - 3000, ts: 1 });
    expect(screen.getByText(/正在听 · /)).toBeInTheDocument();
    expect(screen.getByText(/Esc 取消/)).toBeInTheDocument();
  });

  it("失败原因走协议错误码文案", () => {
    render(<MicHud />);
    emit({ v: 1, state: "failed", reason: "ack_timeout", ts: 1 });
    expect(screen.getByText("手机没有响应")).toBeInTheDocument();
  });

  it("已输入 / 已复制分开显示", () => {
    render(<MicHud />);
    emit({ v: 1, state: "delivered", ts: 1 });
    expect(screen.getByText("已输入到当前窗口")).toBeInTheDocument();
    emit({ v: 1, state: "copied", reason: "secure_input", ts: 2 });
    expect(screen.getByText(/密码框/)).toBeInTheDocument();
  });
});
