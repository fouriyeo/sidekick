import { create } from "zustand";
import {
  type CloudAsrConfig,
  type CloudAsrEngine,
  type CloudAsrStatus,
  type CloudAsrTestResult,
  type CloudAsrVadModel,
  getCloudAsrStatus,
  normalizeError,
  saveCloudAsr,
  selectAsrEngine,
  testCloudAsr,
} from "@/shared/lib/tauri";

export const DEFAULT_CLOUD_ENDPOINT = "wss://dashscope.aliyuncs.com/api-ws/v1/inference";
export const DEFAULT_CLOUD_MODEL = "qwen-audio-3.1-asr-flash-streaming";

export const CLOUD_ENDPOINT_PRESETS = {
  beijing: DEFAULT_CLOUD_ENDPOINT,
  singapore: "wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference",
  workspace: "wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference",
} as const;

export type CloudAsrLanguage = "zh" | "auto" | "zh-en";

export type CloudAsrDraft = {
  endpoint: string;
  workspaceId: string;
  model: string;
  language: CloudAsrLanguage;
  keepDialect: boolean;
  vadModel: CloudAsrVadModel;
  maxSentenceSilenceMs: number;
  vocabularyText: string;
  fallbackToLocal: boolean;
  consent: boolean;
  apiKey: string;
};

export type CloudAsrField =
  | "endpoint"
  | "workspaceId"
  | "model"
  | "apiKey"
  | "maxSentenceSilenceMs"
  | "vocabulary"
  | "consent";

export type CloudAsrFieldErrors = Partial<Record<CloudAsrField, string>>;

export type CloudAsrValidation = {
  config: CloudAsrConfig | null;
  fieldErrors: CloudAsrFieldErrors;
};

type CloudAsrState = {
  status: CloudAsrStatus | null;
  draft: CloudAsrDraft | null;
  activeEngine: CloudAsrEngine;
  loading: boolean;
  saving: boolean;
  testing: boolean;
  error: string | null;
  fieldErrors: CloudAsrFieldErrors;
  testResult: CloudAsrTestResult | null;
  load: () => Promise<void>;
  setActiveEngine: (engine: CloudAsrEngine) => void;
  setDraft: (patch: Partial<CloudAsrDraft>) => void;
  resetDraft: () => void;
  saveAndEnable: () => Promise<void>;
  runTest: () => Promise<void>;
  clearKey: () => Promise<void>;
  selectLocal: () => Promise<void>;
  clearMessages: () => void;
  reset: () => void;
};

const initialState = {
  status: null,
  draft: null,
  activeEngine: "local" as CloudAsrEngine,
  loading: false,
  saving: false,
  testing: false,
  error: null,
  fieldErrors: {} as CloudAsrFieldErrors,
  testResult: null,
};

export function languageToHints(language: CloudAsrLanguage): string[] {
  if (language === "auto") return [];
  if (language === "zh-en") return ["zh", "en"];
  return ["zh"];
}

