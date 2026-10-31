import { describe, expect, it } from "vitest";
import type { AsrStatus, ModelProgress } from "@/shared/lib/tauri";
import { mergeModelProgress } from "./model-store";

const status: AsrStatus = {
  dir: "/tmp/models",
  selected: "base",
  models: [
    {
      id: "base",
      label: "Base",
      fileName: "ggml-base.bin",
      approxBytes: 100,
      sizeBytes: 100,
      downloaded: true,
      selected: true,
      note: "",
    },
    {
      id: "tiny",
      label: "Tiny",
      fileName: "ggml-tiny.bin",
      approxBytes: 20,
      sizeBytes: 0,
      downloaded: false,
      selected: false,
      note: "",
    },
  ],
  downloading: null,
};

function progress(overrides: Partial<ModelProgress> = {}): ModelProgress {
  return {
    modelId: "tiny",
    received: 10,
    total: 20,
    state: "downloading",
    ...overrides,
  };
}

describe("mergeModelProgress", () => {
  it("tracks an active download", () => {
    const next = mergeModelProgress(status, progress());
    expect(next.downloading).toEqual({ id: "tiny", received: 10, total: 20 });
    expect(next.models.find((model) => model.id === "tiny")?.downloaded).toBe(false);
  });

  it("marks a finished model as downloaded", () => {
    const next = mergeModelProgress(status, progress({ state: "done", received: 20 }));
    expect(next.downloading).toBeNull();
    expect(next.models.find((model) => model.id === "tiny")?.downloaded).toBe(true);
    expect(next.models.find((model) => model.id === "tiny")?.sizeBytes).toBe(20);
    expect(next.selected).toBe("base");
  });

  it("selects the first downloaded model when none is selected", () => {
    const next = mergeModelProgress(
      { ...status, selected: null },
      progress({ state: "done", received: 20 }),
    );
    expect(next.selected).toBe("tiny");
  });

  it("clears progress on cancel", () => {
    const next = mergeModelProgress(status, progress({ state: "cancelled" }));
    expect(next.downloading).toBeNull();
  });
});
