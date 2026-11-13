type MockRole = "desktop" | "mobile";

const MOCK_EVENTS = ["chat", "conn", "clipboard-changed", "dsh-hook-status", "memo"] as const;
type MockEvent = (typeof MOCK_EVENTS)[number];

type MockHookState = "idle" | "working" | "asking" | "completed";

type MockHookEvent = {
  at: number;
  state: MockHookState;
  sessions: number;
  source: string;
};

type MockInternals = {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  transformCallback: (callback: (payload: unknown) => void) => number;
  unregisterCallback: (id: number) => void;
  convertFileSrc: (path: string) => string;
};

type MockClipboardItem = {
  id: string;
  text: string;
  kind: "text" | "url" | "voice";
  createdAt: number;
  lastUsedAt: number;
  pinned: boolean;
};

type MockMemo = {
  id: string;
  createdAt: number;
  updatedAt: number;
  memoType: "memo" | "todo" | "idea";
  title: string;
  summary: string | null;
  todos: string[];
  tags: string[];
  durationMs: number;
  status: "pending" | "transcribing" | "structuring" | "done" | "failed" | "offline";
  aiStatus: string | null;
  hasAudio: boolean;
  audioBytes: number;
  synced: boolean;
  failedSegment: number | null;
  lastError: string | null;
  transcript: string;
};

function isMockEvent(value: unknown): value is MockEvent {
  return typeof value === "string" && (MOCK_EVENTS as readonly string[]).includes(value);
}

