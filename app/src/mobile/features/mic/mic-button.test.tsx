import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import type { Posture } from "@/mobile/features/pet/types";
import { MicButton } from "./mic-button";
import { useMicStore } from "./mic-store";

// 让 pointerdown/pointermove 带 clientY（jsdom 没有 PointerEvent，用 MouseEvent 顶替）
beforeAll(() => {
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: window.MouseEvent,
  });
});

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  sendMicStart: vi.fn(async () => null),
  sendMicStop: vi.fn(async () => null),
  sendMicFrame: vi.fn(async () => null),
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
  useMicStore.setState({ phase: "listening", session: "session-1", result: null, error: null });
}

beforeEach(resetStores);

afterEach(() => {
  cleanup();
  useMicStore.setState({ phase: "idle", session: null, result: null, error: null });
});

function renderButton(posture: Posture) {
  render(<MicButton active posture={posture} />);
  return screen.getByRole("button", { name: /松开结束录音|按住说话/ });
}

/** 录音条：包含「上滑取消」提示的那张卡片。 */
function recordingBar(): HTMLElement {
  const hint = screen.getByText("上滑取消");
  const bar = hint.closest("div.rounded-2xl");
  if (!bar) throw new Error("没有找到录音条");
  return bar as HTMLElement;
}

function isPositioned(element: Element) {
  return /\b(absolute|fixed)\b/.test(element.className);
}

/** 覆盖层：按钮的兄弟层（手持绝对定位，支架静态居中）。 */
function overlayOf(mic: HTMLElement): HTMLElement {
  const container = mic.parentElement as HTMLElement;
  return container.firstElementChild as HTMLElement;
}

describe("MicButton 手持模式：底部居中按钮 + 上方居中覆盖层", () => {
  it("按钮容器底部居中，覆盖层绝对定位在按钮上方居中且不撑宽容器", () => {
    const mic = renderButton("handheld");
    const bar = recordingBar();
    const overlay = overlayOf(mic);
    const container = mic.parentElement as HTMLElement;

    // 按钮层：底部居中（inset-x-0 + flex 居中；不用 left-1/2 + -translate-x-1/2，
    // 因为 Tailwind v4 的 translate 工具类是 CSS translate 属性，真机 WebView 103 不支持）
    expect(container.className).toContain("inset-x-0");
    expect(container.className).toContain("items-center");
    expect(container.className).toContain("bottom-[calc(env(safe-area-inset-bottom)+24px)]");
    expect(container.className).not.toMatch(/left-1\/2/);
    expect(container.className).not.toContain("-translate-x-1/2");
    expect(container.className).not.toMatch(/\bw-\[/);
    expect(mic.className).toContain("pointer-events-auto");

    // 覆盖层是独立绝对定位层，左右贴边 + mx-auto 居中，不参与容器宽度计算
    expect(overlay).toBe(bar.parentElement);
    expect(overlay).not.toBe(container);
    expect(isPositioned(overlay)).toBe(true);
    expect(overlay.className).toContain("pointer-events-none");
    expect(overlay.className).toContain("absolute");
    expect(overlay.className).toContain("bottom-[104px]");
    expect(overlay.className).toContain("left-0");
    expect(overlay.className).toContain("right-0");
    expect(overlay.className).toContain("mx-auto");
    expect(overlay.className).toContain("w-[min(82vw,360px)]");
    expect(overlay.className).toContain("items-center");
    expect(overlay.className).not.toContain("-translate-x-1/2");
    expect(overlay.className).not.toContain("items-end");

    // 按钮所在的定位层里只有按钮一个流内元素
    const inFlow = [...container.children].filter((child) => !isPositioned(child));
    expect(inFlow).toEqual([mic]);
  });

  it("手持模式没有任何「取消录音」按钮，取消只靠上滑手势", () => {
    render(<MicButton active posture="handheld" />);
    expect(screen.queryByRole("button", { name: "取消录音" })).toBeNull();
  });

  it("结果卡片出现时同样在按钮上方居中的独立覆盖层", () => {
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

    render(<MicButton active posture="handheld" />);
    const mic = screen.getByRole("button", { name: /按住说话/ });
    const text = screen.getByText("测试转写文本");
    const card = text.closest("div.rounded-2xl.border");
    expect(card).not.toBeNull();

    const overlay = card?.parentElement as HTMLElement;
    expect(overlay).not.toBe(mic.parentElement);
    expect(isPositioned(overlay)).toBe(true);
    expect(overlay.className).toContain("left-0");
    expect(overlay.className).toContain("right-0");
    expect(overlay.className).toContain("mx-auto");
    expect(overlay.className).toContain("w-[min(82vw,360px)]");
    expect((card as HTMLElement).className).toContain("w-[min(82vw,360px)]");
    expect((card as HTMLElement).className).toContain("pointer-events-auto");
  });

  it("按住上滑 60px 进入「松手取消」珊瑚态，松手回到 idle", async () => {
    useMicStore.setState({ phase: "idle", session: null, result: null, error: null });
    render(<MicButton active posture="handheld" />);
    const mic = screen.getByRole("button", { name: /按住说话/ });

    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 196, clientY: 800 });
    await waitFor(() => expect(useMicStore.getState().phase).toBe("listening"));
    expect(mic.textContent).toContain("松手结束");

    fireEvent.pointerMove(mic, { pointerId: 1, clientX: 196, clientY: 740 });
    await waitFor(() => expect(mic.textContent).toContain("松手取消"));
    expect(mic.className).toContain("bg-pet-coral");

    fireEvent.pointerUp(mic, { pointerId: 1, clientX: 196, clientY: 740 });
    await waitFor(() => expect(useMicStore.getState().phase).toBe("idle"));
    await waitFor(() => expect(screen.getByText("已取消，没有发送。")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "取消录音" })).toBeNull();
  });
});

describe("MicButton 支架模式：保持居中胶囊", () => {
  it("覆盖层静态居中排列，按钮自己就是宽胶囊", () => {
    render(<MicButton active posture="docked" />);
    const mic = screen.getByRole("button", { name: /松开结束录音/ });
    const container = mic.parentElement as HTMLElement;
    const overlay = overlayOf(mic);

    expect(overlay).not.toBe(mic);
    expect(overlay.className).toContain("items-center");
    expect(isPositioned(overlay)).toBe(false);
    expect(mic.className).toContain("w-[min(82vw,520px)]");
    expect(container.className).toContain("inset-x-0");
    expect(container.className).not.toContain("-translate-x-1/2");
    // 支架模式没有取消按钮，录音提示在胶囊内部
    expect(screen.queryByRole("button", { name: "取消录音" })).toBeNull();
    expect(mic.textContent).toContain("上滑取消");
  });
});
