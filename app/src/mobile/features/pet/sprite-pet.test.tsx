import { cleanup, render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpritePet } from "./sprite-pet";

function stubImage(kind: "ready" | "broken" | "wrong-size") {
  const ImageStub = class {
    naturalWidth = kind === "wrong-size" ? 2048 : kind === "broken" ? 0 : 4096;
    naturalHeight = kind === "wrong-size" ? 1024 : kind === "broken" ? 0 : 1024;
    src = "";
    decode = () =>
      kind === "broken" ? Promise.reject(new Error("decode failed")) : Promise.resolve();
  };
  vi.stubGlobal("Image", ImageStub);
}

function renderPet(overrides: Partial<ComponentProps<typeof SpritePet>> = {}) {
  return render(
    <SpritePet ai="idle" phase="idle" night={false} active reducedMotion={false} {...overrides} />,
  );
}

function rootOf(container: HTMLElement): HTMLElement {
  const root = container.querySelector("[data-sprite-state]");
  if (!(root instanceof HTMLElement)) throw new Error("sprite root 未渲染");
  return root;
}

function spriteOf(container: HTMLElement): HTMLElement {
  const sprite = container.querySelector('div[style*="background-image"]');
  if (!(sprite instanceof HTMLElement)) throw new Error("sprite 层未渲染");
  return sprite;
}

beforeEach(() => {
  stubImage("ready");
  vi.stubGlobal("requestAnimationFrame", (() => 0) as typeof requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SpritePet", () => {
  it("按 AI 四态选择图集行，并设置背景尺寸/位置", async () => {
    const { container } = renderPet({ ai: "working" });
    const root = rootOf(container);

    await waitFor(() => expect(root).toHaveAttribute("data-sprite-status", "ready"));

    expect(root).toHaveAttribute("data-ai-state", "working");
    expect(root).toHaveAttribute("data-sprite-state", "working");

    const sprite = spriteOf(container);
    expect(sprite.style.backgroundSize).toBe("4096px 1024px");
    expect(sprite.style.backgroundPosition).toBe("0px -256px");
    // 容器尺寸未知时用 cell 兜底，方形裁切，不会露出下一行
    expect(sprite.style.width).toBe("256px");
    expect(sprite.style.height).toBe("256px");
  });

  it("状态切换后从新状态第 0 帧开始", async () => {
    const { container, rerender } = renderPet({ ai: "working" });
    const root = rootOf(container);
    await waitFor(() => expect(root).toHaveAttribute("data-sprite-status", "ready"));

    rerender(<SpritePet ai="completed" phase="idle" night={false} active reducedMotion={false} />);

    await waitFor(() => expect(root).toHaveAttribute("data-sprite-state", "done"));
    expect(spriteOf(container).style.backgroundPosition).toBe("0px -768px");
  });

  it("预留状态没有对应行时回落到 idle", async () => {
    const { container } = renderPet({ ai: "idle", phase: "sleeping" });
    const root = rootOf(container);

    await waitFor(() => expect(root).toHaveAttribute("data-sprite-status", "ready"));
    expect(root).toHaveAttribute("data-sprite-state", "idle");
    expect(spriteOf(container).style.backgroundPosition).toBe("0px 0px");
  });

  it("减少动效时冻结在首帧", async () => {
    const { container } = renderPet({ ai: "working", reducedMotion: true });
    const root = rootOf(container);

    await waitFor(() => expect(root).toHaveAttribute("data-sprite-status", "ready"));
    expect(root).toHaveAttribute("data-reduced-motion", "true");
    expect(spriteOf(container).style.backgroundPosition).toBe("0px -256px");
  });

  it("解码失败时降级为 poster，不白屏", async () => {
    stubImage("broken");
    const { container } = renderPet();
    const root = rootOf(container);

    await waitFor(() => expect(root).toHaveAttribute("data-sprite-status", "error"));
    const poster = container.querySelector("img");
    expect(poster).not.toBeNull();
  });

  it("图集尺寸与 manifest 不匹配时降级为 poster", async () => {
    stubImage("wrong-size");
    const { container } = renderPet();
    const root = rootOf(container);

    await waitFor(() => expect(root).toHaveAttribute("data-sprite-status", "error"));
    expect(container.querySelector("img")).not.toBeNull();
  });
});
