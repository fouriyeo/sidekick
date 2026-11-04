import { beforeEach, expect, test } from "vitest";
import { deviceCountFromClients, useDesktopClientsStore } from "./desktop-clients-store";

beforeEach(() => {
  useDesktopClientsStore.getState().reset();
});

test("keeps clients count and derives approximate device count", () => {
  expect(deviceCountFromClients(null)).toBe(0);
  useDesktopClientsStore.getState().apply(1);
  expect(useDesktopClientsStore.getState().clients).toBe(1);
  expect(deviceCountFromClients(1)).toBe(0);
  useDesktopClientsStore.getState().apply(2);
  expect(deviceCountFromClients(2)).toBe(1);
});

test("ignores malformed counts and resets", () => {
  useDesktopClientsStore.getState().apply(3);
  useDesktopClientsStore.getState().apply(-1);
  useDesktopClientsStore.getState().apply(Number.NaN);
  expect(useDesktopClientsStore.getState().clients).toBe(3);
  useDesktopClientsStore.getState().reset();
  expect(useDesktopClientsStore.getState().clients).toBeNull();
});
