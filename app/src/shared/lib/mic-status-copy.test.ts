import { describe, expect, it } from "vitest";
import { MIC_STATUS_COPY, micErrorText, REMOTE_HUD_COPY, remoteHudText } from "./mic-status-copy";

describe("micErrorText", () => {
  it("区分云端内部异常与网络错误", () => {
    expect(micErrorText("cloud_internal")).toBe(MIC_STATUS_COPY.cloudInternal);
    expect(micErrorText("cloud_network")).toBe(MIC_STATUS_COPY.cloudNetwork);
    expect(micErrorText("cloud_internal")).not.toBe(micErrorText("cloud_network"));
  });

  it("后台未待命/通知被拒有专门提示，不退化成未连接", () => {
    expect(remoteHudText({ state: "unavailable", reason: "standby_off" }).title).toBe(
      REMOTE_HUD_COPY.standbyOff,
    );
    expect(remoteHudText({ state: "unavailable", reason: "notification_denied" }).title).toBe(
      REMOTE_HUD_COPY.notificationDenied,
    );
    expect(remoteHudText({ state: "unavailable", reason: "service_failed" }).title).toBe(
      REMOTE_HUD_COPY.serviceFailed,
    );
    expect(remoteHudText({ state: "failed", reason: "start_timeout" }).title).toBe(
      REMOTE_HUD_COPY.startTimeout,
    );
  });
});
