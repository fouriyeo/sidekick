import type { RemoteMicAckCode, RemoteMicCommand } from "@/protocol/remote-mic";
import { sendRemoteMicAck } from "@/shared/lib/tauri";

/**
 * 手机侧「电脑遥控录音」的接线层。
 *
 * 关键点：`MicButton` 只在宠物页挂载。它挂载时注册控制器，离开页面即注销——
 * 于是「手机不在宠物页」会被如实回给桌面（`not_pet_page`），而不是静默。
 * 本模块不碰录音细节，只做「收到命令 → 调控制器 → 回执」。
 */

export type MicRemoteResult = { ok: boolean; code?: RemoteMicAckCode };

export type RemoteMicController = {
  start: () => Promise<MicRemoteResult>;
  stop: () => Promise<MicRemoteResult>;
  cancel: () => Promise<MicRemoteResult>;
};

let controller: RemoteMicController | null = null;

export function registerRemoteMicController(next: RemoteMicController | null): void {
  controller = next;
}

export function remoteMicReady(): boolean {
  return controller !== null;
}

/** 处理桌面下发的 `mic.remote`；无论成败都回执，桌面靠它决定 HUD 文案。 */
export async function handleRemoteMicCommand(message: RemoteMicCommand): Promise<void> {
  const target = controller;
  const result: MicRemoteResult = target
    ? await (message.action === "start"
        ? target.start()
        : message.action === "stop"
          ? target.stop()
          : target.cancel())
    : { ok: false, code: "not_pet_page" };

  await sendRemoteMicAck({
    requestId: message.requestId,
    action: message.action,
    ok: result.ok,
    code: result.code ?? null,
  }).catch(() => undefined);
}
