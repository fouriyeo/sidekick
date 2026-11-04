import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
import { createIdleAiStatus } from "./ai-status";
import { PetStage } from "./pet-stage";
import { usePetStore } from "./pet-store";

// 只验证舞台的 AI 文案/无障碍/减少动效，不拉起真实录音链路。
vi.mock("@/mobile/features/mic/mic-button", () => ({
  MicButton: () => null,
}));

function setStageState(options: {
  ai?: "idle" | "working" | "asking" | "completed";
  caption?: "ai_working" | "ai_asking" | "ai_completed" | null;
  reduceMotion?: "system" | "on" | "off";
  phase?: "idle" | "listening" | "sleeping";
}) {
  const aiState = options.ai ?? "idle";
  const now = Date.now();

  usePetStore.setState((state) => ({
    hydrated: true,
    bubble:
      options.caption === null || options.caption === undefined
        ? null
        : { id: 99, copyId: "returning", text: "回来啦。" },
    ai: {
      ...createIdleAiStatus(),
      state: aiState,
      resume: aiState === "completed" ? "idle" : aiState,
      enteredAt: now,
      completedUntil: aiState === "completed" ? now + 3000 : null,
    },
    aiCaption: options.caption
      ? {
          id: 7,
          copyId: options.caption,
          text: options.caption === "ai_asking" ? "等你决定" : "文案",
        }
      : null,
    pet: {
      ...state.pet,
      onboarded: true,
      name: "小跟班",
      visible: true,
      phase: options.phase ?? "idle",
      mood: options.phase === "listening" ? "listening" : "content",
      lastEnergyAt: now,
      settings: {
        ...state.pet.settings,
        reduceMotion: options.reduceMotion ?? "off",
      },
    },
  }));
}

function renderStage() {
  return render(<PetStage active={true} onOpenChat={vi.fn()} onOpenSettings={vi.fn()} />);
}

function stageSection(container: HTMLElement): HTMLElement {
  const section = container.querySelector("section");
  if (!(section instanceof HTMLElement)) throw new Error("舞台未渲染");
  return section;
}

beforeEach(() => {
  setStageState({});
  useSessionStore.getState().clearAll();
  useSessionStore.setState({ hydrated: true });
});

afterEach(() => {
  cleanup();
  usePetStore.setState({
    hydrated: false,
    ai: createIdleAiStatus(),
    aiCaption: null,
    bubble: null,
    micListening: false,
  });
});

