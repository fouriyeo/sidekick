import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoSummary } from "@/protocol/memo";

const api = vi.hoisted(() => ({
  memoList: vi.fn(),
  memoGet: vi.fn(),
  memoUpdate: vi.fn(),
  memoDelete: vi.fn(),
  memoDeleteAudio: vi.fn(),
  memoRetry: vi.fn(),
  memoKeyStatus: vi.fn(),
  memoKeySave: vi.fn(),
  memoKeyClear: vi.fn(),
  memoPairApply: vi.fn(),
  memoStorageStats: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => ({
  ...api,
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

import { useMemoStore } from "./memo-store";

function memo(overrides: Partial<MemoSummary> = {}): MemoSummary {
  return {
    id: "memo-1",
    createdAt: 1,
    updatedAt: 1,
    memoType: "memo",
    title: "标题",
    summary: null,
    todos: [],
    tags: [],
    durationMs: 1000,
    status: "done",
    aiStatus: "ok",
    hasAudio: true,
    audioBytes: 32000,
    synced: false,
    failedSegment: null,
    lastError: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useMemoStore.setState({
    items: [],
    loading: false,
    error: null,
    detail: null,
    detailId: null,
    detailLoading: false,
    key: null,
    storage: null,
    keepAudio: true,
  });
});

describe("备忘录 store", () => {
  it("加载列表", async () => {
    api.memoList.mockResolvedValue([memo()]);
    await useMemoStore.getState().load();
    expect(useMemoStore.getState().items).toHaveLength(1);
    expect(useMemoStore.getState().loading).toBe(false);
  });

  it("加载失败保留错误", async () => {
    api.memoList.mockRejectedValue(new Error("读取失败"));
    await useMemoStore.getState().load();
    expect(useMemoStore.getState().error).toBe("读取失败");
  });

  it("删除后从列表移除", async () => {
    useMemoStore.setState({ items: [memo(), memo({ id: "memo-2" })] });
    api.memoDelete.mockResolvedValue(undefined);
    await useMemoStore.getState().remove("memo-1");
    expect(useMemoStore.getState().items.map((item) => item.id)).toEqual(["memo-2"]);
  });

  it("改标题/类型用回包更新行", async () => {
    useMemoStore.setState({ items: [memo()] });
    api.memoUpdate.mockResolvedValue(memo({ title: "新标题", memoType: "idea" }));
    await useMemoStore.getState().updateMeta("memo-1", { title: "新标题", memoType: "idea" });
    expect(useMemoStore.getState().items[0]?.title).toBe("新标题");
    expect(useMemoStore.getState().items[0]?.memoType).toBe("idea");
  });

  it("关掉保留录音后，加载时清掉已完成条目的音频", async () => {
    useMemoStore.setState({ keepAudio: false });
    api.memoList.mockResolvedValue([memo(), memo({ id: "memo-2", status: "offline" })]);
    api.memoDeleteAudio.mockResolvedValue(undefined);
    await useMemoStore.getState().load();
    await vi.waitFor(() => expect(api.memoDeleteAudio).toHaveBeenCalledTimes(1));
    expect(api.memoDeleteAudio).toHaveBeenCalledWith("memo-1");
  });

  it("配对结果落盘后刷新 Key 状态", async () => {
    api.memoPairApply.mockResolvedValue({});
    api.memoKeyStatus.mockResolvedValue({
      hasKey: true,
      keyMasked: "sk-…abcd",
      paired: true,
      deviceId: "d",
    });
    const ok = await useMemoStore.getState().applyPair({ token: "t", key: "sk-1" });
    expect(ok).toBe(true);
    expect(api.memoPairApply).toHaveBeenCalledWith("t", "sk-1");
    expect(useMemoStore.getState().key?.hasKey).toBe(true);
  });
});
