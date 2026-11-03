import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { sendKeyRequest } from "@/shared/lib/tauri";
import { MicButton } from "./mic-button";
import { useMicStore } from "./mic-store";

// 让 pointerdown/pointermove 带 clientY（jsdom 没有 PointerEvent，用 MouseEvent 顶替）
beforeAll(() => {
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: window.MouseEvent,
  });
});

const tauri = vi.hoisted(() => ({
  haptic: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  haptic: tauri.haptic,
  sendMicStart: vi.fn(async () => null),
  sendMicStop: vi.fn(async () => null),
  sendMicFrame: vi.fn(async () => null),
  sendKeyRequest: vi.fn(async () => null),
}));

vi.mock("./voice-recorder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./voice-recorder")>()),
  createSessionId: () => "session-test",
  primeMicrophone: vi.fn(async () => undefined),
  startVoiceRecording: vi.fn(async (options: { sessionId: string }) => ({
    sessionId: options.sessionId,
    stop: async () => ({ durationMs: 1_200 }),
    cancel: async () => undefined,
    getLevel: () => 0,
    getElapsedMs: () => 0,
  })),
}));

function resetStores() {
  localStorage.setItem("sidekick:mic-primer", "1");
  localStorage.setItem("sidekick:mic-permission-denied", "0");
  useConnectionStore.setState({ status: "connected" });
  useMicStore.setState({
    phase: "listening",
    session: "session-1",
    result: null,
    error: null,
    partialText: "",
    partialRev: 0,
  });
}

beforeEach(() => {
  resetStores();
  tauri.haptic.mockReset();
  tauri.haptic.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  useMicStore.setState({
    phase: "idle",
    session: null,
    result: null,
    error: null,
    partialText: "",
    partialRev: 0,
  });
});

function renderButton() {
  render(<MicButton active />);
  return screen.getByRole("button", { name: /松开结束录音|按住说话/ });
}

function isPositioned(element: Element) {
  return /\b(absolute|fixed)\b/.test(element.className);
}

/** 覆盖层：按钮的兄弟层，固定在胶囊上方。 */
function overlayOf(mic: HTMLElement): HTMLElement {
  const container = mic.parentElement as HTMLElement;
  return container.firstElementChild as HTMLElement;
}

function setMicIdle() {
  useMicStore.setState({ phase: "idle", session: null, result: null, error: null });
}

describe("MicButton 竖屏胶囊", () => {
  it("空闲是 56px 高的宽胶囊，底部居中且不使用 CSS translate 居中", () => {
    setMicIdle();
    const mic = renderButton();
    const container = mic.parentElement as HTMLElement;

    expect(container.className).toContain("inset-x-0");
    expect(container.className).toContain("items-center");
    expect(container.className).toContain("bottom-[calc(env(safe-area-inset-bottom)+16px)]");
    expect(container.className).not.toMatch(/left-1\/2/);
    expect(container.className).not.toContain("-translate-x-1/2");

    expect(mic.className).toContain("h-14");
    expect(mic.className).toContain("w-[min(86vw,360px)]");
    expect(mic.className).toContain("rounded-full");
    expect(mic.className).toContain("pointer-events-auto");
    expect(mic.textContent).toContain("按住说话");
  });

  it("覆盖层在胶囊上方独立定位，不参与容器宽度", () => {
    const mic = renderButton();
    const overlay = overlayOf(mic);
    const container = mic.parentElement as HTMLElement;

    expect(overlay).not.toBe(mic);
    expect(isPositioned(overlay)).toBe(true);
    expect(overlay.className).toContain("absolute");
    expect(overlay.className).toContain("bottom-[68px]");
    expect(overlay.className).toContain("inset-x-0");
    expect(overlay.className).toContain("mx-auto");
    expect(overlay.className).toContain("w-[min(86vw,380px)]");
    expect(overlay.className).toContain("pointer-events-none");

    // 容器里只有按钮一个流内元素，覆盖层不会撑宽按钮。
    const inFlow = [...container.children].filter((child) => !isPositioned(child));
    expect(inFlow).toEqual([mic]);
  });

  it("没有任何「取消录音」按钮，取消只靠上滑手势", () => {
    renderButton();
    expect(screen.queryByRole("button", { name: "取消录音" })).toBeNull();
  });

  it("结果卡片出现时同样在胶囊上方独立覆盖层", () => {
    useMicStore.setState({
      phase: "delivered",
      result: {
        outcome: "inserted",
        reason: null,
        text: "测试转写文本",
        truncated: false,
        message: "已输入到电脑",
        at: Date.now(),
      },
    });

    const mic = renderButton();
    const text = screen.getByText("测试转写文本");
    const card = text.closest("div.rounded-2xl.border");
    expect(card).not.toBeNull();

    const overlay = card?.parentElement as HTMLElement;
    expect(overlay).not.toBe(mic.parentElement);
    expect(isPositioned(overlay)).toBe(true);
    expect(overlay.className).toContain("w-[min(86vw,380px)]");
    expect((card as HTMLElement).className).toContain("w-full");
    expect((card as HTMLElement).className).toContain("pointer-events-auto");
  });

  it("按下开始录音时中震一下，给「现在在录」的即时反馈", () => {
    setMicIdle();
    const mic = renderButton();

    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 196, clientY: 800 });

    expect(tauri.haptic).toHaveBeenCalledWith("medium");
  });

  it("按住上滑 60px 进入「松手取消」珊瑚态，松手回到 idle", async () => {
    setMicIdle();
    const mic = renderButton();

    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 196, clientY: 800 });
    await waitFor(() => expect(useMicStore.getState().phase).toBe("listening"));
    expect(mic.textContent).toContain("上滑取消");
    expect(mic.className).toContain("w-[min(90vw,420px)]");

    fireEvent.pointerMove(mic, { pointerId: 1, clientX: 196, clientY: 740 });
    await waitFor(() => expect(mic.textContent).toContain("松手取消"));
    expect(mic.className).toContain("bg-pet-coral");

    fireEvent.pointerUp(mic, { pointerId: 1, clientX: 196, clientY: 740 });
    await waitFor(() => expect(useMicStore.getState().phase).toBe("idle"));
    await waitFor(() => expect(screen.getByText("已取消，没有发送。")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "取消录音" })).toBeNull();
  });
});

