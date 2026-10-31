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
