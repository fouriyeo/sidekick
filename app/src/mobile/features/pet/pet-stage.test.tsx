import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIdleAiStatus } from "./ai-status";
import { PetStage } from "./pet-stage";
import { usePetStore } from "./pet-store";

function setStageState(options: {
  ai?: "idle" | "working" | "asking" | "completed";
  reduceMotion?: "system" | "on" | "off";
  phase?: "idle" | "sleeping" | "away";
  onboarded?: boolean;
}) {
  const aiState = options.ai ?? "idle";
  const now = Date.now();

  usePetStore.setState((state) => ({
    hydrated: true,
    ai: {
      ...createIdleAiStatus(),
      state: aiState,
      resume: aiState === "completed" ? "idle" : aiState,
      enteredAt: now,
      completedUntil: aiState === "completed" ? now + 3000 : null,
    },
    pet: {
      ...state.pet,
      onboarded: options.onboarded ?? true,
      visible: true,
      phase: options.phase ?? "idle",
      mood: "content",
      lastEnergyAt: now,
      settings: {
        ...state.pet.settings,
        reduceMotion: options.reduceMotion ?? "off",
      },
    },
  }));
}

function renderStage() {
  return render(<PetStage />);
}

function stageSection(container: HTMLElement): HTMLElement {
  const section = container.querySelector("section");
  if (!(section instanceof HTMLElement)) throw new Error("舞台未渲染");
  return section;
}

beforeEach(() => {
  setStageState({});
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

    expect(stageSection(container)).toHaveAttribute("data-ai-state", "working");

    const motionLayer = container.querySelector("[data-reduced-motion]");
    expect(motionLayer).toHaveAttribute("data-ai-state", "working");
  });

  it("aria-live 播报四态文案：正在陪你工作/等你决定/完成", () => {
    setStageState({ ai: "working" });
    const working = renderStage();
    expect(screen.getByText("小跟班，正在陪你工作")).toBeInTheDocument();
    working.unmount();

    setStageState({ ai: "asking" });
    const asking = renderStage();
    expect(screen.getByText("小跟班，等你决定")).toBeInTheDocument();
    asking.unmount();

    setStageState({ ai: "completed" });
    renderStage();
    expect(screen.getByText("小跟班，完成")).toBeInTheDocument();
  });

  it("休息时 AI 姿态回到静态、不显示 AI 文案", () => {
    setStageState({ ai: "asking", phase: "away" });
    const { container } = renderStage();

    expect(stageSection(container)).toHaveAttribute("data-ai-state", "idle");
    expect(screen.queryByText("等你决定")).not.toBeInTheDocument();
    expect(screen.getByText("小跟班，在休息")).toBeInTheDocument();
  });

  it("减少动效设置反映到舞台标记", () => {
    setStageState({ ai: "working", reduceMotion: "on" });
    const { container } = renderStage();

    expect(stageSection(container)).toHaveAttribute("data-reduced-motion", "true");
  });

  it("点击、长按、滑动宠物都没有任何反应、也不写存档", () => {
    const { container } = renderStage();
    const pet = container.querySelector("[data-pet-action]");
    if (!(pet instanceof HTMLElement)) throw new Error("宠物未渲染");

    const before = usePetStore.getState();
    fireEvent.pointerDown(pet, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pet, { pointerId: 1, clientX: 40, clientY: 10 });
    fireEvent.pointerMove(pet, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(pet, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.click(pet);

    expect(usePetStore.getState().pet).toBe(before.pet);
    expect(usePetStore.getState().bubble).toBeNull();
  });
});

describe("PetStage D77 舞台红线", () => {
  it("没有背景声呐环，也没有触摸互动的入口", () => {
    const { container } = renderStage();

    expect(container.querySelector(".sonar-dot-ring")).toBeNull();
    expect(container.querySelector("[data-pet-interactive]")).toBeNull();
    expect(screen.queryByRole("button", { name: /摸摸|戳/ })).toBeNull();
  });

  it("不再渲染品牌小字，也不渲染输入框", () => {
    renderStage();

    expect(screen.queryByText("小跟班 · Sidekick")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("减少动效设置反映到舞台标记", () => {
    setStageState({ ai: "working", reduceMotion: "on" });
    const { container } = renderStage();

    expect(stageSection(container)).toHaveAttribute("data-reduced-motion", "true");
  });

  it("点击、长按、滑动宠物都没有任何反应、也不写存档", () => {
    const { container } = renderStage();
    const pet = container.querySelector("[data-pet-action]");
    if (!(pet instanceof HTMLElement)) throw new Error("宠物未渲染");

    const before = usePetStore.getState();
    fireEvent.pointerDown(pet, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pet, { pointerId: 1, clientX: 40, clientY: 10 });
    fireEvent.pointerMove(pet, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(pet, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.click(pet);

    expect(usePetStore.getState().pet).toBe(before.pet);
    expect(usePetStore.getState().bubble).toBeNull();
  });
});
