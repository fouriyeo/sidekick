import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DshHookStatus } from "@/shared/lib/tauri";

const tauri = vi.hoisted(() => ({
  getDshHookStatus: vi.fn(),
  installDshHook: vi.fn(),
  setDshHookEnabled: vi.fn(),
  removeDshHook: vi.fn(),
  testDshHook: vi.fn(),
  subscribeDshHookStatus: vi.fn(),
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import {
  defaultHookProfile,
  describeHookError,
  describeHookStatus,
  formatHookEventSource,
  formatHookHeartbeat,
  HOOK_STATE_LABELS,
  useHookStore,
} from "./hook-store";

function makeStatus(overrides: Partial<DshHookStatus> = {}): DshHookStatus {
  return {
    installed: true,
    enabled: true,
    connected: true,
    profile: "desktop",
    currentState: "working",
    sessions: 1,
    lastEventAt: 1_000,
    lastHeartbeatAt: 2_000,
    pluginVersion: 1,
    endpoint: "http://127.0.0.1:47815/hook/dsh",
    configPath: "/Users/test/.dsh/sidekick/config.json",
    pluginPath: "/Users/test/.dsh/profiles/desktop/plugins/sidekick-hook.mjs",
    patchPath: "/Users/test/.dsh/profiles/desktop/cordis.patch.yml",
    error: null,
    recentEvents: [{ at: 1_000, state: "working", sessions: 1, source: "dsh" }],
    profiles: [
      { name: "desktop", label: "桌面端", active: true, installed: true },
      { name: "web", label: "网页端", active: false, installed: false },
    ],
    ...overrides,
  };
}

const unsubscribe = vi.fn();

beforeEach(() => {
  useHookStore.getState().reset();
  vi.resetAllMocks();
  tauri.subscribeDshHookStatus.mockReturnValue(unsubscribe);
});

describe("useHookStore", () => {
  it("refresh 成功时写入状态快照", async () => {
    const snapshot = makeStatus();
    tauri.getDshHookStatus.mockResolvedValue(snapshot);

    await useHookStore.getState().refresh();

    const state = useHookStore.getState();
    expect(tauri.getDshHookStatus).toHaveBeenCalledTimes(1);
    expect(state.status).toEqual(snapshot);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("refresh 失败时把原始报错收成可读中文与下一步", async () => {
    tauri.getDshHookStatus.mockRejectedValue(new Error("permission denied"));

    await useHookStore.getState().refresh();

    const state = useHookStore.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toContain("读取联动失败");
    expect(state.error).toContain("没有写入权限");
    expect(state.error).toContain("下一步");
  });

  it("install 成功后写入新状态并返回 true", async () => {
    const snapshot = makeStatus({ installed: true });
    tauri.installDshHook.mockResolvedValue(snapshot);

    const ok = await useHookStore.getState().install("web");

    expect(ok).toBe(true);
    expect(tauri.installDshHook).toHaveBeenCalledWith("web");
    expect(useHookStore.getState().status).toEqual(snapshot);
    expect(useHookStore.getState().busy).toBeNull();
  });

  it("install 失败时返回 false 并提示写入下一步", async () => {
    tauri.installDshHook.mockRejectedValue("ENOENT: no such file or directory");

    const ok = await useHookStore.getState().install("desktop");

    const state = useHookStore.getState();
    expect(ok).toBe(false);
    expect(state.busy).toBeNull();
    expect(state.error).toContain("写入联动失败");
    expect(state.error).toContain("找不到 DSH");
    expect(state.error).toContain("~/.dsh");
  });

  it("setEnabled 失败时给出切换错误", async () => {
    tauri.setDshHookEnabled.mockRejectedValue(new Error("时间同步失败"));

    await useHookStore.getState().setEnabled(false);

    const state = useHookStore.getState();
    expect(tauri.setDshHookEnabled).toHaveBeenCalledWith(false);
    expect(state.busy).toBeNull();
    expect(state.error).toContain("切换联动失败");
    expect(state.error).toContain("时间同步失败");
  });

  it("remove 失败时给出移除错误，成功时写回状态", async () => {
    tauri.removeDshHook.mockRejectedValueOnce(new Error("磁盘只读"));
    const failed = await useHookStore.getState().remove();
    expect(failed).toBe(false);
    expect(useHookStore.getState().error).toContain("移除联动失败");
    expect(useHookStore.getState().error).toContain("磁盘只读");

    const snapshot = makeStatus({
      installed: false,
      enabled: false,
      connected: false,
      profile: null,
      pluginPath: null,
      patchPath: null,
    });
    tauri.removeDshHook.mockResolvedValueOnce(snapshot);
    const ok = await useHookStore.getState().remove();
    expect(ok).toBe(true);
    expect(useHookStore.getState().status).toEqual(snapshot);
  });

  it("simulate 把状态传给 testDshHook 并写回快照", async () => {
    const snapshot = makeStatus({ currentState: "asking", sessions: 2 });
    tauri.testDshHook.mockResolvedValue(snapshot);

    await useHookStore.getState().simulate("asking");

    expect(tauri.testDshHook).toHaveBeenCalledWith("asking");
    expect(useHookStore.getState().status?.currentState).toBe("asking");
  });

  it("init 只订阅一次，事件会更新状态，reset 会退订", () => {
    const handlers: Array<(status: DshHookStatus) => void> = [];
    tauri.subscribeDshHookStatus.mockImplementation((next: (status: DshHookStatus) => void) => {
      handlers.push(next);
      return unsubscribe;
    });

    useHookStore.getState().init();
    useHookStore.getState().init();
    expect(tauri.subscribeDshHookStatus).toHaveBeenCalledTimes(1);
    expect(handlers).toHaveLength(1);

    const snapshot = makeStatus({ currentState: "completed" });
    handlers[0]?.(snapshot);

    expect(useHookStore.getState().status).toEqual(snapshot);
    expect(useHookStore.getState().loading).toBe(false);

    useHookStore.getState().reset();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(useHookStore.getState().status).toBeNull();
  });
});

describe("describeHookStatus", () => {
  it("未读取时是 muted", () => {
    expect(describeHookStatus(null).tone).toBe("muted");
  });

  it("未安装是 waiting，提示需要写入", () => {
    const summary = describeHookStatus(makeStatus({ installed: false, enabled: false }));
    expect(summary.tone).toBe("waiting");
    expect(summary.label).toBe("未写入");
    expect(summary.detail).toContain("重启");
  });

  it("已安装但未连接提示重启/连接；暂停时提示开关关闭", () => {
    expect(describeHookStatus(makeStatus({ connected: false })).detail).toContain(
      "等待 DeepSeek Harness 重启/连接",
    );
    expect(describeHookStatus(makeStatus({ enabled: false, connected: false })).label).toBe(
      "已暂停",
    );
  });

  it("连接成功是 connected，错误优先是 error", () => {
    expect(describeHookStatus(makeStatus()).tone).toBe("connected");
    const errored = describeHookStatus(makeStatus({ error: "写入 patch 失败" }));
    expect(errored.tone).toBe("error");
    expect(errored.detail).toBe("写入 patch 失败");
  });
});

describe("hook 展示辅助函数", () => {
  it("给四态提供产品文案", () => {
    expect(HOOK_STATE_LABELS).toEqual({
      idle: "静态",
      working: "工作中",
      asking: "等你决定",
      completed: "刚完成（3 秒）",
    });
  });

  it("默认 profile 依次取已安装、运行中、第一个和 desktop", () => {
    expect(defaultHookProfile(null)).toBe("desktop");
    expect(defaultHookProfile(makeStatus({ profile: "web" }))).toBe("web");
    expect(defaultHookProfile(makeStatus({ profile: null }))).toBe("desktop");
    expect(
      defaultHookProfile(
        makeStatus({
          profile: null,
          profiles: [
            { name: "web", label: "网页端", active: false, installed: false },
            { name: "cli", label: "命令行", active: true, installed: false },
          ],
        }),
      ),
    ).toBe("cli");
  });

  it("心跳和事件来源不会展示内容", () => {
    expect(formatHookHeartbeat(null)).toBe("还没有收到心跳");
    expect(formatHookHeartbeat(makeStatus({ lastHeartbeatAt: 2_000 }), 17_000)).toBe("15 秒前");
    expect(formatHookEventSource("dsh")).toBe("DSH");
    expect(formatHookEventSource("test")).toBe("手动模拟");
    expect(formatHookEventSource("phone")).toBe("phone");
  });

  it("错误文案带动作、原因和下一步", () => {
    const message = describeHookError("写入", new Error("EACCES"));
    expect(message).toContain("写入联动失败");
    expect(message).toContain("没有写入权限");
    expect(message).toContain("下一步");
    expect(describeHookError("读取", "")).toContain("未知错误");
  });
});
