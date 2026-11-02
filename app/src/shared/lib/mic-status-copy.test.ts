import { describe, expect, it } from "vitest";
import { MIC_STATUS_COPY, micErrorText } from "./mic-status-copy";

describe("micErrorText", () => {
  it("区分云端内部异常与网络错误", () => {
    expect(micErrorText("cloud_internal")).toBe(MIC_STATUS_COPY.cloudInternal);
    expect(micErrorText("cloud_network")).toBe(MIC_STATUS_COPY.cloudNetwork);
    expect(micErrorText("cloud_internal")).not.toBe(micErrorText("cloud_network"));
  });
});
