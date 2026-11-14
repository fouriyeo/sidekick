import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteMicCommand } from "@/protocol/remote-mic";

const tauri = vi.hoisted(() => ({
  sendRemoteMicAck: vi.fn(async (_input: unknown) => undefined),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { handleRemoteMicCommand, registerRemoteMicController } from "./remote-mic";

afterEach(() => {
  registerRemoteMicController(null);
  vi.clearAllMocks();
});

function command(action: RemoteMicCommand["action"]): RemoteMicCommand {
  return { v: 1, type: "mic.remote", requestId: "h1", action, ts: 1 };
}

describe("handleRemoteMicCommand", () => {
  it("宠物页没挂载时明确回 not_pet_page（不静默）", async () => {
    registerRemoteMicController(null);
    await handleRemoteMicCommand(command("start"));
    expect(tauri.sendRemoteMicAck).toHaveBeenCalledWith({
      requestId: "h1",
      action: "start",
      ok: false,
      code: "not_pet_page",
    });
  });

  it("控制器接受后回 ok", async () => {
    registerRemoteMicController({
      start: async () => ({ ok: true }),
      stop: async () => ({ ok: true }),
      cancel: async () => ({ ok: true }),
    });
    await handleRemoteMicCommand(command("start"));
    expect(tauri.sendRemoteMicAck).toHaveBeenCalledWith({
      requestId: "h1",
      action: "start",
      ok: true,
      code: null,
    });
  });

  it("把失败码原样带回桌面", async () => {
    registerRemoteMicController({
      start: async () => ({ ok: false, code: "audio_blocked" }),
      stop: async () => ({ ok: false, code: "not_recording" }),
      cancel: async () => ({ ok: false, code: "not_recording" }),
    });
    await handleRemoteMicCommand(command("start"));
    expect(tauri.sendRemoteMicAck).toHaveBeenCalledWith({
      requestId: "h1",
      action: "start",
      ok: false,
      code: "audio_blocked",
    });
  });

  it("stop / cancel 走各自的控制器函数", async () => {
    const stop = vi.fn(async () => ({ ok: true }));
    const cancel = vi.fn(async () => ({ ok: true }));
    registerRemoteMicController({
      start: async () => ({ ok: true }),
      stop,
      cancel,
    });
    await handleRemoteMicCommand(command("stop"));
    await handleRemoteMicCommand(command("cancel"));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
