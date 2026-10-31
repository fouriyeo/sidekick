import { create } from "zustand";
import {
  type AsrModelId,
  type AsrStatus,
  cancelAsrDownload,
  deleteAsrModel,
  downloadAsrModel,
  getAsrStatus,
  type ModelProgress,
  normalizeError,
  selectAsrModel,
} from "@/shared/lib/tauri";

type ModelState = {
  status: AsrStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  download: (id: AsrModelId) => Promise<void>;
  cancel: () => Promise<void>;
  remove: (id: AsrModelId) => Promise<void>;
  select: (id: AsrModelId) => Promise<void>;
  applyProgress: (progress: ModelProgress) => void;
  clearError: () => void;
};

export function mergeModelProgress(status: AsrStatus, progress: ModelProgress): AsrStatus {
  const isActive = progress.state === "downloading";
  const models = status.models.map((model) => {
    if (model.id !== progress.modelId) return model;
    if (progress.state === "done") {
      return {
        ...model,
        downloaded: true,
        sizeBytes: progress.received,
        selected: status.selected === null || status.selected === model.id,
      };
    }
    return model;
  });

  return {
    ...status,
    models,
    selected:
      progress.state === "done" && status.selected === null ? progress.modelId : status.selected,
    downloading: isActive
      ? { id: progress.modelId, received: progress.received, total: progress.total }
      : null,
  };
}

export const useModelStore = create<ModelState>((set, get) => ({
  status: null,
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const status = await getAsrStatus();
      set({ status, loading: false });
    } catch (cause) {
      set({ loading: false, error: normalizeError(cause) });
    }
  },

  download: async (id) => {
    set({ error: null });
    try {
      await downloadAsrModel(id);
    } catch (cause) {
      set({ error: normalizeError(cause) });
    }
  },

  cancel: async () => {
    try {
      await cancelAsrDownload();
    } catch (cause) {
      set({ error: normalizeError(cause) });
    }
  },

  remove: async (id) => {
    set({ error: null });
    try {
      const status = await deleteAsrModel(id);
      set({ status });
    } catch (cause) {
      set({ error: normalizeError(cause) });
    }
  },

  select: async (id) => {
    set({ error: null });
    try {
      const status = await selectAsrModel(id);
      set({ status });
    } catch (cause) {
      set({ error: normalizeError(cause) });
    }
  },

  applyProgress: (progress) => {
    const status = get().status;
    if (!status) return;
    set({
      status: mergeModelProgress(status, progress),
      error: progress.state === "error" ? (progress.message ?? "模型下载失败") : get().error,
    });
  },

  clearError: () => set({ error: null }),
}));
