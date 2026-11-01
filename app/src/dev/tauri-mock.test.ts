import { afterEach, describe, expect, it } from "vitest";
import { subscribeBackButton } from "@/shared/lib/tauri";
import { installTauriMock } from "./tauri-mock";

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

function pressEscape() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
}

function flushPromises() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("dev tauri mock 返回键", () => {
  it("注册后按 Esc 触发返回，退订后不再触发", async () => {
    installTauriMock();
    const payloads: unknown[] = [];
    const unsubscribe = subscribeBackButton((payload) => payloads.push(payload));

    await flushPromises();
    pressEscape();
    expect(payloads).toEqual([{ canGoBack: false }]);

    unsubscribe();
    await flushPromises();
    pressEscape();
    expect(payloads).toHaveLength(1);
  });
});