export function hintsToLanguage(hints: string[]): CloudAsrLanguage {
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

/** 每行一个热词；trim、去空行、去重，保留原始顺序。 */
export function parseVocabulary(text: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

export function validateCloudAsrDraft(
  draft: CloudAsrDraft,
  status: CloudAsrStatus | null,
  options: { requireKey?: boolean } = {},
): CloudAsrValidation {
  const fieldErrors: CloudAsrFieldErrors = {};
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

  if (/\{workspaceid\}/i.test(endpoint) && !draft.workspaceId.trim()) {
    fieldErrors.workspaceId = "使用业务空间域名时必须填写业务空间 ID";
  }

  if (!draft.model.trim()) {
    fieldErrors.model = "请填写模型名";
  }

  const silence = Number(draft.maxSentenceSilenceMs);
  if (!Number.isInteger(silence) || silence < 200 || silence > 6000) {
    fieldErrors.maxSentenceSilenceMs = "静音断句需在 200–6000ms 之间";
  }

  const vocabulary = parseVocabulary(draft.vocabularyText);
  if (vocabulary.length > 50) {
    fieldErrors.vocabulary = "热词最多 50 个";
  }

  if (options.requireKey !== false && !status?.hasKey && !draft.apiKey.trim()) {
    fieldErrors.apiKey = "请填写百炼 API Key";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { config: null, fieldErrors };
  }

  return {
    config: {
      endpoint,
      workspaceId: draft.workspaceId.trim(),
      model: draft.model.trim(),
      languageHints: languageToHints(draft.language),
      keepDialect: draft.keepDialect,
      vadModel: draft.vadModel,
      maxSentenceSilenceMs: silence,
      heartbeat: status?.config.heartbeat ?? true,
      vocabulary,
    },
    fieldErrors: {},
  };
}

export function draftFromStatus(status: CloudAsrStatus): CloudAsrDraft {
  return {
    endpoint: status.config.endpoint,
    workspaceId: status.config.workspaceId,
    model: status.config.model,
    language: hintsToLanguage(status.config.languageHints),
    keepDialect: status.config.keepDialect,
    vadModel: status.config.vadModel,
    maxSentenceSilenceMs: status.config.maxSentenceSilenceMs,
    vocabularyText: status.config.vocabulary.join("\n"),
    fallbackToLocal: status.fallbackToLocal,
    consent: status.consent,
    apiKey: "",
  };
}

export const useCloudAsrStore = create<CloudAsrState>((set, get) => ({
  ...initialState,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const status = await getCloudAsrStatus();
      set({
        status,
        draft: draftFromStatus(status),
        activeEngine: status.engine,
        loading: false,
      });
    } catch (cause) {
      set({ loading: false, error: `读取语音识别设置失败：${normalizeError(cause)}` });
    }
  },

  setActiveEngine: (engine) =>
    set({ activeEngine: engine, error: null, testResult: null, fieldErrors: {} }),

  setDraft: (patch) => {
    const { draft } = get();
    if (!draft) return;
    set({
      draft: { ...draft, ...patch },
      fieldErrors: {},
      error: null,
      testResult: null,
    });
  },

  resetDraft: () => {
    const { status } = get();
    if (!status) return;
    set({ draft: draftFromStatus(status), fieldErrors: {}, testResult: null, error: null });
  },

  saveAndEnable: async () => {
    const { draft, status } = get();
    if (!draft || !status) return;

    if (!draft.consent) {
      set({
        fieldErrors: { consent: "请先勾选同意，再保存启用" },
        error: "请先勾选同意，再保存启用。",
      });
      return;
    }

    const validation = validateCloudAsrDraft(draft, status);
    if (!validation.config) {
      set({ fieldErrors: validation.fieldErrors, error: "请检查表单后再保存。" });
      return;
    }

    set({ saving: true, error: null, fieldErrors: {} });
    let saved: CloudAsrStatus;
    try {
      saved = await saveCloudAsr({
        config: validation.config,
        consent: draft.consent,
        fallbackToLocal: draft.fallbackToLocal,
        apiKey: draft.apiKey.trim() || null,
        clearKey: false,
      });
    } catch (cause) {
      set({ saving: false, error: `保存失败：${normalizeError(cause)}` });
      return;
    }

    set({ status: saved, draft: draftFromStatus(saved) });
    try {
      const next = await selectAsrEngine("bailian");
      set({
        status: next,
        draft: draftFromStatus(next),
        activeEngine: "bailian",
        saving: false,
        testResult: null,
      });
    } catch (cause) {
      set({
        saving: false,
        error: `已保存，但启用失败：${normalizeError(cause)}`,
      });
    }
  },

  runTest: async () => {
    const { draft, status } = get();
    if (!draft || !status) return;

    const validation = validateCloudAsrDraft(draft, status);
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

    set({ saving: true, error: null });
    try {
      const next = await saveCloudAsr({
        config: status.config,
        consent: status.consent,
        fallbackToLocal: status.fallbackToLocal,
        apiKey: null,
        clearKey: true,
      });
      set({
        status: next,
        draft: draftFromStatus(next),
        activeEngine: next.engine,
        saving: false,
        testResult: null,
      });
    } catch (cause) {
      set({ saving: false, error: `清除 Key 失败：${normalizeError(cause)}` });
    }
  },

  selectLocal: async () => {
    const { status } = get();
    if (!status) return;

    set({ saving: true, error: null });
    try {
      const next = await selectAsrEngine("local");
      set({
        status: next,
        draft: draftFromStatus(next),
        activeEngine: "local",
        saving: false,
        testResult: null,
      });
    } catch (cause) {
      set({ saving: false, error: `切回本机失败：${normalizeError(cause)}` });
    }
  },

  clearMessages: () => set({ error: null, fieldErrors: {}, testResult: null }),

  reset: () => set({ ...initialState, fieldErrors: {} }),
}));
