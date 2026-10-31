import { afterEach, describe, expect, it, vi } from "vitest";
import { readLocal, writeLocal } from "./local-storage";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("local storage helpers", () => {
  it("round-trips values", () => {
    expect(writeLocal("key", "value")).toBe(true);
    expect(readLocal("key")).toBe("value");
  });

  it("returns null when storage reads throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readLocal("key")).toBeNull();
  });

  it("returns false when storage writes throw", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });

    expect(writeLocal("key", "value")).toBe(false);
  });
});
