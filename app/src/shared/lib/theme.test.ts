import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  getThemeSnapshot,
  initTheme,
  readThemePreference,
  resolveTheme,
  setThemePreference,
  subscribeTheme,
  THEME_STORAGE_KEY,
} from "./theme";

function mockLightSystem(light: boolean) {
  return vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: light && query.includes("light"),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

beforeEach(() => {
  localStorage.clear();
  setThemePreference("dark");
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("theme preference", () => {
  it("defaults to system when nothing is stored", () => {
    localStorage.clear();
    expect(readThemePreference()).toBe("system");
  });

  it("reads a stored preference and rejects invalid values", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(readThemePreference()).toBe("light");

    localStorage.setItem(THEME_STORAGE_KEY, "neon");
    expect(readThemePreference()).toBe("system");
  });

  it("follows matchMedia on a fresh install", () => {
    mockLightSystem(true);
    localStorage.clear();
    initTheme();
    expect(getThemeSnapshot()).toEqual({ preference: "system", resolved: "light" });
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("resolves system preference from matchMedia", () => {
    mockLightSystem(true);
    expect(resolveTheme("system")).toBe("light");
    mockLightSystem(false);
    expect(resolveTheme("system")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("applies data-theme, dark class and color-scheme together", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");

    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("persists the preference and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTheme(listener);

    setThemePreference("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(getThemeSnapshot()).toEqual({ preference: "light", resolved: "light" });
    expect(listener).toHaveBeenCalledTimes(1);

    setThemePreference("light");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("initTheme applies the stored preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(getThemeSnapshot().resolved).toBe("light");
  });
});