export function installTauriMock(): void {
  if ("__TAURI_INTERNALS__" in window) return;

  const params = new URLSearchParams(window.location.search);
  const role: MockRole = params.get("role") === "mobile" ? "mobile" : "desktop";
  const callbacks = new Map<number, (payload: unknown) => void>();
  const eventHandlers = new Map<MockEvent, number>();
  // Android 返回键监听：key 是 Channel id，value 是下一条通道消息的序号。
  const backListeners = new Map<number, number>();
  const stores = new Map<number, Map<string, unknown>>();
  let nextId = 1;
  let nextStoreId = 1000;

  // 云端 ASR（浏览器 mock）：只用于语音页/浮层预览，不联网。
  const cloudConfig = {
    endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
    model: "qwen-audio-3.1-asr-flash-streaming",
    languageHints: ["zh"],
    keepDialect: false,
    vadModel: "near_meeting_16k" as const,
    maxSentenceSilenceMs: 800,
    heartbeat: true,
    vocabulary: ["异步", "剪贴板", "小跟班"] as string[],
  };
  let cloudConsent = false;
  let cloudKeyMasked: string | null = null;
  let cloudKeySet = false;

  function cloudSnapshot() {
    return {
      configured: cloudConsent && cloudKeySet,
      consent: cloudConsent,
      hasKey: cloudKeySet,
      keyMasked: cloudKeyMasked,
      config: {
        ...cloudConfig,
        languageHints: [...cloudConfig.languageHints],
        vocabulary: [...cloudConfig.vocabulary],
      },
    };
  }

  function usageCost(input: number, output: number) {
    return Math.round((input * 6_000_000 + output * 4_500_000) / 1_000_000);
  }

  function dayLabel(offset: number) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function usageDay(
    offset: number,
    sessions: number,
    input: number,
    output: number,
    audioMs: number,
  ) {
    return {
      date: dayLabel(offset),
      sessions,
      inputTokens: input,
      outputTokens: output,
      totalTokens: input + output,
      audioDurationMs: audioMs,
      costCnyMicros: usageCost(input, output),
    };
  }

  const mockDays = [
    usageDay(0, 3, 1280, 180, 42_000),
    usageDay(1, 5, 2100, 260, 71_000),
    usageDay(2, 2, 640, 90, 22_000),
    usageDay(3, 4, 1750, 210, 58_000),
    usageDay(6, 1, 320, 40, 11_000),
    usageDay(9, 2, 980, 120, 33_000),
    usageDay(20, 3, 1120, 150, 38_000),
    usageDay(45, 4, 1600, 200, 55_000),
    usageDay(120, 2, 700, 80, 24_000),
  ];

  function summarize(offset: number) {
    const recent = mockDays.filter((day) => {
      const start = new Date();
      start.setDate(start.getDate() - offset);
      return (
        day.date >=
        `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`
      );
    });
    return {
      sessions: recent.reduce((sum, day) => sum + day.sessions, 0),
      inputTokens: recent.reduce((sum, day) => sum + day.inputTokens, 0),
      outputTokens: recent.reduce((sum, day) => sum + day.outputTokens, 0),
      totalTokens: recent.reduce((sum, day) => sum + day.totalTokens, 0),
      audioDurationMs: recent.reduce((sum, day) => sum + day.audioDurationMs, 0),
      costCnyMicros: recent.reduce((sum, day) => sum + day.costCnyMicros, 0),
    };
  }

  function usageSnapshot() {
    const byDate = new Map(mockDays.map((day) => [day.date, day]));
    const days = Array.from({ length: 365 }, (_, offset) => {
      const date = dayLabel(offset);
      return (
        byDate.get(date) ?? {
          date,
          sessions: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          audioDurationMs: 0,
          costCnyMicros: 0,
        }
      );
    });
    return {
      today: summarize(0),
      last7Days: summarize(6),
      last30Days: summarize(29),
      last365Days: summarize(364),
      days,
      priceNote:
        "按百炼北京/新加坡地域价格估算（输入 ¥6/¥6.781、输出 ¥4.5/¥5.104 每百万 Token），实际以百炼账单为准。",
    };
  }

  const clipboard = {
    enabled: true,
    path: "/Mock/.sidekick/clipboard.json",
    maxItems: 100,
    items: [
      {
        id: "1",
        text: "把这段代码改成异步，然后补上注释。",
        kind: "text",
        createdAt: Date.now() - 60_000,
        lastUsedAt: Date.now() - 60_000,
        pinned: true,
      },
      {
        id: "2",
        text: "https://tauri.app/start/",
        kind: "url",
        createdAt: Date.now() - 180_000,
        lastUsedAt: Date.now() - 180_000,
        pinned: false,
      },
      {
        id: "3",
        text: "帮我总结一下今天会议的结论，然后列三条待办。",
        kind: "voice",
        createdAt: Date.now() - 240_000,
        lastUsedAt: Date.now() - 240_000,
        pinned: false,
      },
    ] as MockClipboardItem[],
  };

  const memos: MockMemo[] = [
    {
      id: "mock-memo-1",
      createdAt: Date.now() - 12 * 60_000,
      updatedAt: Date.now() - 10 * 60_000,
      memoType: "todo",
      title: "下班路上买牛奶和鸡蛋",
      summary: "冰箱里的牛奶和鸡蛋都没了，顺路补一下。",
      todos: ["买牛奶", "买鸡蛋"],
      tags: ["生活"],
      durationMs: 42_000,
      status: "done",
      aiStatus: "ok",
      hasAudio: true,
      audioBytes: 42 * 32_000,
      synced: true,
      failedSegment: null,
      lastError: null,
      transcript: "下班路上记得买牛奶和鸡蛋，冰箱里的都没了。",
    },
    {
      id: "mock-memo-2",
      createdAt: Date.now() - 2 * 60 * 60_000,
      updatedAt: Date.now() - 2 * 60 * 60_000,
      memoType: "idea",
      title: "把备忘录做成录音卡",
      summary: "说完自动变成一条可检索的备忘。",
      todos: [],
      tags: ["产品"],
      durationMs: 18_000,
      status: "done",
      aiStatus: "ok",
      hasAudio: true,
      audioBytes: 18 * 32_000,
      synced: false,
      failedSegment: null,
      lastError: null,
      transcript: "我想到可以把备忘录做成一张录音卡，说完就自动变成一条可以检索的备忘。",
    },
    {
      id: "mock-memo-3",
      createdAt: Date.now() - 26 * 60 * 60_000,
      updatedAt: Date.now() - 26 * 60 * 60_000,
      memoType: "memo",
      title: "和产品对一下下周排期",
      summary: null,
      todos: [],
      tags: [],
      durationMs: 9_000,
      status: "offline",
      aiStatus: null,
      hasAudio: true,
      audioBytes: 9 * 32_000,
      synced: false,
      failedSegment: 0,
      lastError: "等待网络，联网后会自动继续。",
      transcript: "",
    },
    {
      id: "mock-memo-4",
      createdAt: Date.now() - 3 * 24 * 60 * 60_000,
      updatedAt: Date.now() - 3 * 24 * 60 * 60_000,
      memoType: "idea",
      title: "通勤路上想到的播客选题",
      summary: "聊一聊语音笔记和日记的边界。",
      todos: [],
      tags: ["播客"],
      durationMs: 51_000,
      status: "done",
      aiStatus: "ok",
      hasAudio: true,
      audioBytes: 51 * 32_000,
      synced: true,
      failedSegment: null,
      lastError: null,
      transcript: "通勤路上想到一个播客选题，聊一聊语音笔记和日记的边界。",
    },
    {
      id: "mock-memo-5",
      createdAt: Date.now() - 9 * 24 * 60 * 60_000,
      updatedAt: Date.now() - 9 * 24 * 60 * 60_000,
      memoType: "todo",
      title: "给妈妈打电话，提醒她体检",
      summary: "周三之前打完。",
      todos: ["打电话", "预约体检"],
      tags: ["家人"],
      durationMs: 24_000,
      status: "done",
      aiStatus: "ok",
      hasAudio: true,
      audioBytes: 24 * 32_000,
      synced: true,
      failedSegment: null,
      lastError: null,
      transcript: "记得给妈妈打电话，提醒她这周去体检。",
    },
    {
      id: "mock-memo-6",
      createdAt: Date.now() - 20 * 24 * 60 * 60_000,
      updatedAt: Date.now() - 20 * 24 * 60 * 60_000,
      memoType: "memo",
      title: "读完《深度工作》的三点笔记",
      summary: "留白、固定时段、别把碎片时间填满。",
      todos: [],
      tags: ["读书"],
      durationMs: 78_000,
      status: "done",
      aiStatus: "ok",
      hasAudio: true,
      audioBytes: 78 * 32_000,
      synced: true,
      failedSegment: null,
      lastError: null,
      transcript: "第一，留白；第二，固定时段；第三，别把碎片时间填满。",
    },
  ];

  let memoKeySet = true;
  let memoPaired = true;
  let memoRecording: { session: string; startedAt: number; bytes: number } | null = null;

  function memoSummary(memo: MockMemo) {
    const { transcript: _transcript, ...summary } = memo;
    return summary;
  }

  function memoDetail(memo: MockMemo) {
    return {
      ...memoSummary(memo),
      transcript: memo.transcript,
      segments: memo.transcript
        ? [{ idx: 0, text: memo.transcript, status: "done" }]
        : [{ idx: 0, text: "", status: "failed" }],
      audioPath: memo.hasAudio ? `/Mock/memos/audio/${memo.id}.wav` : null,
    };
  }

  function memoKeyStatus() {
    return {
      hasKey: memoKeySet,
      keyMasked: memoKeySet ? "sk-…mock" : null,
      paired: memoPaired,
      deviceId: "mock-device",
    };
  }

  function emit(event: MockEvent, payload: unknown) {
    const handlerId = eventHandlers.get(event);
    if (handlerId === undefined) return;
    callbacks.get(handlerId)?.({ event, id: handlerId, payload });
  }

  // 模拟 AppPlugin.trigger("back-button")：按通道消息格式回填 payload。
  function emitBackButton() {
    for (const [channelId, nextIndex] of backListeners) {
      const callback = callbacks.get(channelId);
      if (!callback) continue;
      callback({ index: nextIndex, message: { canGoBack: false } });
      backListeners.set(channelId, nextIndex + 1);
    }
  }

  function clipboardSnapshot() {
    return {
      enabled: clipboard.enabled,
      items: [...clipboard.items].sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        return right.lastUsedAt - left.lastUsedAt;
      }),
      path: clipboard.path,
      maxItems: clipboard.maxItems,
    };
  }

  function emitClipboard() {
    emit("clipboard-changed", clipboardSnapshot());
  }

  // ── AI 联动 mock：浏览器里模拟 DSH 安装/连接/状态推送 ────────────────
  const hookParam = params.get("hook") ?? "none";
  const aiParam = params.get("ai") ?? "idle";
  const mockStateParam = params.get("state");
  const initialHookState: MockHookState =
    mockStateParam === "working" || mockStateParam === "asking" || mockStateParam === "completed"
      ? mockStateParam
      : "working";

  let hookInstalled = hookParam === "installed" || hookParam === "connected";
  let hookEnabled = hookInstalled && hookParam !== "disabled";
  let hookConnected = hookParam === "connected";
  let hookProfile = "desktop";
  let hookState: MockHookState = hookConnected ? initialHookState : "idle";
  let hookSessions = hookConnected ? 1 : 0;
  let hookLastEventAt: number | null = hookConnected ? Date.now() : null;
  let hookLastHeartbeatAt: number | null = hookConnected ? Date.now() : null;
  let hookRecent: MockHookEvent[] = hookConnected
    ? [{ at: Date.now() - 12_000, state: "asking", sessions: 1, source: "dsh" }]
    : [];
  let hookTimer: number | null = null;
  let mockAiTimer: number | null = null;
  const mockAiResume: MockHookState = "idle";

  const mockHookProfiles = [
    { name: "desktop", label: "桌面端", active: true, installed: hookInstalled },
    { name: "web", label: "网页端", active: false, installed: false },
  ];

  function dshHookSnapshot() {
    return {
      installed: hookInstalled,
      enabled: hookEnabled,
      connected: hookConnected,
      profile: hookInstalled ? hookProfile : null,
      currentState: hookState,
      sessions: hookSessions,
      lastEventAt: hookLastEventAt,
      lastHeartbeatAt: hookLastHeartbeatAt,
      pluginVersion: hookInstalled ? 1 : null,
      endpoint: hookInstalled ? "http://127.0.0.1:47815/hook/dsh" : null,
      configPath: "/Mock/.dsh/sidekick/config.json",
      pluginPath: hookInstalled
        ? `/Mock/.dsh/profiles/${hookProfile}/plugins/sidekick-hook.mjs`
        : null,
      patchPath: hookInstalled ? `/Mock/.dsh/profiles/${hookProfile}/cordis.patch.yml` : null,
      error: null,
      recentEvents: hookRecent,
      profiles: mockHookProfiles.map((profile) => ({
        ...profile,
        active: profile.name === hookProfile,
        installed: profile.name === hookProfile ? hookInstalled : profile.installed,
      })),
    };
  }

  function emitDshHookStatus() {
    emit("dsh-hook-status", dshHookSnapshot());
  }

  function clearHookTimer() {
    if (hookTimer !== null) {
      window.clearTimeout(hookTimer);
      hookTimer = null;
    }
  }

  function recordHookState(state: MockHookState, sessions = 1, source = "test") {
    clearHookTimer();
    hookState = state;
    hookSessions = state === "idle" ? 0 : Math.max(1, sessions);
    hookLastEventAt = Date.now();
    hookConnected = true;
    hookLastHeartbeatAt = Date.now();
    hookRecent = [
      { at: hookLastEventAt, state, sessions: hookSessions, source },
      ...hookRecent,
    ].slice(0, 20);
    emitDshHookStatus();
    if (state === "completed") {
      hookTimer = window.setTimeout(() => {
        hookTimer = null;
        hookState = "idle";
        hookSessions = 0;
        hookLastEventAt = Date.now();
        emitDshHookStatus();
      }, 3000);
    }
  }

  /** 浏览器验收：?sessions=N（1–8，默认 1）补多行，方便看折叠/展开/浮层。 */
  function mockSessionCount(): number {
    const value = Number(params.get("sessions") ?? "1");
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(8, Math.trunc(value)));
  }

  /** 多行 mock：第 1 行跟随 ?ai=，其余固定是已完成（方便看完成态与行高）。 */
  function mockSessionList(state: MockHookState, count: number) {
    const now = Date.now();
    return Array.from({ length: count }, (_, index) => {
      if (index === 0) {
        return {
          id: "mock-session-1",
          title: "预览会话",
          source: "dsh",
          state: state === "asking" ? "asking" : state === "working" ? "working" : "idle",
          askKind: state === "asking" ? "question" : null,
          tool: state === "working" ? "bash" : null,
          lastEventAt: now,
          completedAt: state === "completed" ? now : null,
        };
      }
      const at = now - index * 7 * 60_000;
      return {
        id: `mock-session-${index + 1}`,
        title: `历史会话 ${index + 1}`,
        source: "dsh",
        state: "idle",
        askKind: null,
        tool: null,
        lastEventAt: at,
        completedAt: at,
      };
    });
  }

  function emitMockStatus(state: MockHookState, sessionList: ReturnType<typeof mockSessionList>) {
    const message = {
      type: "status",
      v: 1,
      source: "test",
      state,
      sessions: sessionList.length,
      resume: state === "completed" ? mockAiResume : null,
      remainingMs: state === "completed" ? 3000 : null,
      sessionList,
      ts: Date.now(),
    };
    emit("chat", JSON.stringify(message));
  }

  function emitMockAiStatus() {
    if (mockAiTimer !== null) {
      window.clearTimeout(mockAiTimer);
      mockAiTimer = null;
    }
    const requested: MockHookState =
      aiParam === "working" || aiParam === "asking" || aiParam === "completed" ? aiParam : "idle";
    const count = mockSessionCount();

    if (requested === "completed") {
      // 先一份 working、600ms 后 completed：浏览器里能直接看到「完成即自动展开」。
      emitMockStatus("working", mockSessionList("working", count));
      mockAiTimer = window.setTimeout(() => {
        mockAiTimer = null;
        const doneList = mockSessionList("completed", count);
        emitMockStatus("completed", doneList);
        // 3 秒后 AI 聚合态回落（完成行保留，方便继续点它）。
        mockAiTimer = window.setTimeout(() => {
          mockAiTimer = null;
          emitMockStatus(mockAiResume, doneList);
        }, 3000);
      }, 600);
      return;
    }

    emitMockStatus(requested, requested === "idle" ? [] : mockSessionList(requested, count));
  }

  function applyTestHookState(state: MockHookState) {
    hookInstalled = true;
    hookEnabled = true;
    hookConnected = true;
    hookProfile = hookProfile || "desktop";
    recordHookState(state);
    return dshHookSnapshot();
  }

  const mockUsageRanges: Record<string, number> = { today: 1, "7d": 7, "30d": 30, "180d": 180 };
  let mockPricingUpdatedAt = Date.now() - 2 * 60 * 60 * 1000;
  let mockPricingAuto = true;
  let mockMobileModels = true;
  /** 菜单栏看板钉住态（D135）：浏览器里只记状态，不做失焦收起。 */
  let mockPanelPinned = false;

  const usageBucketShares = {
    cacheRead: 0.955,
    input: 0.017,
    output: 0.02,
    cacheWrite: 0.001,
    reasoning: 0.007,
  } as const;

  function mockUsageRng(seed: number) {
    let state = seed;
    return () => {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mockUsageStats(range: string) {
    const dayCount = mockUsageRanges[range] ?? 7;
    // 连同上一区间一起生成，previous 才有真实可比基数；历史最少保留 180 天，
    // 与协议一致（`days` 是「最近最多 180 个真实日期」，不按区间裁剪）——
    // 菜单栏小看板的近 7 天迷你柱在「今天」区间下也才有 7 根柱子。
    const windowDays = Math.max(180, dayCount * 2);
    const rnd = mockUsageRng(20_261_106 + dayCount);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const entries = Array.from({ length: windowDays }, (_, index) => {
      const offset = windowDays - 1 - index;
      const date = new Date(today.getTime() - offset * 86_400_000);
      const weekday = date.getDay();
      const weekend = weekday === 0 || weekday === 6;
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      let spend = 4.0 + Math.sin(offset / 9.5) * 0.9 + (weekend ? -1.25 : 0.42) + rnd() * 0.85;
      const monthDay = `${date.getMonth() + 1}-${date.getDate()}`;
      if (monthDay === "10-21") spend += 4.2;
      if (monthDay === "11-02") spend += 2.2;
      if (monthDay === "10-08") spend += 1.2;
      if (offset === 0) spend *= 0.55; // 今天还没过完
      spend = Math.max(0.35, spend);
      const tokens = Math.round(spend * 16_100_000);
      const bucket = (share: number) => Math.round(tokens * share);
      return {
        date: `${date.getFullYear()}-${month}-${day}`,
        tokens,
        input: bucket(usageBucketShares.input),
        output: bucket(usageBucketShares.output),
        cacheRead: bucket(usageBucketShares.cacheRead),
        cacheWrite: bucket(usageBucketShares.cacheWrite),
        reasoning: bucket(usageBucketShares.reasoning),
        costCnyMicros: Math.round(spend * 1_000_000),
        calls: 180 + Math.round(rnd() * 140),
      };
    });

    const sessionCount = Math.min(214, Math.max(4, Math.round(dayCount * 2.1)));
    const summarize = (slice: typeof entries) => {
      const tokens = slice.reduce((sum, item) => sum + item.tokens, 0);
      const input = slice.reduce((sum, item) => sum + item.input, 0);
      const output = slice.reduce((sum, item) => sum + item.output, 0);
      const cacheRead = slice.reduce((sum, item) => sum + item.cacheRead, 0);
      const cacheWrite = slice.reduce((sum, item) => sum + item.cacheWrite, 0);
      const reasoning = slice.reduce((sum, item) => sum + item.reasoning, 0);
      const cacheBase = input + cacheRead + cacheWrite;
      return {
        tokens,
        input,
        output,
        cacheRead,
        cacheWrite,
        reasoning,
        costCnyMicros: slice.reduce((sum, item) => sum + item.costCnyMicros, 0),
        estimatedCostMicros: 0,
        costSource: "ledger" as const,
        calls: slice.reduce((sum, item) => sum + item.calls, 0),
        sessions: sessionCount,
        cacheHitPct: cacheBase > 0 ? (cacheRead / cacheBase) * 100 : null,
      };
    };

    const current = entries.slice(-dayCount);
    const previous = entries.slice(-2 * dayCount, -dayCount);
    const summary = summarize(current);
    const totalTokens = Math.max(1, summary.tokens);
    const totalCost = Math.max(1, summary.costCnyMicros);

    const buildRows = (
      prefix: string,
      labels: string[],
      weights: number[],
      sub: (index: number) => string,
      tagOther: boolean,
    ) => {
      let spentCost = 0;
      let spentTokens = 0;
      return labels.map((label, index) => {
        const last = index === labels.length - 1;
        const weight = weights[index] ?? 0;
        const cost = last ? totalCost - spentCost : Math.round(totalCost * weight);
        const tokens = last ? totalTokens - spentTokens : Math.round(totalTokens * weight);
        spentCost += cost;
        spentTokens += tokens;
        return {
          key: `${prefix}-${index}`,
          label,
          sub: sub(index),
          tokens,
          costCnyMicros: cost,
          estimatedCostMicros: 0,
          costSource: "ledger" as const,
          sharePct: (tokens / totalTokens) * 100,
          calls: Math.max(1, Math.round(summary.calls * weight)),
          sessions: prefix === "s" ? null : Math.max(1, Math.round(sessionCount * weight)),
          cacheHitPct: 98.15 - index * 0.4,
          modelId: prefix === "m" ? `${label}-${index}` : null,
          provider: prefix === "m" ? "DeepSeek 官方" : null,
          tag: tagOther && last ? "other" : null,
          price:
            prefix === "m"
              ? {
                  inputCnyPerM: 0.288,
                  outputCnyPerM: 0.067,
                  cacheReadCnyPerM: 0.227,
                  cacheWriteCnyPerM: 0,
                  source: "seed",
                }
              : null,
        };
      });
    };

    const recentDate =
      (current[current.length - 2] ?? current[current.length - 1])?.date.slice(5) ?? "";
    const sessions = buildRows(
      "s",
      [
        "修复登录",
        "生成看板",
        "重构协议",
        "跑验收测试",
        "价格表接入",
        "桌面导航",
        "手机页面",
        "其他会话",
      ],
      [0.328, 0.221, 0.154, 0.096, 0.072, 0.051, 0.043, 0.035],
      (index) =>
        index === 7
          ? "未在 Top 8"
          : `最近 ${recentDate} 22:39 · ${Math.round(summary.calls * [0.328, 0.221, 0.154, 0.096, 0.072, 0.051, 0.043][index])} 次调用`,
      true,
    );
    const clients = buildRows(
      "c",
      ["DeepSeek Harness", "手机 App", "网页预览", "其他客户端"],
      [0.918, 0.049, 0.022, 0.011],
      (index) =>
        ["本机 cost-meter · 已接入", "局域网 · 已连接", "浏览器预览", "未在 Top 8"][index] ?? "",
      true,
    );
    const models = buildRows(
      "m",
      ["deepseek-v4.1-flash", "deepseek-v4-pro", "deepseek-v3.2", "其他模型"],
      [0.678, 0.243, 0.058, 0.021],
      (index) =>
        index === 3
          ? "未在 Top 8"
          : `DeepSeek 官方 · 缓存命中 ${(98.15 - index * 0.4).toFixed(1)}%`,
      true,
    );

    return {
      range,
      generatedAt: Date.now(),
      summary,
      previous: summarize(previous),
      days: entries
        .slice(-180)
        .map(({ date, tokens, input, output, cacheRead, cacheWrite, costCnyMicros, calls }) => ({
          date,
          tokens,
          input,
          output,
          cacheRead,
          cacheWrite,
          costCnyMicros,
          calls,
        })),
      groups: {
        clients,
        sessions,
        models: mockMobileModels ? models : [],
        modelsHidden: !mockMobileModels,
      },
      pricing: {
        source: "remote",
        updatedAt: mockPricingUpdatedAt,
        lastAttemptAt: mockPricingUpdatedAt,
        lastError: null,
        stale: false,
        autoRefresh: mockPricingAuto,
        modelCount: 548,
        fxCnyPerUsd: 6.6723,
        fxSource: "ledger",
        mobileModels: mockMobileModels,
      },
      coverageDays: dayCount,
      ledger: { available: true, reason: null as string | null },
    };
  }

  function mockUsageEmpty(range: string) {
    const empty = mockUsageStats(range);
    empty.ledger = { available: false, reason: "ledger_missing" };
    empty.summary = {
      ...empty.summary,
      tokens: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      costCnyMicros: 0,
      estimatedCostMicros: 0,
      costSource: "unknown",
      calls: 0,
      sessions: 0,
      cacheHitPct: null,
    } as unknown as typeof empty.summary;
    empty.days = [];
    empty.groups = { clients: [], sessions: [], models: [], modelsHidden: !mockMobileModels };
    empty.coverageDays = 0;
    return empty;
  }

  // ── 英语角 mock：浏览器里模拟词库/解释/造句，不联网 ──────────────────
  const mockWordState = {
    agreed: params.get("word") !== "consent",
    fail: params.get("word") === "fail",
    empty: params.get("word") === "empty",
    items: [
      {
        word: "throughput",
        phonetic: "/ˈθruːpʊt/",
        pos: "n.",
        zh: "吞吐量；处理量",
        status: "ready" as const,
      },
      {
        word: "deprecate",
        phonetic: "/ˈdeprəkeɪt/",
        pos: "v.",
        zh: "弃用；不推荐使用",
        status: "ready" as const,
      },
      {
        word: "resilient",
        phonetic: "/rɪˈzɪliənt/",
        pos: "adj.",
        zh: "有韧性的；能迅速恢复的",
        status: "pending" as const,
      },
    ].filter(() => !mockWordStateEmpty()),
  };
  function mockWordStateEmpty() {
    return params.get("word") === "empty";
  }
  function wordExplanationOf(word: string, phonetic: string, pos: string, zh: string) {
    return {
      word,
      phonetic,
      pos,
      definitions: [{ zh, en: `the meaning of ${word}` }],
      examples: [
        { en: `The ${word} improved after the refactor.`, zh: `重构之后，${word} 有所改善。` },
        { en: `We measured ${word} every day.`, zh: `我们每天测量 ${word}。` },
      ],
      collocations: [`high ${word}`],
      mistakes: "",
      roots: "",
    };
  }
  const mockWordDetail = (item: (typeof mockWordState.items)[number]) => ({
    id: item.word,
    word: item.word,
    status: item.status,
    source: "manual" as const,
    createdAt: Date.now() - 86_400_000,
    updatedAt: Date.now(),
    phonetic: item.phonetic,
    pos: item.pos,
    firstDefinition: item.zh,
    explanation:
      item.status === "ready"
        ? wordExplanationOf(item.word, item.phonetic, item.pos, item.zh)
        : undefined,
    model: "qwen3.8-flash",
  });
  const mockWordSummary = (item: (typeof mockWordState.items)[number]) => {
    const detail = mockWordDetail(item);
    return {
      id: detail.id,
      word: detail.word,
      status: detail.status,
      source: detail.source,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      phonetic: detail.phonetic,
      pos: detail.pos,
      firstDefinition: detail.firstDefinition,
    };
  };
  const mockWordUsage = () => ({
    today: { calls: 4, promptTokens: 712, completionTokens: 806, costCnyMicros: 2746 },
    last30Days: { calls: 26, promptTokens: 4394, completionTokens: 5120, costCnyMicros: 17344 },
    days: [],
    priceNote: "qwen3.8-flash · 估算（浏览器 mock）",
  });

  const internals: MockInternals = {
    async invoke(command, args) {
      if (command === "app_role") return role;
      // 浏览器没有窗口常亮能力：静默成功，方便验证宠物页逻辑。
      if (command === "set_keep_screen_on") return null;
      // 浏览器没有原生触感：静默成功（真机由 Android performHapticFeedback 执行）。
      if (command === "haptic") return null;
      if (command === "disable_webview_haptics") return null;
      if (command === "server_info") {
        return {
          ip: "127.0.0.1",
          port: 47810,
          url: "http://127.0.0.1:47810",
          discoveryPort: 47820,
        };
      }
      if (command === "discover_servers") {
        const mode = params.get("discover");
        if (mode === "none") return [];
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const devices = [
          { name: "Mock 电脑", ip: "127.0.0.1", port: 47810, addr: "127.0.0.1:47810" },
        ];
        if (mode === "two") {
          devices.push({
            name: "客厅 MacBook",
            ip: "192.168.1.8",
            port: 47810,
            addr: "192.168.1.8:47810",
          });
        }
        return devices;
      }
      if (command === "connect_server") {
        const addr = typeof args?.addr === "string" ? args.addr : "";
        window.setTimeout(() => {
          emit("conn", { online: true, url: addr });
          // 手机 mock：连上后补一条 AI 状态，方便浏览器直接看四态（?ai=working|asking|completed）。
          window.setTimeout(emitMockAiStatus, 200);
        }, 100);
        return null;
      }
      if (command === "send_chat") {
        const text = typeof args?.text === "string" ? args.text : "";
        window.setTimeout(() => {
          emit("chat", JSON.stringify({ type: "chat", from: "phone", text, ts: Date.now() }));
        }, 50);
        return null;
      }
      if (command === "mic_start" || command === "mic_stop") return null;
      if (command === "mic_frame") return null;
      if (command === "send_status_request") {
        window.setTimeout(emitMockAiStatus, 50);
        return null;
      }
      if (command === "send_usage_request") {
        const range = typeof args?.range === "string" ? args.range : "7d";
        // 浏览器验收空状态：?usage=empty（手机页也走这条）
        const data =
          params.get("usage") === "empty" ? mockUsageEmpty(range) : mockUsageStats(range);
        window.setTimeout(() => {
          emit("chat", JSON.stringify({ type: "usage", v: 1, ts: Date.now(), data }));
        }, 120);
        return null;
      }
      if (command === "token_usage_stats") {
        const range = typeof args?.range === "string" ? args.range : "7d";
        // 浏览器验收空状态：?usage=empty
        if (params.get("usage") === "empty") {
          return mockUsageEmpty(range);
        }
        return mockUsageStats(range);
      }
      if (command === "token_pricing_status") return mockUsageStats("7d").pricing;
      if (command === "token_pricing_refresh") {
        mockPricingUpdatedAt = Date.now();
        return mockUsageStats("7d").pricing;
      }
      if (command === "token_pricing_set_auto") {
        mockPricingAuto = args?.enabled !== false;
        return mockUsageStats("7d").pricing;
      }
      if (command === "token_pricing_set_mobile_models") {
        mockMobileModels = args?.enabled !== false;
        return mockUsageStats("7d").pricing;
      }
      // 菜单栏用量小看板（D108）：浏览器里没有真实窗口，两个窗口操作用空实现占位。
      if (command === "hide_usage_panel" || command === "open_usage_page") return null;
      // 浏览器里没有原生材质（D120）：看板保持不透明实色卡，与真机回退态一致。
      if (command === "panel_glass_ready") return false;
      // 钉住（D135）：浏览器里没有失焦收起，只要记住状态，方便 QA 看到按下态。
      if (command === "usage_panel_pinned") return mockPanelPinned;
      if (command === "set_usage_panel_pinned") {
        mockPanelPinned = args?.pinned === true;
        return mockPanelPinned;
      }
      // 尖（D138）：浏览器里没有原生窗口定位，固定在卡片中间，开关默认开。
      if (command === "usage_panel_arrow_x") return 160;
      if (command === "usage_panel_arrow_enabled") return true;
      if (command === "send_focus_request") {
        const requestId = typeof args?.requestId === "string" ? args.requestId : "";
        window.setTimeout(() => {
          emit(
            "chat",
            JSON.stringify({
              type: "focus.result",
              v: 1,
              requestId,
              source: "dsh",
              ok: true,
              error: null,
              ts: Date.now(),
            }),
          );
        }, 300);
        return null;
      }

      if (command === "send_key_request") {
        const requestId = typeof args?.requestId === "string" ? args.requestId : "";
        const action = args?.action === "clear" ? "clear" : "enter";
        // 浏览器验收失败态：?role=mobile&keyError=target_mismatch
        const forcedError = params.get("keyError");
        window.setTimeout(() => {
          emit(
            "chat",
            JSON.stringify({
              type: "key.result",
              v: 1,
              requestId,
              action,
              ok: !forcedError,
              error: forcedError ?? null,
              ts: Date.now(),
            }),
          );
        }, 120);
        return null;
      }

      if (command === "accessibility_info") {
        return {
          trusted: params.get("access") === "1",
          appName: "desktop",
          executablePath: "/Mock/Sidekick/target/debug/desktop",
          isDev: true,
        };
      }
      if (command === "accessibility_open_settings" || command === "accessibility_reveal_app") {
        return null;
      }
      if (command === "accessibility_request") {
        return {
          trusted: params.get("access") === "1",
          appName: "desktop",
          executablePath: "/Mock/Sidekick/target/debug/desktop",
          isDev: true,
        };
      }

      if (command === "asr_cloud_status") return cloudSnapshot();
      if (command === "asr_cloud_save") {
        const input = (args?.input ?? {}) as Record<string, unknown>;
        const config = input.config as Record<string, unknown> | undefined;
        if (config) Object.assign(cloudConfig, config);
        cloudConsent = Boolean(input.consent);
        if (input.clearKey) {
          cloudKeySet = false;
          cloudKeyMasked = null;
        }
        const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
        if (apiKey) {
          cloudKeySet = true;
          cloudKeyMasked = `sk-••••${apiKey.slice(-4)}`;
        }
        return cloudSnapshot();
      }
      if (command === "asr_cloud_test") {
        const apiKey = typeof args?.apiKey === "string" ? args.apiKey.trim() : "";
        if (apiKey === "bad") {
          return {
            ok: false,
            latencyMs: null,
            model: cloudConfig.model,
            errorCode: "cloud_key_invalid",
            message: "百炼 API Key 无效或已过期（mock）",
          };
        }
        return {
          ok: true,
          latencyMs: 286,
          model: cloudConfig.model,
          errorCode: null,
          message: "连接成功 · 286ms（mock）",
        };
      }
      if (command === "asr_cloud_clear") {
        cloudConsent = false;
        cloudKeySet = false;
        cloudKeyMasked = null;
        return cloudSnapshot();
      }
      if (command === "asr_keywords_save") {
        const keywords = (args?.keywords ?? []) as string[];
        cloudConfig.vocabulary = keywords.map((keyword) => String(keyword));
        return cloudSnapshot();
      }
      if (command === "asr_usage_stats") return usageSnapshot();
      if (command === "asr_usage_clear") {
        mockDays.splice(0, mockDays.length);
        return usageSnapshot();
      }

      if (command === "clipboard_list" || command === "clipboard_status") {
        return clipboardSnapshot();
      }
      if (command === "clipboard_copy") {
        const id = String(args?.id ?? "");
        const item = clipboard.items.find((entry) => entry.id === id);
        if (item) item.lastUsedAt = Date.now();
        emitClipboard();
        return clipboardSnapshot();
      }
      if (command === "clipboard_toggle_pin") {
        const item = clipboard.items.find((entry) => entry.id === String(args?.id ?? ""));
        if (item) item.pinned = !item.pinned;
        emitClipboard();
        return clipboardSnapshot();
      }
      if (command === "clipboard_delete") {
        clipboard.items = clipboard.items.filter((entry) => entry.id !== String(args?.id ?? ""));
        emitClipboard();
        return clipboardSnapshot();
      }
      if (command === "clipboard_clear") {
        clipboard.items = [];
        emitClipboard();
        return clipboardSnapshot();
      }
      if (command === "clipboard_set_enabled") {
        clipboard.enabled = Boolean(args?.enabled);
        emitClipboard();
        return clipboardSnapshot();
      }
      if (command === "clipboard_set_max_items") {
        const requested = Number(args?.maxItems ?? clipboard.maxItems);
        clipboard.maxItems = Math.min(200, Math.max(10, Math.round(requested)));
        clipboard.items = clipboard.items.slice(0, clipboard.maxItems);
        emitClipboard();
        return clipboardSnapshot();
      }

      // ── 英语角 ──────────────────────────────────────────────────────────
      if (command === "word_list") {
        const query = String(args?.query ?? "")
          .trim()
          .toLowerCase();
        return mockWordState.items
          .filter((item) => !query || item.word.includes(query))
          .map(mockWordSummary);
      }
      if (command === "word_get") {
        const item = mockWordState.items.find((entry) => entry.word === args?.word);
        return item ? mockWordDetail(item) : null;
      }
      if (command === "word_add") {
        const word = String(args?.word ?? "")
          .trim()
          .toLowerCase();
        if (!word) throw new Error("请输入一个英文单词");
        if (!mockWordState.items.some((entry) => entry.word === word)) {
          mockWordState.items.unshift({
            word,
            phonetic: "",
            pos: "",
            zh: "（mock）待解释",
            status: "pending",
          });
        }
        const added = mockWordState.items.find((entry) => entry.word === word);
        if (!added) throw new Error("词条写入失败");
        return mockWordDetail(added);
      }
      if (command === "word_set_note") {
        const item = mockWordState.items.find((entry) => entry.word === args?.word);
        if (!item) throw new Error("词条不存在");
        return mockWordDetail(item);
      }
      if (command === "word_explain") {
        if (!mockWordState.agreed) throw new Error("need_consent");
        if (mockWordState.fail) throw new Error("model_error");
        const item = mockWordState.items.find((entry) => entry.word === args?.word);
        if (!item) throw new Error("词条不存在");
        item.status = "ready";
        item.zh = item.zh === "（mock）待解释" ? "（mock）AI 解释结果" : item.zh;
        return mockWordDetail(item);
      }
      if (command === "word_delete") {
        mockWordState.items = mockWordState.items.filter((entry) => entry.word !== args?.word);
        return null;
      }
      if (command === "word_generate") {
        const words = ((args?.words ?? []) as string[]).slice(0, 10);
        return {
          model: "qwen3.8-flash",
          sentences: words.map((word, index) => ({
            en: `Sentence ${index + 1} uses the word ${word} naturally.`,
            zh: `第 ${index + 1} 句自然地使用了 ${word}。`,
            words: [word],
          })),
        };
      }
      if (command === "word_usage") return mockWordUsage();
      if (command === "word_status") {
        return {
          hasKey: true,
          agreed: mockWordState.agreed,
          paired: role === "desktop" ? undefined : true,
          model: "qwen3.8-flash",
          total: mockWordState.items.length,
        };
      }
      if (command === "word_consent") {
        mockWordState.agreed = Boolean(args?.agreed);
        return {
          hasKey: true,
          agreed: mockWordState.agreed,
          paired: role === "desktop" ? undefined : true,
          model: "qwen3.8-flash",
          total: mockWordState.items.length,
        };
      }
      if (command === "word_clipboard_candidates") {
        return ["throughput", "resilient", "idempotent"];
      }
      if (command === "word_sync_now") return null;
      if (command === "word_tts") {
        // 浏览器没有原生音频文件：按桌面系统发音兜底返回，UI 只显示提示。
        return { path: "", characters: 0, cached: true, fallback: true };
      }
      if (command === "word_export_markdown") {
        return `# 英语角词库（${mockWordState.items.length} 个词）\n\n## throughput\n- 吞吐量；处理量\n`;
      }

      if (command === "memo_list") return memos.map(memoSummary);
      if (command === "memo_get") {
        const memo = memos.find((entry) => entry.id === args?.id);
        if (!memo) throw new Error("备忘录不存在");
        return memoDetail(memo);
      }
      if (command === "memo_update") {
        const memo = memos.find((entry) => entry.id === args?.id);
        if (!memo) throw new Error("备忘录不存在");
        if (typeof args?.title === "string" && args.title.trim()) memo.title = args.title.trim();
        if (args?.memoType === "memo" || args?.memoType === "todo" || args?.memoType === "idea") {
          memo.memoType = args.memoType;
        }
        memo.updatedAt = Date.now();
        memo.synced = false;
        return memoSummary(memo);
      }
      if (command === "memo_delete") {
        const index = memos.findIndex((entry) => entry.id === args?.id);
        if (index >= 0) memos.splice(index, 1);
        return null;
      }
      if (command === "memo_delete_audio") {
        const memo = memos.find((entry) => entry.id === args?.id);
        if (memo) {
          memo.hasAudio = false;
          memo.audioBytes = 0;
          memo.synced = false;
        }
        return null;
      }
      if (command === "memo_storage_stats") {
        return {
          count: memos.length,
          audioBytes: memos.reduce((total, memo) => total + memo.audioBytes, 0),
          audioFiles: memos.filter((memo) => memo.hasAudio).length,
        };
      }
      if (command === "memo_key_status") return memoKeyStatus();
      if (command === "memo_key_save") {
        if (typeof args?.key !== "string" || args.key.trim().length < 8) {
          throw new Error("API Key 格式不正确");
        }
        memoKeySet = true;
        return memoKeyStatus();
      }
      if (command === "memo_key_clear") {
        memoKeySet = false;
        return memoKeyStatus();
      }
      if (command === "memo_pair_request") return null;
      if (command === "memo_pair_code_create") {
        return { code: "123456", expiresAt: Date.now() + 120_000 };
      }
      if (command === "memo_pair_apply") {
        memoPaired = true;
        if (typeof args?.key === "string" && args.key.trim()) memoKeySet = true;
        return memoKeyStatus();
      }
      if (command === "memo_recording_start") {
        memoRecording = { session: "mock-session", startedAt: Date.now(), bytes: 0 };
        return { sessionId: memoRecording.session, startedAt: memoRecording.startedAt };
      }
      if (command === "memo_recording_append") {
        if (memoRecording) memoRecording.bytes += 32_000;
        return {
          bytes: memoRecording?.bytes ?? 0,
          durationMs: Math.round((memoRecording?.bytes ?? 0) / 32),
          reachedMax: false,
        };
      }
      if (command === "memo_recording_finish") {
        const durationMs = Math.max(1_000, Math.round((memoRecording?.bytes ?? 0) / 32));
        memoRecording = null;
        const memo: MockMemo = {
          id: `mock-memo-${Date.now()}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          memoType: "memo",
          title: "浏览器 mock 录音",
          summary: "这是在浏览器里模拟出来的录音结果。",
          todos: [],
          tags: [],
          durationMs,
          status: "done",
          aiStatus: "ok",
          hasAudio: false,
          audioBytes: 0,
          synced: false,
          failedSegment: null,
          lastError: null,
          transcript: "这是在浏览器里模拟出来的一条备忘录，用来检查列表、详情和状态。",
        };
        memos.unshift(memo);
        return memoSummary(memo);
      }
      if (command === "memo_recording_cancel") {
        memoRecording = null;
        return null;
      }
      if (command === "memo_recording_status") {
        return memoRecording
          ? {
              sessionId: memoRecording.session,
              startedAt: memoRecording.startedAt,
              bytes: memoRecording.bytes,
              durationMs: Math.round(memoRecording.bytes / 32),
              maxMs: 7_200_000,
            }
          : null;
      }
      if (command === "memo_retry") {
        const memo = memos.find((entry) => entry.id === args?.id);
        if (memo) {
          memo.status = "pending";
          memo.lastError = null;
        }
        return null;
      }

      if (command === "dsh_hook_status") return dshHookSnapshot();
      if (command === "dsh_hook_install") {
        hookProfile = typeof args?.profile === "string" && args.profile ? args.profile : "desktop";
        hookInstalled = true;
        hookEnabled = true;
        hookConnected = true;
        hookState = "idle";
        hookSessions = 0;
        hookLastEventAt = Date.now();
        hookLastHeartbeatAt = Date.now();
        emitDshHookStatus();
        return dshHookSnapshot();
      }
      if (command === "dsh_hook_set_enabled") {
        hookEnabled = Boolean(args?.enabled);
        hookConnected = hookInstalled && hookEnabled;
        hookState = "idle";
        hookSessions = 0;
        hookLastEventAt = hookConnected ? Date.now() : null;
        hookLastHeartbeatAt = hookConnected ? Date.now() : null;
        emitDshHookStatus();
        return dshHookSnapshot();
      }
      if (command === "dsh_hook_remove") {
        hookInstalled = false;
        hookEnabled = false;
        hookConnected = false;
        hookState = "idle";
        hookSessions = 0;
        hookLastEventAt = null;
        hookLastHeartbeatAt = null;
        hookRecent = [];
        emitDshHookStatus();
        return dshHookSnapshot();
      }
      if (command === "dsh_hook_test") {
        const state = args?.state;
        if (
          state === "working" ||
          state === "asking" ||
          state === "completed" ||
          state === "idle"
        ) {
          return applyTestHookState(state);
        }
        return dshHookSnapshot();
      }

      if (command === "plugin:app|register_listener") {
        const handler = args?.handler as { id?: unknown } | undefined;
        if (args?.event === "back-button" && typeof handler?.id === "number") {
          backListeners.set(handler.id, 0);
        }
        return null;
      }
      if (command === "plugin:app|remove_listener") {
        backListeners.delete(Number(args?.channelId));
        return null;
      }
      if (command === "plugin:app|exit") {
        // 浏览器里没法真的退出：打一条日志，方便确认「再按一次」链路走到了退出。
        console.info("[tauri-mock] exit", args?.code ?? 0);
        return null;
      }
      if (command === "plugin:event|listen") {
        const event = args?.event;
        const handler = args?.handler;
        if (isMockEvent(event) && typeof handler === "number") {
          eventHandlers.set(event, handler);
        }
        return nextId++;
      }
      if (command === "plugin:event|unlisten") {
        const event = args?.event;
        if (isMockEvent(event)) eventHandlers.delete(event);
        return null;
      }
      if (command === "plugin:store|load") {
        const rid = nextStoreId++;
        stores.set(rid, new Map());
        return rid;
      }
      if (command === "plugin:store|get") {
        const store = stores.get(Number(args?.rid));
        const key = String(args?.key ?? "");
        return [store?.get(key), store?.has(key) ?? false];
      }
      if (command === "plugin:store|set") {
        stores.get(Number(args?.rid))?.set(String(args?.key ?? ""), args?.value);
        return null;
      }
      if (command === "plugin:store|delete") {
        const store = stores.get(Number(args?.rid));
        const deleted = store?.delete(String(args?.key ?? "")) ?? false;
        return deleted;
      }
      if (command === "plugin:store|clear") {
        stores.get(Number(args?.rid))?.clear();
        return null;
      }
      if (command === "plugin:store|save" || command === "plugin:resources|close") {
        return null;
      }
      return null;
    },
    transformCallback(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    unregisterCallback(id) {
      callbacks.delete(id);
    },
    convertFileSrc(path) {
      return path;
    },
  };

  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: internals,
  });

  // Tauri 运行时会把事件插件的反注册函数挂在这里；浏览器 mock 需要补上，
  // 否则组件卸载时 @tauri-apps/api 的 unlisten 会读 undefined。
  Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
    configurable: true,
    value: {
      unregisterListener() {
        /* mock 事件按 event 名清理，plugin:event|unlisten 已处理 */
      },
    },
  });

  // 浏览器里没有硬件返回键：开发时按 Esc 模拟 Android 返回键。
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    emitBackButton();
  });
}
