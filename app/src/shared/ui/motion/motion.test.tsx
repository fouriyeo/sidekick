import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HintAsk, HintCheck, HintError, LoadingDots, LoadingOrbit } from "./index";

describe("LoadingOrbit", () => {
  it("渲染轨道弧，默认装饰、20px", () => {
    const { container } = render(<LoadingOrbit />);
    const svg = container.querySelector("svg.sk-orbit");

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelector(".sk-orbit__track")).not.toBeNull();
    expect(svg?.querySelector(".sk-orbit__arc")).not.toBeNull();
  });

  it("传 label 时作为 img 暴露，不传时保持 aria-hidden", () => {
    const { container, rerender } = render(<LoadingOrbit label="正在加载" />);
    expect(container.querySelector("svg")?.getAttribute("role")).toBe("img");
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("正在加载");

    rerender(<LoadingOrbit />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("LoadingDots", () => {
  it("三颗点按 size 缩放，颜色跟随 currentColor", () => {
    const { container } = render(<LoadingDots size={16} className="text-signal" />);
    const dots = container.querySelector(".sk-dots");

    expect(dots).not.toBeNull();
    expect(dots?.className).toContain("text-signal");
    expect(dots?.querySelectorAll("i")).toHaveLength(3);
    expect((dots as HTMLElement).style.fontSize).toBe("16px");
  });
});

describe("HintCheck", () => {
  it("draw 模式：淡底圈 + 描线对勾 + 呼吸光晕", () => {
    const { container } = render(<HintCheck />);
    const svg = container.querySelector("svg.sk-check");

    expect(svg).not.toBeNull();
    expect(svg?.querySelector(".sk-check__ring")).not.toBeNull();
    expect(svg?.querySelector(".sk-check__mark")).not.toBeNull();
    expect(svg?.querySelector(".sk-check__halo")).not.toBeNull();
    expect(svg?.querySelector(".sk-check__disc")).toBeNull();
  });

  it("pop 模式：实心圆 + 白勾，没有描线圈", () => {
    const { container } = render(<HintCheck mode="pop" />);
    const svg = container.querySelector("svg.sk-check--pop");

    expect(svg).not.toBeNull();
    expect(svg?.querySelector(".sk-check__disc")).not.toBeNull();
    expect(svg?.querySelector(".sk-check__disc-mark")).not.toBeNull();
    expect(svg?.querySelector(".sk-check__ring")).toBeNull();
  });
});

describe("HintAsk", () => {
  it("两层涟漪 + 呼吸核心，尺寸吃 size", () => {
    const { container } = render(<HintAsk size={20} className="text-decide" />);
    const ask = container.querySelector(".sk-ask") as HTMLElement;

    expect(ask).not.toBeNull();
    expect(ask.className).toContain("text-decide");
    expect(ask.querySelectorAll(".sk-ask__ripple")).toHaveLength(2);
    expect(ask.querySelector(".sk-ask__core")).not.toBeNull();
    expect(ask.style.width).toBe("20px");
    expect(ask.style.height).toBe("20px");
  });
});

describe("HintError", () => {
  it("画叉 glyph，只渲染一次", () => {
    const { container } = render(<HintError size={16} />);
    const svg = container.querySelector("svg.sk-error");

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.querySelector(".sk-error__ring")).not.toBeNull();
    expect(svg?.querySelector(".sk-error__cross")).not.toBeNull();
  });
});
