import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { postureForOrientation } from "./posture";
import { useOrientation } from "./use-orientation";

type ChangeListener = (event: MediaQueryListEvent) => void;

function mockOrientation(initialPortrait: boolean) {
  let matches = initialPortrait;
  const listeners = new Set<ChangeListener>();
  const media = {
    get matches() {
      return matches;
    },
    media: "(orientation: portrait)",
    onchange: null,
    addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: ChangeListener) => listeners.delete(listener),
    addListener: (listener: ChangeListener) => listeners.add(listener),
    removeListener: (listener: ChangeListener) => listeners.delete(listener),
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;

  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    if (query.includes("orientation: portrait")) return media;
    return { ...media, matches: false } as MediaQueryList;
  });

  return {
    setPortrait(next: boolean) {
      matches = next;
      for (const listener of [...listeners]) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOrientation", () => {
  it("reads the current orientation and reacts to changes", () => {
    const control = mockOrientation(true);
    const { result } = renderHook(() => useOrientation());

    expect(result.current).toBe("portrait");

    act(() => control.setPortrait(false));
    expect(result.current).toBe("landscape");

    act(() => control.setPortrait(true));
    expect(result.current).toBe("portrait");
  });

  it("maps orientation to posture", () => {
    expect(postureForOrientation("landscape")).toBe("docked");
    expect(postureForOrientation("portrait")).toBe("handheld");
  });
});
