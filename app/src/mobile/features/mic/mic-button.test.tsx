import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { sendKeyRequest, sendMicStart, sendMicStop } from "@/shared/lib/tauri";
import { MicButton } from "./mic-button";
import { useMicStore } from "./mic-store";
import { startVoiceRecording, type VoiceSession } from "./voice-recorder";

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
  vi.mocked(sendMicStart).mockClear();
  vi.mocked(sendMicStop).mockClear();
  vi.mocked(startVoiceRecording).mockClear();
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

  it("宠物页有最近会话时可把覆盖层再上移，避免盖住该行", () => {
    setMicIdle();
    render(<MicButton active overlayBottomClassName="bottom-[124px]" />);
    const mic = screen.getByRole("button", { name: /按住说话/ });
    const overlay = overlayOf(mic);
    expect(overlay.className).toContain("bottom-[124px]");
    expect(overlay.className).not.toContain("bottom-[68px]");
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
    const card = screen.getByTestId("mic-result-card");

    const overlay = card.parentElement as HTMLElement;
    expect(overlay).not.toBe(mic.parentElement);
    expect(isPositioned(overlay)).toBe(true);
    expect(overlay.className).toContain("w-[min(86vw,380px)]");
    expect(card.className).toContain("w-full");
    expect(card.className).toContain("pointer-events-auto");
  });

  it("结果卡是 v16 三段弹窗：grabber / header 16 / content 13 单行 / footer", () => {
    useMicStore.setState({
      phase: "delivered",
      result: {
        outcome: "inserted",
        reason: null,
        text: "把这段代码改成异步，然后提醒我跑测试",
        truncated: false,
        message: "已输入",
        at: Date.now(),
      },
    });
    renderButton();

    // 卡片：白底、圆角 20、0.5 hairline、浮影；不再套 deep-sea 深色作用域。
    const card = screen.getByTestId("mic-result-card");
    expect(card.className).toContain("rounded-[20px]");
    expect(card.className).toContain("border-[0.5px]");
    expect(card.className).toContain("bg-card");
    expect(card.className).toContain("shadow-[0_12px_32px_-12px_rgba(20,30,35,0.18)]");
    expect(card.className).not.toMatch(/surface/);

    // grabber 36×4，#D1D1D6，居中。
    const grabber = screen.getByTestId("mic-result-grabber");
    expect(grabber.className).toContain("w-9");
    expect(grabber.className).toContain("h-1");
    expect(grabber.className).toContain("bg-[#d1d1d6]");

    // header：薄荷 check +「已输入」16/400 + 右侧时间 12/400。
    const title = screen.getByText("已输入");
    expect(title.className).toContain("text-base");
    expect(title.className).toContain("font-normal");
    const when = screen.getByText("刚刚");
    expect(when.className).toContain("text-[12px]");

    // content：正文 13/400、单行省略。
    const body = screen.getByText("把这段代码改成异步，然后提醒我跑测试");
    expect(body.className).toContain("text-[13px]");
    expect(body.className).toContain("truncate");
    expect(body.className).toContain("whitespace-nowrap");

    // footer：15/400 纯文字动作，无实心底色/描边。
    const enter = screen.getByRole("button", { name: "在电脑上按回车" });
    const clear = screen.getByRole("button", { name: "清空电脑输入框" });
    expect(enter.className).toContain("text-[15px]");
    expect(clear.className).toContain("text-[15px]");
    expect(enter.className).toContain("text-primary");
    expect(clear.className).toContain("text-muted-foreground");
    expect(enter.className).not.toMatch(/\bbg-/);
    expect(clear.className).not.toMatch(/\bbg-/);
    expect(enter.className).toContain("min-h-11");

    // 复制按钮仍在（icon-only，44 热区在 header 右侧）。
    expect(screen.getByRole("button", { name: "复制识别文本" })).toBeInTheDocument();
  });

  it("错误态用 destructive 文案，结构与成功态一致且没有按键动作", () => {
    useMicStore.setState({
      phase: "error",
      session: "session-1",
      error: "没听清，靠近一点再说一次。",
      result: null,
    });
    renderButton();

    expect(screen.getByTestId("mic-result-grabber")).toBeInTheDocument();
    const title = screen.getByText("没成功");
    expect(title.className).toContain("text-destructive");
    expect(screen.getByText("没听清，靠近一点再说一次。").className).toContain("text-destructive");
    expect(screen.queryByRole("button", { name: "在电脑上按回车" })).toBeNull();
    expect(screen.queryByRole("button", { name: "清空电脑输入框" })).toBeNull();
  });

  it("按下开始录音时中震一下，给「现在在录」的即时反馈", () => {
    setMicIdle();
    const mic = renderButton();

    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 196, clientY: 800 });

    expect(tauri.haptic).toHaveBeenCalledWith("medium");
  });

  it("手指轻微上移（40px）不进取消区，松手照常发送", async () => {
    setMicIdle();
    const mic = renderButton();

    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 196, clientY: 800 });
    await waitFor(() => expect(useMicStore.getState().phase).toBe("listening"));

    fireEvent.pointerMove(mic, { pointerId: 1, clientX: 196, clientY: 760 });
    expect(mic.textContent).toContain("上滑取消");
    expect(mic.textContent).not.toContain("松手取消");

    fireEvent.pointerUp(mic, { pointerId: 1, clientX: 196, clientY: 760 });
    await waitFor(() =>
      expect(vi.mocked(sendMicStop)).toHaveBeenCalledWith("session-test", "release"),
    );
    expect(useMicStore.getState().phase).toBe("processing");
  });

  it("刻意上滑 100px 才进入「松手取消」，松手回到 idle", async () => {
    setMicIdle();
    const mic = renderButton();

    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 196, clientY: 800 });
    await waitFor(() => expect(useMicStore.getState().phase).toBe("listening"));
    expect(mic.textContent).toContain("上滑取消");
    expect(mic.className).toContain("w-[min(90vw,420px)]");

    fireEvent.pointerMove(mic, { pointerId: 1, clientX: 196, clientY: 700 });
    await waitFor(() => expect(mic.textContent).toContain("松手取消"));
    expect(mic.className).toContain("bg-pet-coral");

    fireEvent.pointerUp(mic, { pointerId: 1, clientX: 196, clientY: 700 });
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

  it("收尾时圆钮里只转 spinner，不写字、不撑宽（「云端收尾…/百炼」已移除）", () => {
    useMicStore.setState({
      phase: "processing",
      session: "session-1",
      partialText: "帮我把这段异步的注释改成中文",
      partialRev: 4,
    });
    render(<MicButton active shape="circle" />);

    const mic = screen.getByRole("button", { name: "正在转写，请稍候" });
    expect(mic).toBeDisabled();
    expect(mic.className).toContain("w-14");
    expect(mic.className).toContain("h-14");
    expect(mic.className).toContain("bg-pet-primary");

    // 圆钮里只有一个 spinner，没有任何文字/徽标（文字会撑出 56 圆钮，看起来像圆盘变形）。
    expect(mic.textContent).toBe("");
    expect(mic.querySelectorAll("span")).toHaveLength(0);
    expect(mic.querySelector("svg")?.getAttribute("class")).toContain("animate-spin");

    // 最后一段实时文本仍在按钮上方的独立覆盖层里，来源徽标也留在覆盖层。
    expect(screen.getByText("帮我把这段异步的注释改成中文")).toBeInTheDocument();
    expect(screen.getAllByText("百炼").length).toBeGreaterThan(0);
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeVoiceSession() {
  const cancel = vi.fn(async () => undefined);
  const stop = vi.fn(async () => ({ durationMs: 1_200 }));
  const session: VoiceSession = {
    sessionId: "session-test",
    stop,
    cancel,
    getLevel: () => 0,
    getElapsedMs: () => 0,
  };
  return { session, cancel, stop };
}

describe("MicButton 会话串行化与快速松手", () => {
  it("连续两次 pointerdown 只建立一个会话", async () => {
    setMicIdle();
    const startGate = deferred<void>();
    vi.mocked(sendMicStart).mockImplementationOnce(() => startGate.promise);
    const { session } = fakeVoiceSession();
    vi.mocked(startVoiceRecording).mockResolvedValueOnce(session);

    const mic = renderButton();
    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 196, clientY: 800 });
    fireEvent.pointerDown(mic, { pointerId: 2, clientX: 196, clientY: 800 });

    expect(sendMicStart).toHaveBeenCalledTimes(1);

    await act(async () => {
      startGate.resolve();
      await startGate.promise;
    });
    await waitFor(() => expect(useMicStore.getState().phase).toBe("listening"));

    fireEvent.pointerUp(mic, { pointerId: 1, clientX: 196, clientY: 800 });
    await waitFor(() => expect(vi.mocked(sendMicStop)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(sendMicStop)).toHaveBeenCalledWith("session-test", "release");
  });

  it("start 还没返回就松手：不进入录音，并补发 cancel stop", async () => {
    setMicIdle();
    const startGate = deferred<void>();
    vi.mocked(sendMicStart).mockImplementationOnce(() => startGate.promise);

    const mic = renderButton();
    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 196, clientY: 800 });
    fireEvent.pointerUp(mic, { pointerId: 1, clientX: 196, clientY: 800 });

    expect(useMicStore.getState().phase).toBe("idle");
    expect(startVoiceRecording).not.toHaveBeenCalled();

    await act(async () => {
      startGate.resolve();
      await startGate.promise;
    });

    await waitFor(() =>
      expect(vi.mocked(sendMicStop)).toHaveBeenCalledWith("session-test", "cancel"),
    );
    expect(startVoiceRecording).not.toHaveBeenCalled();
    expect(useMicStore.getState().phase).toBe("idle");
  });

  it("getUserMedia 期间松手：本地会话取消，不提交为 listening", async () => {
    setMicIdle();
    const voiceGate = deferred<VoiceSession>();
    vi.mocked(startVoiceRecording).mockImplementationOnce(() => voiceGate.promise);
    const { session, cancel } = fakeVoiceSession();

    const mic = renderButton();
    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 196, clientY: 800 });
    await waitFor(() => expect(startVoiceRecording).toHaveBeenCalledTimes(1));

    fireEvent.pointerUp(mic, { pointerId: 1, clientX: 196, clientY: 800 });

    await act(async () => {
      voiceGate.resolve(session);
      await voiceGate.promise;
    });

    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(useMicStore.getState().phase).toBe("idle");
    await waitFor(() =>
      expect(vi.mocked(sendMicStop)).toHaveBeenCalledWith("session-test", "cancel"),
    );
  });

  it("电脑端权威取消：停本地采集、提示原因、不补发 stop", async () => {
    setMicIdle();
    const { session, cancel } = fakeVoiceSession();
    vi.mocked(startVoiceRecording).mockResolvedValueOnce(session);

    const mic = renderButton();
    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 196, clientY: 800 });
    await waitFor(() => expect(useMicStore.getState().phase).toBe("listening"));

    act(() => {
      useMicStore.getState().handleCancel({
        v: 1,
        type: "mic.cancel",
        session: "another-session",
        reason: "desktop",
        ts: 1,
      });
    });

    await waitFor(() => expect(cancel).toHaveBeenCalled());
    expect(useMicStore.getState().phase).toBe("idle");
    expect(screen.getByText("电脑端已取消录音。")).toBeInTheDocument();
    expect(vi.mocked(sendMicStop)).not.toHaveBeenCalled();
  });
});
