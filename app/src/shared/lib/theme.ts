import { useSyncExternalStore } from "react";
import { readLocal, THEME_STORAGE_KEY, writeLocal } from "./local-storage";

export { THEME_STORAGE_KEY };

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export type ThemeSnapshot = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
};

const DEFAULT_PREFERENCE: ThemePreference = "dark";
const THEME_QUERY = "(prefers-color-scheme: light)";

const listeners = new Set<() => void>();

function isPreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  try {
    return window.matchMedia(THEME_QUERY).matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function readThemePreference(): ThemePreference {
  const saved = readLocal(THEME_STORAGE_KEY);
  return isPreference(saved) ? saved : DEFAULT_PREFERENCE;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  return systemTheme();
}

/** 把主题同步到 <html>：class 服务 Tailwind dark: 变体，data-theme 服务令牌。 */
export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  }
  return resolved;
}

function initialSnapshot(): ThemeSnapshot {
  const preference = readThemePreference();
  return { preference, resolved: resolveTheme(preference) };
}

let snapshot: ThemeSnapshot = initialSnapshot();

function emit(): void {
  for (const listener of listeners) listener();
}

function update(preference: ThemePreference): void {
  const resolved = applyTheme(preference);
  if (snapshot.preference === preference && snapshot.resolved === resolved) return;
  snapshot = { preference, resolved };
  emit();
}

export function getThemeSnapshot(): ThemeSnapshot {
  return snapshot;
}

export function setThemePreference(preference: ThemePreference): void {
  writeLocal(THEME_STORAGE_KEY, preference);
  update(preference);
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  ensureGlobalListeners();
  return () => {
    listeners.delete(listener);
  };
}

let globalListenersReady = false;

function onSystemChange(): void {
  if (snapshot.preference === "system") update("system");
}

function onStorage(event: StorageEvent): void {
  if (event.key !== THEME_STORAGE_KEY) return;
  update(readThemePreference());
}

function ensureGlobalListeners(): void {
  if (globalListenersReady || typeof window === "undefined") return;
  globalListenersReady = true;
  try {
    if (typeof window.matchMedia === "function") {
      window.matchMedia(THEME_QUERY).addEventListener("change", onSystemChange);
    }
  } catch {
    /* 老 WebView 没有 addEventListener 时跟随系统不可用，默认深色 */
  }
  window.addEventListener("storage", onStorage);
}

/** 入口调用一次：应用当前偏好并挂上系统主题监听。 */
export function initTheme(): void {
  ensureGlobalListeners();
  update(readThemePreference());
}

export function useTheme(): ThemeSnapshot {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeSnapshot);
}
