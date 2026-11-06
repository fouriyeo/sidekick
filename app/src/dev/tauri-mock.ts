type MockRole = "desktop" | "mobile";

const MOCK_EVENTS = ["chat", "conn", "clipboard-changed", "dsh-hook-status"] as const;
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

  function emitMockAiStatus() {
    if (mockAiTimer !== null) {
      window.clearTimeout(mockAiTimer);
      mockAiTimer = null;
    }
    const requested: MockHookState =
      aiParam === "working" || aiParam === "asking" || aiParam === "completed" ? aiParam : "idle";
    const completed = requested === "completed";
    const now = Date.now();
    const sessionList =
      requested === "idle"
        ? []
        : [
            {
              id: "mock-session-1",
              title: "预览会话",
              source: "dsh",
              state:
                requested === "asking" ? "asking" : requested === "working" ? "working" : "idle",
              askKind: requested === "asking" ? "question" : null,
              tool: requested === "working" ? "bash" : null,
              lastEventAt: now,
              completedAt: completed ? now : null,
            },
          ];
    const message = {
      type: "status",
      v: 1,
      source: "test",
      state: requested,
      sessions: requested === "idle" ? 0 : 1,
      resume: completed ? mockAiResume : null,
      remainingMs: completed ? 3000 : null,
      sessionList,
      ts: now,
    };
    emit("chat", JSON.stringify(message));
    if (completed) {
      mockAiTimer = window.setTimeout(() => {
        mockAiTimer = null;
        emit(
          "chat",
          JSON.stringify({
            type: "status",
            v: 1,
            source: "test",
            state: mockAiResume,
            sessions: 0,
            resume: null,
            remainingMs: null,
            sessionList: sessionList.map((session) => ({ ...session, state: "idle" })),
            ts: Date.now(),
          }),
        );
      }, 3000);
    }
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
    // 连同上一区间一起生成，previous 才有真实可比基数。
    const windowDays = dayCount * 2;
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
    const previous = entries.slice(0, dayCount);
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
      days: current.map(
        ({ date, tokens, input, output, cacheRead, cacheWrite, costCnyMicros, calls }) => ({
          date,
          tokens,
          input,
          output,
          cacheRead,
          cacheWrite,
          costCnyMicros,
          calls,
        }),
      ),
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
