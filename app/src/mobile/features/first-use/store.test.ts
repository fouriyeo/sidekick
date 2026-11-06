import { beforeEach, expect, test } from "vitest";
import { FIRST_USE_KEY } from "@/shared/lib/local-storage";
import { useFirstUseStore } from "./store";

const DESKTOP_STATUS = {
  type: "desktop.status",
  v: 1,
  asrConfigured: true,
  asrHasKey: true,
  accessibilityTrusted: false,
  ts: 1730000000000,
} as const;

beforeEach(() => {
  window.localStorage.clear();
  useFirstUseStore.setState({
    micReady: false,
    dismissed: false,
    hydrated: false,
    desktop: null,
  });
});

test("hydrates from empty storage", () => {
  useFirstUseStore.getState().hydrate();
  expect(useFirstUseStore.getState().hydrated).toBe(true);
  expect(useFirstUseStore.getState().micReady).toBe(false);
  expect(useFirstUseStore.getState().dismissed).toBe(false);
  expect(useFirstUseStore.getState().desktop).toBeNull();
});

test("mic ready and dismiss are persisted", () => {
  useFirstUseStore.getState().markMicReady();
  useFirstUseStore.getState().dismiss();
  const raw = window.localStorage.getItem(FIRST_USE_KEY);
  expect(raw).not.toBeNull();
  expect(JSON.parse(raw ?? "{}")).toEqual({ micReady: true, dismissed: true });

  useFirstUseStore.setState({ micReady: false, dismissed: false, hydrated: false });
  useFirstUseStore.getState().hydrate();
  expect(useFirstUseStore.getState().micReady).toBe(true);
  expect(useFirstUseStore.getState().dismissed).toBe(true);
});

test("applyDesktopStatus takes effect but never touches localStorage", () => {
  useFirstUseStore.getState().applyDesktopStatus(DESKTOP_STATUS);

  expect(useFirstUseStore.getState().desktop).toEqual({
    asrConfigured: true,
    asrHasKey: true,
    accessibilityTrusted: false,
    at: 1730000000000,
  });
  // 电脑侧状态是运行态：持久化 JSON 形状不变，不把 desktop 写进 localStorage。
  expect(window.localStorage.getItem(FIRST_USE_KEY)).toBeNull();
});

test("hydrate keeps an already applied desktop snapshot", () => {
  useFirstUseStore.getState().applyDesktopStatus(DESKTOP_STATUS);
  useFirstUseStore.getState().hydrate();

  expect(useFirstUseStore.getState().hydrated).toBe(true);
  expect(useFirstUseStore.getState().desktop?.asrConfigured).toBe(true);
});

test("reset clears local persisted state and the desktop snapshot", () => {
  useFirstUseStore.getState().markMicReady();
  useFirstUseStore.getState().dismiss();
  useFirstUseStore.getState().applyDesktopStatus(DESKTOP_STATUS);
  useFirstUseStore.getState().reset();
  expect(useFirstUseStore.getState().micReady).toBe(false);
  expect(useFirstUseStore.getState().dismissed).toBe(false);
  expect(useFirstUseStore.getState().desktop).toBeNull();
  expect(JSON.parse(window.localStorage.getItem(FIRST_USE_KEY) ?? "{}")).toEqual({
    micReady: false,
    dismissed: false,
  });
});
