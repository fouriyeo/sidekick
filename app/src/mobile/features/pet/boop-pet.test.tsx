import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { BoopPet } from "./boop-pet";
import { clearPetReaction, firePetReaction } from "./pet-reaction";

type FaceProto = {
  play: (action: string) => unknown;
  startWaiting: (options?: { variant?: string }) => unknown;
  stopWaiting: () => unknown;
  wake: () => unknown;
};

function proto(): FaceProto {
  const ctor = customElements.get("boop-face");
  if (!ctor) throw new Error("boop-face 未注册");
  return ctor.prototype as unknown as FaceProto;
}

type PetProps = Parameters<typeof BoopPet>[0];

function renderPet(overrides: Partial<PetProps> = {}) {
  return render(
    <BoopPet
      ai="idle"
      phase="idle"
      night={false}
      reducedMotion={false}
      autoSleepMs={300_000}
      {...overrides}
    />,
  );
}

function rerenderPet(rendered: ReturnType<typeof renderPet>, overrides: Partial<PetProps> = {}) {
  rendered.rerender(
    <BoopPet
      ai="idle"
      phase="idle"
      night={false}
      reducedMotion={false}
      autoSleepMs={300_000}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  clearPetReaction();
  useMicStore.setState({ phase: "idle" });
});

afterEach(() => {
  cleanup();
  clearPetReaction();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("BoopPet 渲染契约", () => {
  it("渲染 boop-face 宿主：固定皮肤 201、兜底色、自动睡眠时长", () => {
    const { container } = renderPet();

    const face = container.querySelector("boop-face");
    expect(face).not.toBeNull();
    expect(face).toHaveAttribute("skin", "201");
    expect(face).toHaveAttribute("color", "#d5e4f5");
    expect(face).toHaveAttribute("auto-sleep", "300000");
    expect(face).toHaveAttribute("wake-on", "activity");
    expect(face).toHaveAttribute("press-squeeze", "false");
    expect(face).toHaveAttribute("antenna-drag", "false");
  });

  it("QA 标记：动作、渲染器、夜间与减少动效", () => {
    const { container } = renderPet({ night: true, reducedMotion: true });

    const layer = container.querySelector("[data-pet-renderer]");
    expect(layer).toHaveAttribute("data-pet-renderer", "boop");
    expect(layer).toHaveAttribute("data-night", "true");
    expect(layer).toHaveAttribute("data-reduced-motion", "true");
    expect(layer).toHaveAttribute("data-pet-action", "idle");
    expect(container.querySelector("boop-face")).toHaveAttribute("motion", "reduce");
  });
});

describe("BoopPet 动作切换", () => {
  it("working 走循环等待，asking / completed 走一次性动作", () => {
    const startWaiting = vi.spyOn(proto(), "startWaiting");
    const play = vi.spyOn(proto(), "play");

    renderPet({ ai: "working" });
    expect(startWaiting).toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    cleanup();

    renderPet({ ai: "asking" });
    expect(play).toHaveBeenCalledWith("wary");
    cleanup();

    renderPet({ ai: "completed" });
    expect(play).toHaveBeenCalledWith("success");
  });

  it("睡着用 sleep，离开用 bored", () => {
    const play = vi.spyOn(proto(), "play");

    renderPet({ phase: "sleeping" });
    expect(play).toHaveBeenCalledWith("sleep");
    cleanup();

    renderPet({ phase: "away" });
    expect(play).toHaveBeenCalledWith("bored");
  });

  it("录音中 → input，转写中 → inspect", () => {
    const rendered = renderPet();
    const layer = rendered.container.querySelector("[data-pet-renderer]");
    const play = vi.spyOn(proto(), "play");

    act(() => useMicStore.setState({ phase: "listening" }));
    expect(layer).toHaveAttribute("data-pet-action", "input");
    expect(play).toHaveBeenCalledWith("input");

    act(() => useMicStore.setState({ phase: "processing" }));
    expect(layer).toHaveAttribute("data-pet-action", "inspect");
    expect(play).toHaveBeenCalledWith("inspect");
  });

  it("瞬态反应压过 AI 状态", () => {
    const play = vi.spyOn(proto(), "play");

    const rendered = renderPet({ ai: "working" });
    act(() => firePetReaction("affirm", 1_600, Date.now()));
    rerenderPet(rendered, { ai: "working" });

    expect(rendered.container.querySelector("[data-pet-renderer]")).toHaveAttribute(
      "data-pet-action",
      "affirm",
    );
    expect(play).toHaveBeenCalledWith("affirm");
  });

  it("同一动作重复渲染不重播", () => {
    const play = vi.spyOn(proto(), "play");
    const rendered = renderPet({ ai: "asking" });
    rerenderPet(rendered, { ai: "asking" });

    expect(play.mock.calls.filter(([action]) => action === "wary")).toHaveLength(1);
  });
});
