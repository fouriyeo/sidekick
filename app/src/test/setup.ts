import "@testing-library/jest-dom/vitest";

if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

if (typeof globalThis.ResizeObserver !== "function") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverStub,
  });
}

if (typeof navigator.vibrate !== "function") {
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: () => true,
  });
}

if (typeof Element.prototype.scrollTo !== "function") {
  Object.defineProperty(Element.prototype, "scrollTo", {
    configurable: true,
    value: () => undefined,
  });
}

// jsdom 不实现 SVG 几何测量；BoopFace 的皮肤 painter 用它们画纹理/描边，
// 缺了会在 setSkin 时抛 getTotalLength is not a function。
type SvgMeasureProto = SVGElement & {
  getTotalLength?: () => number;
  getPointAtLength?: (distance: number) => { x: number; y: number };
  getBBox?: () => { x: number; y: number; width: number; height: number };
};
const svgProto = window.SVGElement?.prototype as SvgMeasureProto | undefined;
// DOM lib 里 SVGElement 没有这几个几何方法（在 SVGGeometryElement 上），
// 这里按「任意属性表」访问，避免 tsc 报「不存在于 SVGElement」。
const svgProbe = svgProto as unknown as Record<string, unknown> | undefined;
if (svgProto && svgProbe) {
  if (typeof svgProbe.getTotalLength !== "function") {
    Object.defineProperty(svgProto, "getTotalLength", {
      configurable: true,
      value: () => 100,
    });
  }
  if (typeof svgProbe.getPointAtLength !== "function") {
    Object.defineProperty(svgProto, "getPointAtLength", {
      configurable: true,
      value: () => ({ x: 0, y: 0 }),
    });
  }
  if (typeof svgProbe.getBBox !== "function") {
    Object.defineProperty(svgProto, "getBBox", {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    });
  }
}
