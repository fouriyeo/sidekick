import { create } from "zustand";
import {
  type CloudAsrConfig,
  type CloudAsrStatus,
  type CloudAsrTestResult,
  getCloudAsrStatus,
  normalizeError,
  saveCloudAsr,
  saveCloudKeywords,
  testCloudAsr,
} from "@/shared/lib/tauri";

export const DEFAULT_CLOUD_ENDPOINT = "wss://dashscope.aliyuncs.com/api-ws/v1/inference";
export const DEFAULT_CLOUD_MODEL = "qwen-audio-3.1-asr-flash-streaming";

export const CLOUD_ENDPOINT_PRESETS = {
  beijing: DEFAULT_CLOUD_ENDPOINT,
  singapore: "wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference",
} as const;

export type CloudLanguage = "zh" | "auto" | "zh-en";

export type CloudVadModel = "near_meeting_16k" | "far_field_meeting_16k";

export type CloudDraft = {
  endpoint: string;
  model: string;
  language: CloudLanguage;
  keepDialect: boolean;
  vadModel: CloudVadModel;
  maxSentenceSilenceMs: number;
  consent: boolean;
  apiKey: string;
};

export type CloudField = "endpoint" | "model" | "apiKey" | "maxSentenceSilenceMs" | "consent";

export type CloudFieldErrors = Partial<Record<CloudField, string>>;

export type CloudValidation = {
  config: CloudAsrConfig | null;
  fieldErrors: CloudFieldErrors;
};

type CloudState = {
  status: CloudAsrStatus | null;
  draft: CloudDraft | null;
  loading: boolean;
  saving: boolean;
  testing: boolean;
  error: string | null;
  fieldErrors: CloudFieldErrors;
  testResult: CloudAsrTestResult | null;
  savedNotice: string | null;
  load: () => Promise<void>;
  setDraft: (patch: Partial<CloudDraft>) => void;
  resetDraft: () => void;
  save: () => Promise<void>;
  runTest: () => Promise<void>;
  clearKey: () => Promise<void>;
  saveKeywords: (keywords: string[]) => Promise<CloudAsrStatus>;
  clearMessages: () => void;
  reset: () => void;
};

const initialState = {
  status: null,
  draft: null,
  loading: false,
  saving: false,
  testing: false,
  error: null,
  fieldErrors: {} as CloudFieldErrors,
  testResult: null,
  savedNotice: null,
};

export function languageToHints(language: CloudLanguage): string[] {
  if (language === "auto") return [];
  if (language === "zh-en") return ["zh", "en"];
  return ["zh"];
}

export function hintsToLanguage(hints: string[]): CloudLanguage {
  if (hints.length === 0) return "auto";
  if (hints.includes("zh") && hints.includes("en")) return "zh-en";
  return "zh";
}

/** 统一服务地址：http(s) → ws(s)，缺省补 /api-ws/v1/inference。 */
export function normalizeEndpoint(raw: string): string {
  let value = raw.trim();
  if (!value) return "";
  if (/^https:\/\//i.test(value)) {
    value = `wss://${value.slice("https://".length)}`;
  } else if (/^http:\/\//i.test(value)) {
    value = `ws://${value.slice("http://".length)}`;
  } else if (!/^wss?:\/\//i.test(value)) {
    value = `wss://${value}`;
  }

  const schemeEnd = value.indexOf("://");
  if (schemeEnd === -1) return value;
  const rest = value.slice(schemeEnd + 3);
  const slash = rest.indexOf("/");
  if (slash === -1 || rest.slice(slash) === "/") {
    return `${value.replace(/\/+$/, "")}/api-ws/v1/inference`;
  }
  return value;
}

function endpointHost(endpoint: string): string {
  const schemeEnd = endpoint.indexOf("://");
  if (schemeEnd === -1) return "";
  return endpoint.slice(schemeEnd + 3).split("/")[0] ?? "";
}

function isLocalHost(host: string): boolean {
  const withoutPort = host.replace(/:\d+$/, "").toLowerCase();
  return (
    withoutPort === "localhost" ||
    withoutPort === "127.0.0.1" ||
    withoutPort === "::1" ||
    withoutPort === "[::1]"
  );
}

