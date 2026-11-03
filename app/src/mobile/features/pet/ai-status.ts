import type { StatusMessage, StatusState } from "@/protocol/messages";
import type { CopyId, PetPhase, PetState } from "./types";

/** 宠物的四种 AI 联动状态；idle 对应产品里的「静态」。 */
export type AiState = StatusState;

/** completed 默认展示时长；桌面端会在消息里带 remainingMs 校正。 */
export const AI_COMPLETED_MS = 3000;
/** 工作态文案展示时长；之后只保留动作。 */
export const AI_WORK_CAPTION_MS = 5000;

export type AiStatus = {
  state: AiState;
  /** completed 结束后回到的稳定态；其它状态时等于 state。 */
  resume: AiState;
  /** 进入当前状态的本机时间（文案计时/动画节奏用）。 */
  enteredAt: number;
  /** 仅 completed 有值：本机时间轴上 completed 结束的时刻。 */
  completedUntil: number | null;
  /** 桌面聚合的顶层会话数；手机不展示数字，只用于调试。 */
  sessions: number;
  source: StatusMessage["source"] | null;
  /** 最近一条状态消息的 ts；用于判断重连/后台补发的快照是否过期。 */
  messageTs: number;
};

/** 一次状态切换的元数据；store 用它触发触感/音效/文案。 */
export type AiTransition = {
  from: AiState;
  to: AiState;
  at: number;
  /** 仅 to === "completed" 有值：本次 completed 的实际展示时长。 */
  completedMs: number | null;
  /** 仅 to === "completed" 有值：结束后回到的稳定态。 */
  resume: AiState | null;
};

export type AiStatusUpdate = {
  status: AiStatus;
  transition: AiTransition | null;
  /** 消息太旧（典型是切后台/重连后补发的 completed），已忽略。 */
  stale: boolean;
};

export type AiApplyOptions = {
  now?: number;
  /** 录音中不震不响；由 app.tsx 从 mic store 传入。 */
  micListening?: boolean;
  /** 前台判定；缺省读 document.visibilityState。 */
  visible?: boolean;
};

export function createIdleAiStatus(): AiStatus {
  return {
    state: "idle",
    resume: "idle",
    enteredAt: 0,
    completedUntil: null,
    sessions: 0,
    source: null,
    messageTs: 0,
  };
}

/** completed 不能当作 resume（否则会无限循环庆祝），统一落回 idle。 */
function toStableState(value: StatusState | null | undefined): AiState {
  if (!value || value === "completed") return "idle";
  return value;
}

/** completed 最多展示 3 秒：remainingMs 只会在 0–3000 之间做校正。 */
function completedDuration(remainingMs: number | null | undefined): number {
  if (typeof remainingMs !== "number" || !Number.isFinite(remainingMs)) return AI_COMPLETED_MS;
  return Math.min(AI_COMPLETED_MS, Math.max(0, Math.round(remainingMs)));
}

/**
 * 把 AI 状态推进到 `now`：completed 到期后回到 resume 态。
 * asking 没有到期时间，会一直保留到下一份状态消息。
 */
export function settleAiStatus(status: AiStatus, now: number): AiStatus {
  if (status.state !== "completed" || status.completedUntil === null) return status;
  if (now < status.completedUntil) return status;

  const resume = toStableState(status.resume);
  return {
    ...status,
    state: resume,
    resume,
    enteredAt: status.completedUntil,
    completedUntil: null,
  };
}

/** 立即结束 completed（切后台/隐藏时不重播庆祝），其它状态原样返回。 */
export function finishCompleted(status: AiStatus, now: number): AiStatus {
  if (status.state !== "completed") return status;
  return {
    ...status,
    state: status.resume,
    resume: status.resume,
    enteredAt: now,
    completedUntil: null,
  };
}

/**
 * 应用一条协议状态消息。
 *
 * - completed 用 remainingMs（缺省 3000ms）展示，并用消息 ts 估算已经过去的时间；
 *   太旧的 completed 直接忽略，避免回前台/重连时重播庆祝。
 * - asking 持续到下一份状态消息；新状态会取消旧的 completed 计时。
 * - 同状态快照只更新元数据，不重置 enteredAt（避免轮询把文案计时一直续命）。
 */
export function applyAiStatus(
  current: AiStatus,
  message: StatusMessage,
  options: AiApplyOptions = {},
): AiStatusUpdate {
  const now = options.now ?? Date.now();
  const settled = settleAiStatus(current, now);

  if (message.state === "completed") {
    const duration = completedDuration(message.remainingMs);
    const age = Math.max(0, now - message.ts);
    if (duration <= 0 || age >= duration) {
      return { status: settled, transition: null, stale: true };
    }

    const resume = toStableState(message.resume);
    const status: AiStatus = {
      state: "completed",
      resume,
      enteredAt: now,
      completedUntil: now + (duration - age),
      sessions: message.sessions,
      source: message.source,
      messageTs: message.ts,
    };

    return {
      status,
      transition:
        settled.state === "completed"
          ? null
          : {
              from: settled.state,
              to: "completed",
              at: now,
              completedMs: duration - age,
              resume,
            },
      stale: false,
    };
  }

  if (settled.state === message.state) {
    return {
      status: {
        ...settled,
        resume: message.state,
        sessions: message.sessions,
        source: message.source,
        messageTs: message.ts,
      },
      transition: null,
      stale: false,
    };
  }

  return {
    status: {
      state: message.state,
      resume: message.state,
      enteredAt: now,
      completedUntil: null,
      sessions: message.sessions,
      source: message.source,
      messageTs: message.ts,
    },
    transition: {
      from: settled.state,
      to: message.state,
      at: now,
      completedMs: null,
      resume: null,
    },
    stale: false,
  };
}

/**
 * 舞台最终展示的 AI 姿态。录音/即时心情反馈会让 AI 状态暂时让位；
 * asking 会盖过睡觉（夜里也完整叫醒），completed/working 同样会叫醒睡觉状态。
 */
export function displayStateOf(pet: PetPhase | Pick<PetState, "phase">, ai: AiState): AiState {
  const phase = typeof pet === "string" ? pet : pet.phase;

  if (
    phase === "away" ||
    phase === "listening" ||
    phase === "celebrating" ||
    phase === "concerned"
  ) {
    return "idle";
  }

  return ai;
}

/**
 * 状态文案跟随状态出现：working 5 秒、completed 到庆祝结束、asking 一直保留。
 * 返回 CopyId 由 store 渲染成气泡文本（设置页/AI 关闭时也能复用）。
 */
export function aiCaptionCopyId(status: AiStatus, now: number): CopyId | null {
  if (status.state === "asking") return "ai_asking";
  if (status.state === "completed") {
    return status.completedUntil !== null && now < status.completedUntil ? "ai_completed" : null;
  }
  if (status.state === "working") {
    return now - status.enteredAt < AI_WORK_CAPTION_MS ? "ai_working" : null;
  }
  return null;
}

/** 工程文档里的旧称呼：与 applyAiStatus 是同一个纯函数。 */
export { applyAiStatus as reduceAiStatus };
