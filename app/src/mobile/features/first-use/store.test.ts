import { beforeEach, expect, test } from "vitest";
import { FIRST_USE_KEY } from "@/shared/lib/local-storage";
import { useFirstUseStore } from "./store";

beforeEach(() => {
  window.localStorage.clear();
  useFirstUseStore.setState({ micReady: false, dismissed: false, hydrated: false });
});

test("hydrates from empty storage", () => {
  useFirstUseStore.getState().hydrate();
  expect(useFirstUseStore.getState().hydrated).toBe(true);
  expect(useFirstUseStore.getState().micReady).toBe(false);
  expect(useFirstUseStore.getState().dismissed).toBe(false);
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

test("reset clears local persisted state", () => {
  useFirstUseStore.getState().markMicReady();
  useFirstUseStore.getState().dismiss();
  useFirstUseStore.getState().reset();
  expect(useFirstUseStore.getState().micReady).toBe(false);
  expect(useFirstUseStore.getState().dismissed).toBe(false);
});
