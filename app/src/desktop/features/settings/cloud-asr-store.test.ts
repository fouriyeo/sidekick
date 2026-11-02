import { describe, expect, it } from "vitest";
import type { CloudAsrStatus } from "@/shared/lib/tauri";
import {
  draftFromStatus,
  normalizeEndpoint,
  parseVocabulary,
  validateCloudAsrDraft,
} from "./cloud-asr-store";

function makeStatus(overrides: Partial<CloudAsrStatus> = {}): CloudAsrStatus {
  return {
    engine: "local",
    configured: true,
    consent: true,
    hasKey: true,
    keyMasked: "sk-••••cdef",
    fallbackToLocal: true,
    localReady: true,
    config: {
      endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
      workspaceId: "",
      model: "qwen-audio-3.1-asr-flash-streaming",
      languageHints: ["zh"],
      keepDialect: false,
      vadModel: "near_meeting_16k",
      maxSentenceSilenceMs: 800,
      heartbeat: true,
      vocabulary: [],
    },
    ...overrides,
  };
}

describe("normalizeEndpoint", () => {
  it("把 https 转成 wss 并补默认路径", () => {
    expect(normalizeEndpoint("https://dashscope.aliyuncs.com")).toBe(
      "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
    );
  });

  it("缺省协议时补 wss", () => {
    expect(normalizeEndpoint("dashscope.aliyuncs.com")).toBe(
      "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
    );
  });

  it("保留已有路径", () => {
    expect(normalizeEndpoint("wss://host/custom/path")).toBe("wss://host/custom/path");
  });
});

describe("parseVocabulary", () => {
  it("trim、去空行、去重并保序", () => {
    expect(parseVocabulary("  异步 \n\n注释\r\n异步\n  ")).toEqual(["异步", "注释"]);
  });
});

describe("validateCloudAsrDraft", () => {
  it("业务空间占位符必须填 ID", () => {
    const status = makeStatus();
    const draft = {
      ...draftFromStatus(status),
      endpoint: "wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference",
    };
    const result = validateCloudAsrDraft(draft, status);
    expect(result.config).toBeNull();
    expect(result.fieldErrors.workspaceId).toContain("业务空间 ID");
  });

  it("允许本机 ws://localhost 测试", () => {
    const status = makeStatus();
    const draft = {
      ...draftFromStatus(status),
      endpoint: "ws://localhost:8080/api-ws/v1/inference",
    };
    const result = validateCloudAsrDraft(draft, status);
    expect(result.config?.endpoint).toBe("ws://localhost:8080/api-ws/v1/inference");
  });

  it("静音断句超出范围时报错", () => {
    const status = makeStatus();
    const result = validateCloudAsrDraft(
      { ...draftFromStatus(status), maxSentenceSilenceMs: 100 },
      status,
    );
    expect(result.config).toBeNull();
    expect(result.fieldErrors.maxSentenceSilenceMs).toBeTruthy();
  });

  it("热词超过 50 个时报错", () => {
    const status = makeStatus();
    const vocabularyText = Array.from({ length: 51 }, (_, index) => `词${index}`).join("\n");
    const result = validateCloudAsrDraft({ ...draftFromStatus(status), vocabularyText }, status);
    expect(result.config).toBeNull();
    expect(result.fieldErrors.vocabulary).toBeTruthy();
  });
});
