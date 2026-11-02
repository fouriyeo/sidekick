import { describe, expect, it } from "vitest";
import type { CloudAsrStatus } from "@/shared/lib/tauri";
import {
  draftFromStatus,
  hintsToLanguage,
  languageToHints,
  normalizeEndpoint,
  parseVocabulary,
  validateCloudDraft,
} from "./cloud-asr-store";

function makeStatus(overrides: Partial<CloudAsrStatus> = {}): CloudAsrStatus {
  return {
    configured: true,
    consent: true,
    hasKey: true,
    keyMasked: "sk-••••cdef",
    config: {
      endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
      model: "qwen-audio-3.1-asr-flash-streaming",
      languageHints: ["zh"],
      keepDialect: false,
      vadModel: "near_meeting_16k",
      maxSentenceSilenceMs: 800,
      heartbeat: true,
      vocabulary: ["异步"],
    },
    ...overrides,
  };
}

describe("normalizeEndpoint", () => {
  it("https 转 wss 并补默认路径", () => {
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

describe("language helpers / vocabulary", () => {
  it("language hints 互转", () => {
    expect(languageToHints("zh")).toEqual(["zh"]);
    expect(languageToHints("auto")).toEqual([]);
    expect(languageToHints("zh-en")).toEqual(["zh", "en"]);
    expect(hintsToLanguage([])).toBe("auto");
    expect(hintsToLanguage(["zh", "en"])).toBe("zh-en");
    expect(hintsToLanguage(["zh"])).toBe("zh");
  });

  it("热词 trim、去空行、去重并保序", () => {
    expect(parseVocabulary("  异步 \n\n注释\r\n异步\n  ")).toEqual(["异步", "注释"]);
  });
});

describe("validateCloudDraft", () => {
  it("允许本机 ws://localhost 测试", () => {
    const status = makeStatus();
    const draft = {
      ...draftFromStatus(status),
      endpoint: "ws://localhost:8080/api-ws/v1/inference",
    };
    const result = validateCloudDraft(draft, status);
    expect(result.config?.endpoint).toBe("ws://localhost:8080/api-ws/v1/inference");
  });

  it("静音断句超出范围时报错", () => {
    const status = makeStatus();
    const result = validateCloudDraft(
      { ...draftFromStatus(status), maxSentenceSilenceMs: 100 },
      status,
    );
    expect(result.config).toBeNull();
    expect(result.fieldErrors.maxSentenceSilenceMs).toBeTruthy();
  });

  it("热词超过 50 个时报错", () => {
    const status = makeStatus();
    const vocabularyText = Array.from({ length: 51 }, (_, index) => `词${index}`).join("\n");
    const result = validateCloudDraft({ ...draftFromStatus(status), vocabularyText }, status);
    expect(result.config).toBeNull();
    expect(result.fieldErrors.vocabulary).toBeTruthy();
  });

  it("未保存 Key 时必须临时输入 Key", () => {
    const status = makeStatus({ hasKey: false, keyMasked: null });
    const draft = { ...draftFromStatus(status), apiKey: "" };
    expect(validateCloudDraft(draft, status).fieldErrors.apiKey).toBeTruthy();
    expect(validateCloudDraft({ ...draft, apiKey: "sk-test" }, status).config).not.toBeNull();
  });
});