describe("MicButton 流式识别回显", () => {
  it("录音时在胶囊上方显示实时文本、百炼来源和上传提示", () => {
    useMicStore.setState({
      phase: "listening",
      session: "session-1",
      partialText: "帮我把这段异步的注释",
      partialRev: 3,
    });
    renderButton();

    expect(screen.getByText("帮我把这段异步的注释")).toBeInTheDocument();
    expect(screen.getByText(/百炼 · 音频上传中/)).toBeInTheDocument();
  });

  it("云端收尾时胶囊内显示进度，并保留最后一段实时文本", () => {
    useMicStore.setState({
      phase: "processing",
      session: "session-1",
      partialText: "帮我把这段异步的注释改成中文",
      partialRev: 4,
    });
    renderButton();

    expect(screen.getByText("云端收尾…")).toBeInTheDocument();
    expect(screen.getAllByText("百炼").length).toBeGreaterThan(0);
    expect(screen.getByText("帮我把这段异步的注释改成中文")).toBeInTheDocument();
  });
});

describe("MicButton 结果卡片按键", () => {
  const sendKey = vi.mocked(sendKeyRequest);

  function insertedCard() {
    useConnectionStore.setState({ status: "connected" });
    useMicStore.setState({
      phase: "delivered",
      session: "session-1",
      result: {
        outcome: "inserted",
        reason: null,
        text: "测试转写文本",
        truncated: false,
        message: "已输入",
        at: Date.now(),
      },
      error: null,
      partialText: "",
      partialRev: 0,
      keyPending: null,
      keyArmedClear: false,
      keyNotice: null,
      keyError: null,
      keyRequestId: null,
    });
  }

  beforeEach(() => {
    sendKey.mockClear();
    insertedCard();
  });

  it("已输入的卡片出现「回车」「清空」两个 44px 按钮", () => {
    renderButton();

    const enter = screen.getByRole("button", { name: "在电脑上按回车" });
    const clear = screen.getByRole("button", { name: "清空电脑输入框" });
    expect(enter.className).toContain("h-11");
    expect(clear.className).toContain("h-11");
    expect(enter.textContent).toContain("回车");
    expect(clear.textContent).toContain("清空");
  });

  it("仅复制/失败的卡片不出现按键按钮", () => {
    useMicStore.setState({
      phase: "delivered",
      result: {
        outcome: "copied",
        reason: "accessibility_off",
        text: "测试转写文本",
        truncated: false,
        message: "已复制到电脑",
        at: Date.now(),
      },
    });
    renderButton();
    expect(screen.queryByRole("button", { name: "在电脑上按回车" })).toBeNull();
    expect(screen.queryByRole("button", { name: "清空电脑输入框" })).toBeNull();
  });

  it("点回车直接发送", () => {
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "在电脑上按回车" }));
    expect(sendKey).toHaveBeenCalledTimes(1);
    expect(sendKey.mock.calls[0][0]).toBe("enter");
  });

  it("点清空第一次只做二次确认，按钮改成「再点一次」", () => {
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "清空电脑输入框" }));
    expect(sendKey).not.toHaveBeenCalled();
    expect(screen.getByText("再点一次")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再点一次清空电脑输入框" })).toBeInTheDocument();
  });

  it("等待回包或已有提示时两个按钮都禁用", () => {
    useMicStore.setState({ keyPending: "enter" });
    renderButton();
    expect(screen.getByRole("button", { name: "在电脑上按回车" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "清空电脑输入框" })).toBeDisabled();
  });

  it("成功提示与失败提示都在卡片里可见", () => {
    useMicStore.setState({ keyNotice: "已按回车" });
    renderButton();
    expect(screen.getByText("已按回车")).toBeInTheDocument();
  });

  it("失败时显示中文原因，按钮保留", () => {
    useMicStore.setState({ keyError: "电脑焦点不在刚才的窗口，没按。" });
    renderButton();
    expect(screen.getByText("电脑焦点不在刚才的窗口，没按。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "在电脑上按回车" })).toBeInTheDocument();
  });
});