describe("PetStage AI 联动展示", () => {
  it("舞台与 motion layer 都带最终 AI 姿态标记", () => {
    setStageState({ ai: "working" });
    const { container } = renderStage();

    const section = stageSection(container);
    expect(section).toHaveAttribute("data-ai-state", "working");

    const motionLayer = container.querySelector("[data-reduced-motion]");
    expect(motionLayer).toHaveAttribute("data-ai-state", "working");
  });

  it("asking 文案占用气泡槽位、优先于闲聊气泡，且可见文案 aria-hidden", () => {
    setStageState({ ai: "asking", caption: "ai_asking" });
    renderStage();

    const caption = screen.getByText("等你决定");
    expect(caption).toHaveAttribute("aria-hidden", "true");
    expect(caption).toHaveAttribute("data-ai-caption", "ai_asking");
    expect(screen.queryByText("回来啦。")).not.toBeInTheDocument();
  });

  it("aria-live 播报四态文案：正在陪你工作/等你决定/完成了一件事", () => {
    setStageState({ ai: "working", caption: "ai_working" });
    const working = renderStage();
    expect(screen.getByText("小跟班，正在陪你工作")).toBeInTheDocument();
    working.unmount();

    setStageState({ ai: "asking", caption: "ai_asking" });
    const asking = renderStage();
    expect(screen.getByText("小跟班，等你决定")).toBeInTheDocument();
    asking.unmount();

    setStageState({ ai: "completed", caption: "ai_completed" });
    renderStage();
    expect(screen.getByText("小跟班，完成了一件事")).toBeInTheDocument();
  });

  it("录音中即时反馈让位：AI 姿态回到静态、不显示 AI 文案", () => {
    setStageState({ ai: "asking", caption: "ai_asking", phase: "listening" });
    const { container } = renderStage();

    expect(stageSection(container)).toHaveAttribute("data-ai-state", "idle");
    expect(screen.queryByText("等你决定")).not.toBeInTheDocument();
    expect(screen.getByText("小跟班，正在听")).toBeInTheDocument();
  });

  it("减少动效设置反映到舞台标记", () => {
    setStageState({ ai: "working", reduceMotion: "on" });
    const { container } = renderStage();

    expect(stageSection(container)).toHaveAttribute("data-reduced-motion", "true");
  });

  it("点击、长按、滑动宠物都没有任何反应", () => {
    const { container } = renderStage();
    const pet = container.querySelector("[data-sprite-state]");
    if (!(pet instanceof HTMLElement)) throw new Error("宠物未渲染");

    const before = usePetStore.getState();
    fireEvent.pointerDown(pet, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pet, { pointerId: 1, clientX: 40, clientY: 10 });
    fireEvent.pointerMove(pet, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(pet, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.click(pet);

    expect(usePetStore.getState().pet).toBe(before.pet);
    expect(usePetStore.getState().bubble).toBeNull();
    expect(usePetStore.getState().heartBurst).toBeNull();
  });
});

describe("PetStage 会话列表", () => {
  it("没有会话时面板隐藏、宠物不下移", () => {
    const { container } = renderStage();
    expect(stageSection(container)).toHaveAttribute("data-session-panel", "hidden");
    expect(container.querySelector('[style*="--pet-session-shift: 0px"]')).not.toBeNull();
  });

  it("有会话时默认收起，宠物下移 32px", () => {
    useSessionStore.setState({
      raw: [
        {
          id: "s-1",
          title: "修复登录",
          source: "dsh",
          state: "working",
          askKind: null,
          lastEventAt: Date.now(),
          completedAt: null,
        },
      ],
    });
    const { container } = renderStage();

    expect(stageSection(container)).toHaveAttribute("data-session-panel", "collapsed");
    expect(screen.getByText("修复登录")).toBeInTheDocument();
    expect(container.querySelector('[style*="--pet-session-shift: 32px"]')).not.toBeNull();
  });

  it("展开时宠物下移 56px，并让出气泡位置", () => {
    setStageState({ ai: "asking", caption: "ai_asking" });
    useSessionStore.setState({
      expanded: true,
      raw: [
        {
          id: "s-1",
          title: "修复登录",
          source: "dsh",
          state: "working",
          askKind: null,
          lastEventAt: Date.now(),
          completedAt: null,
        },
      ],
    });
    const { container } = renderStage();

    expect(stageSection(container)).toHaveAttribute("data-session-panel", "expanded");
    expect(container.querySelector('[style*="--pet-session-shift: 56px"]')).not.toBeNull();
    expect(screen.queryByText("等你决定")).not.toBeInTheDocument();
  });
});

describe("PetStage 方向 B 舞台装饰", () => {
  it("顶部细状态条 aria-hidden，显示「已连接 · 名字」，断连显示未连接", () => {
    useConnectionStore.setState({ status: "connected" });
    const { container, unmount } = renderStage();

    const marker = screen.getByText("已连接");
    expect(marker.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText("小跟班")).toBeInTheDocument();
    // 状态条不抢舞台 aria-live 的播报。
    expect(container.querySelector('[aria-live="polite"].sr-only')).toHaveTextContent("小跟班");

    unmount();
    useConnectionStore.setState({ status: "disconnected" });
    renderStage();
    expect(screen.getByText("未连接")).toBeInTheDocument();
    expect(screen.queryByText("已连接")).not.toBeInTheDocument();
  });

  it("声呐环在精灵之后、aria-hidden，且减少动效时冻结", () => {
    const { container, unmount } = renderStage();
    const sonar = container.querySelector('[data-sonar="stage"]');
    const sprite = container.querySelector("[data-sprite-state]");
    if (!(sonar instanceof HTMLElement) || !(sprite instanceof HTMLElement)) {
      throw new Error("声呐环或精灵未渲染");
    }
    expect(sonar).toHaveAttribute("aria-hidden", "true");
    // DOM 顺序：环先于精灵 => 视觉上在精灵后面。
    expect(sonar.compareDocumentPosition(sprite) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();

    setStageState({ reduceMotion: "on" });
    const reduced = renderStage();
    expect(stageSection(reduced.container)).toHaveAttribute("data-reduced-motion", "true");
  });

  it("状态文案 21px + mono 副行；asking 用琥珀，不用珊瑚", () => {
    setStageState({ ai: "asking", caption: "ai_asking" });
    renderStage();

    const caption = screen.getByText("等你决定");
    const card = caption.closest("p");
    if (!(card instanceof HTMLElement)) throw new Error("状态卡未渲染");
    expect(card.className).toContain("rounded-[14px]");
    expect(card.className).toContain("border-pet-ask");
    expect(card.className).not.toContain("border-pet-coral");
    expect(caption.className).toContain("text-[21px]");
    expect(screen.getByText("AWAITING")).toBeInTheDocument();
    expect(screen.getByText("请到电脑上确认")).toBeInTheDocument();
  });
});
