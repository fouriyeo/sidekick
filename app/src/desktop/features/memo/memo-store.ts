import { create } from "zustand";
import type { MemoDetail, MemoSummary } from "@/protocol/memo";
import { memoGet, memoList, normalizeError } from "@/shared/lib/tauri";

type DesktopMemoState = {
  items: MemoSummary[];
  loading: boolean;
  error: string | null;
  detail: MemoDetail | null;
  detailLoading: boolean;
  load: () => Promise<void>;
  open: (id: string) => Promise<void>;
  close: () => void;
};

/** 桌面只读镜像：列表/详情都来自本机 `~/.sidekick/sidekick.db`，不写手机数据。 */
export const useDesktopMemoStore = create<DesktopMemoState>((set) => ({
  items: [],
  loading: false,
  error: null,
  detail: null,
  detailLoading: false,

  load: async () => {
    set({ loading: true });
    try {
      set({ items: await memoList(), loading: false, error: null });
    } catch (error) {
      set({ loading: false, error: normalizeError(error) });
    }
  },

  open: async (id) => {
    set({ detailLoading: true });
    try {
      const detail = await memoGet(id);
      set({ detail, detailLoading: false, error: null });
    } catch (error) {
      set({ detail: null, detailLoading: false, error: normalizeError(error) });
    }
  },

  close: () => set({ detail: null, detailLoading: false }),
}));
