import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiState } from "./ai-status";
import { PetFallback } from "./pet-fallback";

type FallbackOverrides = {
  aiState?: AiState;
  reducedMotion?: boolean;
  isNight?: boolean;
  idleAction?: "look" | "stretch" | null;
};

function renderFallback(overrides: FallbackOverrides = {}) {
  const view = render(
    <PetFallback
      mood="content"
      energy={80}
      isNight={overrides.isNight ?? false}
      phase="idle"
      aiState={overrides.aiState ?? "idle"}
      reducedMotion={overrides.reducedMotion ?? false}
      idleAction={overrides.idleAction ?? null}
    />,
  );

  const layer = view.container.querySelector("[data-ai-state]");
  if (!(layer instanceof HTMLElement)) throw new Error("motion layer 未渲染");

  return { ...view, layer };
}

function part(layer: HTMLElement, name: string): Element | null {
  return layer.querySelector(`[data-part="${name}"]`);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PetFallback AI 联动姿态", () => {
  it("motion layer 带四态标记，默认静态", () => {
    const { layer } = renderFallback();
    expect(layer).toHaveAttribute("data-ai-state", "idle");
    expect(layer).toHaveAttribute("data-reduced-motion", "false");
    expect(layer).toHaveAttribute("data-night", "false");
  });

  it("工作中：键盘/桌面、汗滴、速度线、飞纸都在，其它态不显示", () => {
    const { layer } = renderFallback({ aiState: "working" });

    expect(layer).toHaveAttribute("data-ai-state", "working");
    expect(part(layer, "keyboard")).not.toBeNull();
    expect(part(layer, "sweat")).not.toBeNull();
    expect(part(layer, "speed-lines")).not.toBeNull();
    expect(part(layer, "paper")).not.toBeNull();
    expect(part(layer, "exclamation")).toBeNull();
    expect(part(layer, "check")).toBeNull();
    expect(part(layer, "confetti")).toBeNull();
    // 两只手臂层始终存在（缩着/伸出去靠 CSS 摆姿势）。
    expect(part(layer, "arms")).not.toBeNull();
  });

  it("等你决定：珊瑚感叹号 + 着急线，6 秒后降为 calm 循环", () => {
    vi.useFakeTimers();
    const { layer } = renderFallback({ aiState: "asking" });

    expect(part(layer, "exclamation")).not.toBeNull();
    expect(part(layer, "question")).not.toBeNull();
    expect(layer).toHaveAttribute("data-ask-tone", "urgent");
    expect(part(layer, "keyboard")).toBeNull();
    expect(part(layer, "confetti")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(6100);
    });

    expect(layer).toHaveAttribute("data-ask-tone", "calm");
  });

  it("完成：8 片彩纸 + 对勾气泡，没有键盘/感叹号", () => {
    const { layer } = renderFallback({ aiState: "completed" });

    expect(part(layer, "confetti")).not.toBeNull();
    expect(part(layer, "confetti")?.querySelectorAll("rect")).toHaveLength(8);
    expect(part(layer, "hearts")?.querySelectorAll("path")).toHaveLength(3);
    expect(part(layer, "check")).not.toBeNull();
    expect(part(layer, "keyboard")).toBeNull();
    expect(part(layer, "exclamation")).toBeNull();
  });

  it("减少动效时四态仍保留各自道具与标记", () => {
    for (const aiState of ["idle", "working", "asking", "completed"] as AiState[]) {
      const { layer, unmount } = renderFallback({ aiState, reducedMotion: true });

      expect(layer).toHaveAttribute("data-ai-state", aiState);
      expect(layer).toHaveAttribute("data-reduced-motion", "true");

      if (aiState === "working") expect(part(layer, "keyboard")).not.toBeNull();
      if (aiState === "asking") expect(part(layer, "exclamation")).not.toBeNull();
      if (aiState === "completed") expect(part(layer, "check")).not.toBeNull();

      unmount();
    }
  });

  it("夜间标记用于变暗/困倦变体", () => {
    const { layer } = renderFallback({ aiState: "working", isNight: true });
    expect(layer).toHaveAttribute("data-night", "true");
  });

  it("静态时接受 look/stretch idle 小动作 class", () => {
    const look = renderFallback({ idleAction: "look" });
    expect(look.layer.className).toContain("look");
    look.unmount();

    const stretch = renderFallback({ idleAction: "stretch" });
    expect(stretch.layer.className).toContain("stretch");
  });
});