export function validateCloudDraft(
  draft: CloudDraft,
  status: CloudAsrStatus | null,
): CloudValidation {
  const fieldErrors: CloudFieldErrors = {};
  const endpoint = normalizeEndpoint(draft.endpoint);

  if (!endpoint) {
    fieldErrors.endpoint = "请填写服务地址";
  } else {
    const host = endpointHost(endpoint);
    const isWss = /^wss:\/\//i.test(endpoint);
    const isLocalWs = /^ws:\/\//i.test(endpoint) && isLocalHost(host);
    if (!host) {
      fieldErrors.endpoint = "服务地址缺少主机名";
    } else if (!isWss && !isLocalWs) {
      fieldErrors.endpoint = "服务地址必须是 wss://（本机测试可用 ws://localhost）";
    }
  }

  if (!draft.model.trim()) {
    fieldErrors.model = "请填写模型名";
  }

  const silence = Number(draft.maxSentenceSilenceMs);
  if (!Number.isInteger(silence) || silence < 200 || silence > 6000) {
    fieldErrors.maxSentenceSilenceMs = "静音断句需在 200–6000ms 之间";
  }

  if (!status?.hasKey && !draft.apiKey.trim()) {
    fieldErrors.apiKey = "请填写百炼 API Key";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { config: null, fieldErrors };
  }

  return {
    config: {
      endpoint,
      model: draft.model.trim(),
      languageHints: languageToHints(draft.language),
      keepDialect: draft.keepDialect,
      vadModel: draft.vadModel,
      maxSentenceSilenceMs: silence,
      heartbeat: status?.config.heartbeat ?? true,
      vocabulary: status?.config.vocabulary ?? [],
    },
    fieldErrors: {},
  };
}

export function draftFromStatus(status: CloudAsrStatus): CloudDraft {
  return {
    endpoint: status.config.endpoint,
    model: status.config.model,
    language: hintsToLanguage(status.config.languageHints),
    keepDialect: status.config.keepDialect,
    vadModel: status.config.vadModel,
    maxSentenceSilenceMs: status.config.maxSentenceSilenceMs,
    consent: status.consent,
    apiKey: "",
  };
}

export const useCloudAsrStore = create<CloudState>((set, get) => ({
  ...initialState,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const status = await getCloudAsrStatus();
      set({ status, draft: draftFromStatus(status), loading: false });
    } catch (cause) {
      set({ loading: false, error: `读取百炼配置失败：${normalizeError(cause)}` });
    }
  },

  setDraft: (patch) => {
    const { draft } = get();
    if (!draft) return;
    set({
      draft: { ...draft, ...patch },
      fieldErrors: {},
      error: null,
      testResult: null,
      savedNotice: null,
    });
  },

  resetDraft: () => {
    const { status } = get();
    if (!status) return;
    set({
      draft: draftFromStatus(status),
      fieldErrors: {},
      testResult: null,
      error: null,
      savedNotice: null,
    });
  },

  save: async () => {
    const { draft, status } = get();
    if (!draft || !status) return;

    if (!draft.consent) {
      set({
        fieldErrors: { consent: "请先勾选同意，再保存" },
        error: "请先勾选同意，再保存。",
      });
      return;
    }

    const validation = validateCloudDraft(draft, status);
    if (!validation.config) {
      set({ fieldErrors: validation.fieldErrors, error: "请检查表单后再保存。" });
      return;
    }

    set({ saving: true, error: null, fieldErrors: {}, savedNotice: null });
    try {
      const saved = await saveCloudAsr({
        config: validation.config,
        consent: draft.consent,
        apiKey: draft.apiKey.trim() || null,
        clearKey: false,
      });
      set({
        status: saved,
        draft: draftFromStatus(saved),
        saving: false,
        savedNotice: "已保存",
      });
    } catch (cause) {
      set({ saving: false, error: `保存失败：${normalizeError(cause)}` });
    }
  },

  runTest: async () => {
    const { draft, status } = get();
    if (!draft || !status) return;

    const validation = validateCloudDraft(draft, status);
    if (!validation.config) {
      set({ fieldErrors: validation.fieldErrors, error: "请检查表单后再测试。" });
      return;
    }

    set({ testing: true, testResult: null, error: null, fieldErrors: {} });
    try {
      const result = await testCloudAsr({
        config: validation.config,
        apiKey: draft.apiKey.trim() || null,
      });
      set({ testing: false, testResult: result });
    } catch (cause) {
      set({
        testing: false,
        testResult: {
          ok: false,
          latencyMs: null,
          model: null,
          errorCode: "cloud_test_failed",
          message: normalizeError(cause),
        },
      });
    }
  },

  clearKey: async () => {
    const { status } = get();
    if (!status) return;

    set({ saving: true, error: null, savedNotice: null });
    try {
      const next = await saveCloudAsr({
        config: status.config,
        consent: status.consent,
        apiKey: null,
        clearKey: true,
      });
      set({
        status: next,
        draft: draftFromStatus(next),
        saving: false,
        savedNotice: "已清除 Key",
      });
    } catch (cause) {
      set({ saving: false, error: `清除 Key 失败：${normalizeError(cause)}` });
    }
  },

  saveKeywords: async (keywords) => {
    const saved = await saveCloudKeywords(keywords);
    const { draft } = get();
    set({
      status: saved,
      draft: draft ?? draftFromStatus(saved),
      error: null,
    });
    return saved;
  },

  clearMessages: () => set({ error: null, fieldErrors: {}, testResult: null, savedNotice: null }),

  reset: () => set({ ...initialState, fieldErrors: {} }),
}));
