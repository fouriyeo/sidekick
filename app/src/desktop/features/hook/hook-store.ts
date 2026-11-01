import { create } from "zustand";
import { formatRelativeTime } from "@/shared/lib/format";
import {
  type DshHookState,
  type DshHookStatus,
  getDshHookStatus,
  installDshHook,
  normalizeError,
  removeDshHook,
  setDshHookEnabled,
  subscribeDshHookStatus,
  testDshHook,
  type Unsubscribe,
} from "@/shared/lib/tauri";

/** 正在进行的写操作；UI 用它禁用控件，避免重复点击。 */
export type HookBusyAction = "install" | "toggle" | "remove" | "simulate" | null;

type HookState = {
  status: DshHookStatus | null;
  loading: boolean;
  error: string | null;
  busy: HookBusyAction;
  /** 首次使用时订阅一次 dsh-hook-status；重复调用是幂等的。 */
  init: () => void;
  refresh: () => Promise<void>;
  install: (profile: string) => Promise<boolean>;
  setEnabled: (enabled: boolean) => Promise<void>;
  remove: () => Promise<boolean>;
  simulate: (state: DshHookState) => Promise<void>;
  clearError: () => void;
  /** 测试用：退订并恢复初始状态。 */
  reset: () => void;
};

const INITIAL = {
  status: null,
  loading: false,
  error: null,
  busy: null,
} satisfies Omit<
  HookState,
  "init" | "refresh" | "install" | "setEnabled" | "remove" | "simulate" | "clearError" | "reset"
>;

/** 宠物四态在桌面页上的产品文案。 */
export const HOOK_STATE_LABELS: Record<DshHookState, string> = {
  idle: "静态",
  working: "工作中",
  asking: "等你决定",
  completed: "刚完成（3 秒）",
};

export type HookStatusTone = "connected" | "waiting" | "error" | "muted";

export type HookStatusSummary = {
  tone: HookStatusTone;
  label: string;
  detail: string;
};

/** 把状态快照归纳成卡片标题、状态点颜色和一句下一步。 */
export function describeHookStatus(status: DshHookStatus | null): HookStatusSummary {
  if (!status) {
    return { tone: "muted", label: "正在读取", detail: "正在读取 DeepSeek Harness 联动状态…" };
  }
  if (status.error) {
    return { tone: "error", label: "联动出错", detail: status.error };
  }
  if (!status.installed) {
    return {
      tone: "waiting",
      label: "未写入",
      detail: "写入并重启一次 DeepSeek Harness 后生效",
    };
  }
  if (!status.enabled) {
    return {
      tone: "waiting",
      label: "已暂停",
      detail: "联动已写入但开关关闭；打开后 1 秒内热生效",
    };
  }
  if (!status.connected) {
    return {
      tone: "waiting",
      label: "等待连接",
      detail: "已写入，等待 DeepSeek Harness 重启/连接",
    };
  }
  return {
    tone: "connected",
    label: "已连接",
    detail: "DeepSeek Harness 正在同步状态",
  };
}

/** 默认写入哪个 profile：已安装的 > 运行中的 > 第一个；都没有就 desktop。 */
export function defaultHookProfile(status: DshHookStatus | null): string {
  if (!status) return "desktop";
  if (status.profile) return status.profile;
  const active = status.profiles.find((profile) => profile.active);
  if (active) return active.name;
  return status.profiles[0]?.name ?? "desktop";
}

export function formatHookHeartbeat(status: DshHookStatus | null, now = Date.now()): string {
  if (!status?.lastHeartbeatAt) return "还没有收到心跳";
  return formatRelativeTime(status.lastHeartbeatAt, now);
}

/** 事件来源短标签；只展示来源，不展示任何内容。 */
export function formatHookEventSource(source: string): string {
  if (source === "dsh") return "DSH";
  if (source === "test") return "手动模拟";
  return source;
}

export type HookAction = "读取" | "写入" | "切换" | "移除" | "模拟";

const NEXT_STEPS: Record<HookAction, string> = {
  读取: "点「刷新」重试；刚重启 DeepSeek Harness 时等 10 秒再试。",
  写入: "确认 ~/.dsh 目录存在且有写入权限，再点「修复 / 重新写入」。",
  切换: "点「刷新」确认联动仍在，必要时重新写入。",
  移除: "点「刷新」后重试；仍失败可手动删除 cordis.patch.yml 里的 sidekick 标记。",
  模拟: "确认桌面端服务正常后重试，或检查手机是否已连接。",
};

const CAUSE_HINTS: ReadonlyArray<{ pattern: RegExp; hint: string }> = [
  { pattern: /permission denied|EACCES|operation not permitted/i, hint: "没有写入权限" },
  { pattern: /ENOENT|no such file|not found/i, hint: "找不到 DSH 的配置文件或目录" },
  { pattern: /EISDIR|ENOTDIR|is a directory/i, hint: "目标路径不是一个可写文件" },
];

/**
 * 把底层报错收成一句可读中文：做了什么失败 + 原因 + 下一步。
 * 不吞原始信息，方便排查 DSH 版本/路径问题。
 */
export function describeHookError(action: HookAction, cause: unknown): string {
  const raw = normalizeError(cause).trim();
  if (!raw) return `${action}联动失败：未知错误。下一步：${NEXT_STEPS[action]}`;

  const hint = CAUSE_HINTS.find((entry) => entry.pattern.test(raw))?.hint;
  const detail = hint && !raw.includes(hint) ? `${hint}（${raw}）` : raw;
  return `${action}联动失败：${detail}。下一步：${NEXT_STEPS[action]}`;
}

// 桌面 App 生命周期内只需要一条监听；放在模块级避免 StrictMode 重复 listen。
let unsubscribeStatus: Unsubscribe | null = null;

export const useHookStore = create<HookState>((set) => ({
  ...INITIAL,

  init: () => {
    if (unsubscribeStatus) return;
    unsubscribeStatus = subscribeDshHookStatus((status) => {
      set({ status, loading: false });
    });
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const status = await getDshHookStatus();
      set({ status, loading: false });
    } catch (cause) {
      set({ loading: false, error: describeHookError("读取", cause) });
    }
  },

  install: async (profile) => {
    set({ busy: "install", error: null });
    try {
      const status = await installDshHook(profile);
      set({ status, busy: null });
      return true;
    } catch (cause) {
      set({ busy: null, error: describeHookError("写入", cause) });
      return false;
    }
  },

  setEnabled: async (enabled) => {
    set({ busy: "toggle", error: null });
    try {
      const status = await setDshHookEnabled(enabled);
      set({ status, busy: null });
    } catch (cause) {
      set({ busy: null, error: describeHookError("切换", cause) });
    }
  },

  remove: async () => {
    set({ busy: "remove", error: null });
    try {
      const status = await removeDshHook();
      set({ status, busy: null });
      return true;
    } catch (cause) {
      set({ busy: null, error: describeHookError("移除", cause) });
      return false;
    }
  },

  simulate: async (state) => {
    set({ busy: "simulate", error: null });
    try {
      const status = await testDshHook(state);
      set({ status, busy: null });
    } catch (cause) {
      set({ busy: null, error: describeHookError("模拟", cause) });
    }
  },

  clearError: () => set({ error: null }),

  reset: () => {
    unsubscribeStatus?.();
    unsubscribeStatus = null;
    set({ ...INITIAL });
  },
}));
