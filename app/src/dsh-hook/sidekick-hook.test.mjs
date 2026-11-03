// Sidekick DSH hook 的单元测试。
//
// 说明：任务原本要求用 Vitest 的 node 环境注释，但仓库根 vitest 配置的
// setupFiles（app/src/test/setup.ts）在 node 环境下会直接访问 window/navigator/Element
// 并抛 ReferenceError，而 Vitest 没有按文件关闭 setupFiles 的开关。配置与 setup.ts
// 都在本任务写权限之外，因此这里使用仓库默认的 jsdom 环境运行；被测实现本身仍只依赖
// Node 内置模块 / fetch / AbortSignal.timeout，测试也不使用任何 jsdom 全局。

import { describe, expect, it } from "vitest";
import {
  aggregateDshState,
  apply,
  collectExistingSessions,
  createConfigReader,
  createDshHookReducer,
  createHookController,
  createHttpTransport,
  isAskTool,
  isConfigActive,
  isLoopbackEndpoint,
  isSubagentSession,
  MAX_SESSION_LIST,
  MAX_SESSION_TITLE_CHARS,
  name,
  normalizeConfig,
  normalizeSessionTitle,
  parseConfigText,
  PLUGIN_VERSION,
  profileFromModuleUrl,
  resolveConfigPath,
  resolveDshHome,
  sessionIdOf,
  tokenizeToolName,
} from "./sidekick-hook.mjs";

const BASE_CONFIG = Object.freeze({
  version: 1,
  enabled: true,
  profile: "desktop",
  endpoint: "http://127.0.0.1:47815/hook/dsh",
  token: "test-token",
});

function makeSession(id, header = {}) {
  return { header: { id, createdAt: 1, version: 4, isSeeded: false, ...header } };
}

function makeEvent(type, data = {}, seq = 0) {
  return { type, seq, time: 0, data };
}

function createReducerHarness(options = {}) {
  const clock = { value: 1_000_000 };
  const reducer = createDshHookReducer({ now: () => clock.value, ...options });
  return { clock, reducer };
}

function createFakeTransport() {
  const sent = [];
  return {
    sent,
    send(config, message) {
      sent.push({ config, message });
      return Promise.resolve(true);
    },
  };
}

function createFakeTimers() {
  const intervals = [];
  const setIntervalFn = (fn, ms) => {
    const handle = { fn, ms, unref() {} };
    intervals.push(handle);
    return handle;
  };
  const clearIntervalFn = (handle) => {
    const index = intervals.indexOf(handle);
    if (index >= 0) intervals.splice(index, 1);
  };
  return { intervals, setInterval: setIntervalFn, clearInterval: clearIntervalFn };
}

function createConfigReaderStub(configState) {
  return {
    read: async () => configState.value,
  };
}

function createControllerHarness(initialConfig = BASE_CONFIG) {
  const clock = { value: 1_000 };
  const transport = createFakeTransport();
  const timers = createFakeTimers();
  const configState = { value: initialConfig };
  const controller = createHookController({
    profile: "desktop",
    now: () => clock.value,
    transport,
    configReader: createConfigReaderStub(configState),
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
  });
  return { clock, controller, configState, timers, transport };
}

describe("plugin metadata", () => {
  it("exports the DSH plugin name and a thin apply() entry", () => {
    expect(name).toBe("sidekick-hook");
    expect(PLUGIN_VERSION).toBe(2);
    expect(typeof apply).toBe("function");
  });

  it("exports the protocol session-list limits", () => {
    expect(MAX_SESSION_LIST).toBe(50);
    expect(MAX_SESSION_TITLE_CHARS).toBe(80);
  });

  it("never throws when host services are missing or broken", () => {
    let dispose = null;
    const ctx = {
      root: { on: () => () => {} },
      effect: (fn) => {
        dispose = fn;
      },
      sessions: {
        list: () => {
          throw new Error("sessions unavailable");
        },
      },
      sessionTitle: {
        get: () => {
          throw new Error("title unavailable");
        },
      },
    };
    try {
      expect(() => apply(ctx)).not.toThrow();
    } finally {
      try {
        dispose?.();
      } catch {
        // ignore
      }
    }
  });
});

describe("tokenizeToolName / isAskTool", () => {
  it("splits snake_case, kebab-case and camelCase names into tokens", () => {
    expect(tokenizeToolName("ask_user_question")).toEqual(["ask", "user", "question"]);
    expect(tokenizeToolName("ask-user-question")).toEqual(["ask", "user", "question"]);
    expect(tokenizeToolName("askUserQuestion")).toEqual(["ask", "user", "question"]);
    expect(tokenizeToolName("  Code_Review  ")).toEqual(["code", "review"]);
  });

  it("matches real pending-user tools", () => {
    for (const toolName of [
      "ask_user_question",
      "AskUserQuestion",
      "askUserQuestion",
      "ask_user",
      "exit_plan_mode",
      "user_question",
      "human_decision",
      "user_approval",
      "user_permission",
      "request_permission",
      "approval_request",
      "approval_requested",
      "needs_confirmation",
      "waiting_for_user_input",
      "request_user_input",
      "ask_for_help",
      "authorize",
      "consent",
      "permission",
      "question",
      "confirmation",
      "decision",
      "clarification",
    ]) {
      expect(isAskTool(toolName), toolName).toBe(true);
    }
  });

  it("does not false-positive on ordinary tools", () => {
    for (const toolName of [
      "code_review",
      "codeReview",
      "permission_scan",
      "permissionScan",
      "allowlist_files",
      "allowlistFiles",
      "review",
      "file_read",
      "search_files",
      "write_file",
      "enter_plan_mode",
      "plan_mode",
      "get_permissions",
      "notify_user",
      "user_profile",
      "permission_policy",
      "task",
      "",
      "   ",
      null,
      undefined,
      42,
    ]) {
      expect(isAskTool(toolName), String(toolName)).toBe(false);
    }
  });
});

describe("session helpers", () => {
  it("reads the immutable header id first", () => {
    expect(sessionIdOf(makeSession("s1"))).toBe("s1");
    expect(sessionIdOf({ id: "s2", header: {} })).toBe("s2");
    expect(sessionIdOf({ id: "s3", header: { id: "header-id" } })).toBe("header-id");
    expect(sessionIdOf(null)).toBeNull();
    expect(sessionIdOf({})).toBeNull();
  });

  it("detects subagent sessions by origin or delegation depth", () => {
    expect(isSubagentSession(makeSession("s1"))).toBe(false);
    expect(isSubagentSession(makeSession("s1", { origin: "subagent" }))).toBe(true);
    expect(isSubagentSession(makeSession("s1", { delegationDepth: 0 }))).toBe(false);
    expect(isSubagentSession(makeSession("s1", { delegationDepth: "2" }))).toBe(true);
    expect(isSubagentSession(null)).toBe(false);
  });

  it("aggregates with asking > working > idle priority", () => {
    expect(aggregateDshState([])).toBe("idle");
    expect(aggregateDshState(["idle"])).toBe("idle");
    expect(aggregateDshState(["working"])).toBe("working");
    expect(aggregateDshState([{ state: "idle" }, { state: "working" }])).toBe("working");
    expect(aggregateDshState([{ state: "working" }, { state: "asking" }])).toBe("asking");
    expect(aggregateDshState(["asking", "working"])).toBe("asking");
    expect(aggregateDshState(new Map([["a", { state: "working" }]]))).toBe("working");
  });

  it("normalizes titles to one line, at most 80 code points or null", () => {
    expect(normalizeSessionTitle("  修复\t登录\n问题  ")).toBe("修复 登录 问题");
    expect(normalizeSessionTitle("a\u0000\u001fb")).toBe("a b");
    expect(normalizeSessionTitle("   ")).toBeNull();
    expect(normalizeSessionTitle("")).toBeNull();
    expect(normalizeSessionTitle(null)).toBeNull();
    expect(normalizeSessionTitle(42)).toBeNull();
    expect(
      Array.from(normalizeSessionTitle("中".repeat(MAX_SESSION_TITLE_CHARS + 20))),
    ).toHaveLength(MAX_SESSION_TITLE_CHARS);
  });
});

describe("collectExistingSessions", () => {
  const now = () => 5_000;

  it("reads existing top-level sessions and service titles", () => {
    const sessions = [
      makeSession("a"),
      makeSession("b"),
      makeSession("sub", { origin: "subagent" }),
      makeSession("depth", { delegationDepth: 1 }),
    ];
    const ctx = {
      sessions: { list: () => sessions },
      sessionTitle: { get: (session) => ({ title: `标题-${session.header.id}` }) },
    };
    const entries = collectExistingSessions(ctx, { now });
    expect(entries.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(entries[0].title).toBe("标题-a");
    expect(entries.every((entry) => entry.lastEventAt === 5_000)).toBe(true);
  });

  it("supports ctx.get(), Map/byId lists and plain string titles", () => {
    const viaGet = {
      get(name) {
        if (name === "sessions") {
          return { list: () => new Map([["x", makeSession("x")]]) };
        }
        if (name === "sessionTitle") {
          return { get: () => "字符串标题" };
        }
        return undefined;
      },
    };
    expect(collectExistingSessions(viaGet, { now })).toMatchObject([
      { id: "x", title: "字符串标题", lastEventAt: 5_000 },
    ]);

    const byId = { sessions: { list: () => ({ byId: { y: makeSession("y") } }) } };
    expect(collectExistingSessions(byId, { now }).map((entry) => entry.id)).toEqual(["y"]);
  });

  it("tolerates missing or throwing host services", () => {
    expect(collectExistingSessions(null)).toEqual([]);
    expect(collectExistingSessions({})).toEqual([]);
    expect(
      collectExistingSessions({
        sessions: {
          list: () => {
            throw new Error("boom");
          },
        },
      }),
    ).toEqual([]);

    const noTitles = collectExistingSessions(
      { sessions: { list: () => [makeSession("a")] } },
      { now },
    );
    expect(noTitles[0].title).toBeNull();

    const brokenTitles = collectExistingSessions(
      {
        sessions: { list: () => [makeSession("a")] },
        sessionTitle: {
          get: () => {
            throw new Error("boom");
          },
        },
      },
      { now },
    );
    expect(brokenTitles[0].title).toBeNull();
  });
});

describe("config path / profile / guards", () => {
  it("resolves DSH_HOME with ~ expansion and a ~/.dsh fallback", () => {
    expect(resolveDshHome({}, "/Users/me")).toBe("/Users/me/.dsh");
    expect(resolveDshHome({ DSH_HOME: "/custom/dsh" }, "/Users/me")).toBe("/custom/dsh");
    expect(resolveDshHome({ DSH_HOME: "~/dsh" }, "/Users/me")).toBe("/Users/me/dsh");
    expect(resolveDshHome({ DSH_HOME: "~" }, "/Users/me")).toBe("/Users/me");
    expect(resolveConfigPath({ env: { DSH_HOME: "/custom/dsh" }, home: "/Users/me" })).toBe(
      "/custom/dsh/sidekick/config.json",
    );
    expect(resolveConfigPath({ env: {}, home: "/Users/me" })).toBe(
      "/Users/me/.dsh/sidekick/config.json",
    );
  });

  it("parses the profile out of the installed module path", () => {
    const desktopUrl = new URL(
      "file:///Users/me/.dsh/profiles/desktop/plugins/sidekick-hook.mjs",
    ).href;
    expect(profileFromModuleUrl(desktopUrl)).toBe("desktop");
    const spacedUrl = new URL(
      "file:///Users/me/.dsh/profiles/my%20profile/plugins/sidekick-hook.mjs",
    ).href;
    expect(profileFromModuleUrl(spacedUrl)).toBe("my profile");
    expect(profileFromModuleUrl("/tmp/sidekick/plugins/sidekick-hook.mjs")).toBeNull();
    expect(profileFromModuleUrl("/Users/me/.dsh/profiles/desktop/node_modules/x.js")).toBeNull();
    expect(profileFromModuleUrl(null)).toBeNull();
  });

  it("normalizes only version-1 configs with all fields", () => {
    expect(normalizeConfig(BASE_CONFIG)).toEqual(BASE_CONFIG);
    expect(normalizeConfig({ ...BASE_CONFIG, version: 2 })).toBeNull();
    expect(normalizeConfig({ ...BASE_CONFIG, enabled: "yes" })).toBeNull();
    expect(normalizeConfig({ ...BASE_CONFIG, profile: "" })).toBeNull();
    expect(normalizeConfig({ ...BASE_CONFIG, endpoint: 42 })).toBeNull();
    expect(normalizeConfig({ ...BASE_CONFIG, token: "" })).toBeNull();
    expect(normalizeConfig(null)).toBeNull();
    expect(normalizeConfig([])).toBeNull();
    expect(parseConfigText(JSON.stringify(BASE_CONFIG))).toEqual(BASE_CONFIG);
    expect(parseConfigText("{not json")).toBeNull();
    expect(parseConfigText("")).toBeNull();
  });

  it("accepts only loopback endpoints", () => {
    for (const endpoint of [
      "http://127.0.0.1:47815/hook/dsh",
      "http://localhost:47815/hook/dsh",
      "https://127.0.0.1:47815/hook/dsh",
      "http://[::1]:47815/hook/dsh",
    ]) {
      expect(isLoopbackEndpoint(endpoint), endpoint).toBe(true);
    }
    for (const endpoint of [
      "http://0.0.0.0:47815/hook/dsh",
      "http://192.168.1.20:47815/hook/dsh",
      "http://127.0.0.1.evil.com/hook/dsh",
      "http://evil.com/hook/dsh",
      "file:///tmp/hook",
      "ftp://127.0.0.1/hook",
      "http://user:pass@127.0.0.1:47815/hook/dsh",
      "127.0.0.1:47815/hook/dsh",
      "",
      null,
    ]) {
      expect(isLoopbackEndpoint(endpoint), String(endpoint)).toBe(false);
    }
  });

  it("activates config only when enabled, profile-matched and loopback", () => {
    expect(isConfigActive(BASE_CONFIG, "desktop")).toBe(true);
    expect(isConfigActive(BASE_CONFIG, "web")).toBe(false);
    expect(isConfigActive(BASE_CONFIG, null)).toBe(false);
    expect(isConfigActive({ ...BASE_CONFIG, enabled: false }, "desktop")).toBe(false);
    expect(
      isConfigActive({ ...BASE_CONFIG, endpoint: "http://192.168.1.20:47815/hook/dsh" }, "desktop"),
    ).toBe(false);
    expect(isConfigActive(null, "desktop")).toBe(false);
  });
});

describe("createConfigReader", () => {
  it("re-reads only when mtime/size change and tolerates missing/broken files", async () => {
    let readCount = 0;
    let stats = { mtimeMs: 100, size: 60 };
    let fileText = JSON.stringify(BASE_CONFIG);
    const reader = createConfigReader({
      configPath: "/tmp/sidekick/config.json",
      stat: async () => stats,
      readFile: async () => {
        readCount += 1;
        return fileText;
      },
    });

    expect(await reader.read()).toEqual(BASE_CONFIG);
    expect(readCount).toBe(1);
    expect(await reader.read()).toEqual(BASE_CONFIG);
    expect(readCount).toBe(1);

    stats = { mtimeMs: 101, size: 60 };
    fileText = JSON.stringify({ ...BASE_CONFIG, token: "rotated" });
    expect(await reader.read()).toEqual({ ...BASE_CONFIG, token: "rotated" });
    expect(readCount).toBe(2);
  });

  it("returns null for a missing file, directory or invalid JSON", async () => {
    const missing = createConfigReader({
      configPath: "/tmp/missing.json",
      stat: async () => {
        throw new Error("ENOENT");
      },
      readFile: async () => JSON.stringify(BASE_CONFIG),
    });
    expect(await missing.read()).toBeNull();

    const directory = createConfigReader({
      configPath: "/tmp/dir",
      stat: async () => ({ mtimeMs: 1, size: 1, isDirectory: () => true }),
      readFile: async () => JSON.stringify(BASE_CONFIG),
    });
    expect(await directory.read()).toBeNull();

    const invalid = createConfigReader({
      configPath: "/tmp/invalid.json",
      stat: async () => ({ mtimeMs: 1, size: 2 }),
      readFile: async () => "{broken",
    });
    expect(await invalid.read()).toBeNull();

    const throwing = createConfigReader({
      configPath: "/tmp/throwing.json",
      stat: async () => ({ mtimeMs: 1, size: 2 }),
      readFile: async () => {
        throw new Error("EACCES");
      },
    });
    expect(await throwing.read()).toBeNull();
  });
});

describe("createDshHookReducer", () => {
  it("starts idle and ignores non-lifecycle events without creating sessions", () => {
    const { reducer } = createReducerHarness();
    const session = makeSession("s1");
    expect(reducer.snapshot()).toMatchObject({ state: "idle", sessions: 0, list: [] });
    expect(reducer.handle(session, makeEvent("assistant/chunk", { chunk: {} }))).toBeNull();
    expect(reducer.handle(session, makeEvent("request/header", { header: {} }))).toBeNull();
    expect(reducer.snapshot()).toMatchObject({ state: "idle", sessions: 0, list: [] });
    expect(reducer.handle(null, null)).toBeNull();
    expect(reducer.handle(session, { type: 42 })).toBeNull();
  });

  it("maps the turn / tool / approval / user event matrix", () => {
    const { reducer } = createReducerHarness();
    const session = makeSession("s1");

    expect(reducer.handle(session, makeEvent("turn/start", { turn: 1 }))).toMatchObject({
      state: "working",
      sessions: 1,
    });
    expect(
      reducer.handle(session, makeEvent("tool/call", { name: "file_read", callId: "c1" })),
    ).toMatchObject({ state: "working" });

    expect(
      reducer.handle(
        session,
        makeEvent("tool/call", { name: "ask_user_question", callId: "c2" }),
      ),
    ).toMatchObject({ state: "asking" });
    // 普通工具的 result 不能清掉 ask 状态。
    expect(
      reducer.handle(
        session,
        makeEvent("tool/result", { message: { role: "tool", toolCallId: "c1" } }),
      ),
    ).toMatchObject({ state: "asking" });
    // ask 工具的 result 才清除 asking。
    expect(
      reducer.handle(
        session,
        makeEvent("tool/result", { message: { role: "tool", toolCallId: "c2" } }),
      ),
    ).toMatchObject({ state: "working" });

    expect(
      reducer.handle(session, makeEvent("approval/asked", { id: "a1", toolName: "shell" })),
    ).toMatchObject({ state: "asking" });
    // 不匹配的 approval id 不能清除等待。
    expect(reducer.handle(session, makeEvent("approval/decided", { id: "other" }))).toMatchObject(
      { state: "asking" },
    );
    expect(reducer.handle(session, makeEvent("approval/decided", { id: "a1" }))).toMatchObject({
      state: "working",
    });

    // 用户消息回答 ask 工具后回到 working。
    reducer.handle(session, makeEvent("tool/call", { name: "exit_plan_mode", callId: "c3" }));
    expect(reducer.handle(session, makeEvent("user/message", { role: "user" }))).toMatchObject({
      state: "working",
    });

    // 用户消息清除该会话所有 ask/approval（docs/engineering/dsh-hook.md §4）。
    reducer.handle(session, makeEvent("approval/asked", { id: "a2" }));
    expect(reducer.handle(session, makeEvent("user/message", { role: "user" }))).toMatchObject({
      state: "working",
    });

    expect(
      reducer.handle(session, makeEvent("turn/end", { reason: { kind: "aborted" } })),
    ).toMatchObject({ state: "idle" });
  });

  it("maps every turn/end reason kind", () => {
    const { reducer } = createReducerHarness();
    const session = makeSession("s1");
    const cases = [
      ["aborted", "idle"],
      ["blocked", "asking"],
      ["error", "idle"],
      ["max-tokens", "idle"],
      ["interrupted", "idle"],
      ["forked", "idle"],
    ];
    for (const [kind, expected] of cases) {
      reducer.handle(session, makeEvent("turn/start"));
      const result = reducer.handle(session, makeEvent("turn/end", { reason: { kind } }));
      expect(result, kind).toMatchObject({ state: expected, pulse: null });
    }
    // 缺 reason 的 turn/end 不是 completed，只会回到 idle。
    reducer.handle(session, makeEvent("turn/start"));
    expect(reducer.handle(session, makeEvent("turn/end", {}))).toMatchObject({
      state: "idle",
      pulse: null,
    });
  });

  it("emits a completed pulse with resume, throttled to once per 5s", () => {
    const { clock, reducer } = createReducerHarness();
    const session = makeSession("s1");

    reducer.handle(session, makeEvent("turn/start"));
    let result = reducer.handle(session, makeEvent("turn/end", { reason: { kind: "completed" } }));
    // 会话回到 idle 后不再计入“进行中会话数”。
    expect(result).toMatchObject({ state: "idle", sessions: 0 });
    expect(result.pulse).toEqual({ resume: "idle" });

    // 5 秒内第二次完成不再发 pulse。
    clock.value += 1_000;
    reducer.handle(session, makeEvent("turn/start"));
    result = reducer.handle(session, makeEvent("turn/end", { reason: { kind: "completed" } }));
    expect(result.state).toBe("idle");
    expect(result.pulse).toBeNull();

    // 超过 5 秒后恢复。
    clock.value += 5_000;
    reducer.handle(session, makeEvent("turn/start"));
    result = reducer.handle(session, makeEvent("turn/end", { reason: { kind: "completed" } }));
    expect(result.pulse).toEqual({ resume: "idle" });
  });

  it("uses working as the completed resume when another top-level session is working", () => {
    const { reducer } = createReducerHarness();
    const first = makeSession("first");
    const second = makeSession("second");

    reducer.handle(first, makeEvent("turn/start", { turn: 1 }));
    reducer.handle(second, makeEvent("turn/start", { turn: 1 }));
    const result = reducer.handle(
      first,
      makeEvent("turn/end", { reason: { kind: "completed" } }),
    );
    expect(result).toMatchObject({ state: "working", sessions: 1 });
    expect(result.pulse).toEqual({ resume: "working" });
  });

  it("never emits completed while any session is asking", () => {
    const { reducer } = createReducerHarness();
    const first = makeSession("first");
    const second = makeSession("second");

    reducer.handle(first, makeEvent("turn/start"));
    reducer.handle(second, makeEvent("turn/start"));
    reducer.handle(
      second,
      makeEvent("tool/call", { name: "ask_user_question", callId: "ask-1" }),
    );

    const result = reducer.handle(
      first,
      makeEvent("turn/end", { reason: { kind: "completed" } }),
    );
    expect(result.state).toBe("asking");
    // 只有仍在 asking 的 second 计入；first 已 idle 不计入。
    expect(result.sessions).toBe(1);
    expect(result.pulse).toBeNull();
  });

  it("ignores subagent sessions for both state and session count", () => {
    const { reducer } = createReducerHarness();
    const parent = makeSession("parent");
    const originSubagent = makeSession("origin-subagent", { origin: "subagent" });
    const depthSubagent = makeSession("depth-subagent", { delegationDepth: 2 });

    reducer.handle(parent, makeEvent("turn/start"));
    expect(reducer.handle(originSubagent, makeEvent("turn/start"))).toBeNull();
    expect(reducer.handle(depthSubagent, makeEvent("turn/start"))).toBeNull();
    expect(
      reducer.handle(
        originSubagent,
        makeEvent("tool/call", { name: "ask_user_question", callId: "sub-ask" }),
      ),
    ).toBeNull();
    expect(reducer.handle(originSubagent, makeEvent("session/title", { title: "子代理" }))).toBeNull();
    expect(reducer.snapshot()).toMatchObject({ state: "working", sessions: 1 });
    expect(reducer.snapshot().list.map((entry) => entry.id)).toEqual(["parent"]);
    expect(reducer.disposeSession(originSubagent)).toBeNull();
    expect(reducer.snapshot()).toMatchObject({ state: "working", sessions: 1 });
  });

  it("counts only in-progress top-level sessions (working/asking)", () => {
    const { reducer } = createReducerHarness();
    const first = makeSession("first");
    const second = makeSession("second");

    reducer.handle(first, makeEvent("turn/start"));
    reducer.handle(second, makeEvent("turn/start"));
    expect(reducer.snapshot()).toMatchObject({ state: "working", sessions: 2 });

    // 一个 turn 结束后该会话回到 idle，不再计入“进行中会话数”。
    expect(
      reducer.handle(second, makeEvent("turn/end", { reason: { kind: "aborted" } })),
    ).toMatchObject({ state: "working", sessions: 1 });

    // asking 也属于进行中。
    reducer.handle(first, makeEvent("tool/call", { name: "ask_user_question", callId: "c1" }));
    expect(reducer.snapshot()).toMatchObject({ state: "asking", sessions: 1 });

    // 移除最后一个进行中会话后归零（idle 的 second 还在，但不算）。
    expect(reducer.disposeSession(first)).toMatchObject({ state: "idle", sessions: 0 });
    expect(reducer.disposeSession(second)).toMatchObject({ state: "idle", sessions: 0 });
    expect(reducer.snapshot()).toMatchObject({ state: "idle", sessions: 0 });
  });

  it("clears an unanswered ask defensively when a tool result cannot be correlated", () => {
    const { reducer } = createReducerHarness();
    const session = makeSession("s1");
    reducer.handle(session, makeEvent("turn/start"));
    reducer.handle(session, makeEvent("tool/call", { name: "ask_user_question", callId: "c1" }));
    const result = reducer.handle(session, makeEvent("tool/result", { message: { role: "tool" } }));
    expect(result).toMatchObject({ state: "working" });
  });

  it("handles session/disposed removing the last session", () => {
    const { reducer } = createReducerHarness();
    const session = makeSession("s1");
    reducer.handle(session, makeEvent("turn/start"));
    reducer.handle(session, makeEvent("session/title", { title: "要移除的会话" }));
    expect(reducer.snapshot().list.map((entry) => entry.id)).toEqual(["s1"]);
    expect(reducer.disposeSession(session)).toMatchObject({ state: "idle", sessions: 0, list: [] });
  });

  it("tracks titles as one-line, 80-code-point metadata", () => {
    const { clock, reducer } = createReducerHarness();
    const session = makeSession("s1");
    reducer.handle(session, makeEvent("turn/start"));

    clock.value += 10;
    let result = reducer.handle(
      session,
      makeEvent("session/title", { title: "  修复\t登录\n问题  " }),
    );
    expect(result.list).toEqual([
      {
        id: "s1",
        title: "修复 登录 问题",
        source: "dsh",
        state: "working",
        askKind: null,
        lastEventAt: clock.value,
        completedAt: null,
      },
    ]);

    clock.value += 10;
    result = reducer.handle(
      session,
      makeEvent("session/title", { title: "中".repeat(MAX_SESSION_TITLE_CHARS + 20) }),
    );
    expect(Array.from(result.list[0].title)).toHaveLength(MAX_SESSION_TITLE_CHARS);

    // 空标题归 null。
    result = reducer.handle(session, makeEvent("session/title", { title: " \u0000\t " }));
    expect(result.list[0].title).toBeNull();
  });

  it("tracks completedAt and clears it on a new turn or non-completed end", () => {
    const { clock, reducer } = createReducerHarness();
    const session = makeSession("s1");
    reducer.handle(session, makeEvent("turn/start"));

    clock.value += 100;
    let result = reducer.handle(session, makeEvent("turn/end", { reason: { kind: "completed" } }));
    expect(result.list[0]).toMatchObject({
      id: "s1",
      state: "idle",
      completedAt: clock.value,
      lastEventAt: clock.value,
      askKind: null,
    });

    // 新一轮开始清 completedAt。
    result = reducer.handle(session, makeEvent("turn/start"));
    expect(result.list[0]).toMatchObject({ state: "working", completedAt: null });

    // 非 completed 的 turn/end 也不保留完成时间。
    clock.value += 100;
    result = reducer.handle(session, makeEvent("turn/end", { reason: { kind: "aborted" } }));
    expect(result.list[0]).toMatchObject({ state: "idle", completedAt: null });
  });

  it("keeps aggregate state but changes signature when the list changes", () => {
    const { clock, reducer } = createReducerHarness();
    const idleSession = makeSession("idle");
    const working = makeSession("working");
    reducer.handle(idleSession, makeEvent("session/title", { title: "旧标题" }));
    reducer.handle(working, makeEvent("turn/start"));
    const before = reducer.snapshot();
    expect(before).toMatchObject({ state: "working", sessions: 1 });

    clock.value += 1;
    const afterTitle = reducer.handle(
      idleSession,
      makeEvent("session/title", { title: "新标题" }),
    );
    expect(afterTitle).toMatchObject({ state: "working", sessions: 1 });
    expect(afterTitle.signature).not.toBe(before.signature);

    // 另一个会话完成：聚合态仍是 working，但 completedAt 变化也必须体现。
    // 不推进时钟，让 lastEventAt/标题保持不变，隔离出 completedAt 的贡献。
    reducer.handle(idleSession, makeEvent("turn/start"));
    const completed = reducer.handle(
      idleSession,
      makeEvent("turn/end", { reason: { kind: "completed" } }),
    );
    expect(completed.state).toBe("working");
    expect(completed.sessions).toBe(1);
    expect(completed.signature).not.toBe(afterTitle.signature);
  });

  it("updates askKind for questions and approvals and clears it with pending state", () => {
    const { reducer } = createReducerHarness();
    const session = makeSession("s1");
    reducer.handle(session, makeEvent("turn/start"));

    let result = reducer.handle(
      session,
      makeEvent("tool/call", { name: "ask_user_question", callId: "q1" }),
    );
    expect(result.list[0]).toMatchObject({ state: "asking", askKind: "question" });

    // 同时有审批时 approval 优先。
    result = reducer.handle(session, makeEvent("approval/asked", { id: "a1" }));
    expect(result.list[0]).toMatchObject({ state: "asking", askKind: "approval" });

    // 提问工具的 result 只清 question；approval 还在。
    result = reducer.handle(
      session,
      makeEvent("tool/result", { message: { role: "tool", toolCallId: "q1" } }),
    );
    expect(result.list[0]).toMatchObject({ state: "asking", askKind: "approval" });

    // 审批决定后回 working，askKind 为 null。
    result = reducer.handle(session, makeEvent("approval/decided", { id: "a1" }));
    expect(result.list[0]).toMatchObject({ state: "working", askKind: null });

    // 用户消息清掉所有 pending。
    reducer.handle(session, makeEvent("approval/asked", { id: "a2" }));
    result = reducer.handle(session, makeEvent("user/message", { role: "user" }));
    expect(result.list[0]).toMatchObject({ state: "working", askKind: null });
  });

  it("does not update lastEventAt on result / decision / user messages", () => {
    const { clock, reducer } = createReducerHarness();
    const session = makeSession("s1");
    reducer.handle(session, makeEvent("turn/start"));
    clock.value += 100;
    reducer.handle(session, makeEvent("tool/call", { name: "ask_user_question", callId: "q1" }));
    const askAt = clock.value;

    clock.value += 500;
    let result = reducer.handle(
      session,
      makeEvent("tool/result", { message: { role: "tool", toolCallId: "q1" } }),
    );
    expect(result.list[0].lastEventAt).toBe(askAt);

    clock.value += 500;
    reducer.handle(session, makeEvent("approval/asked", { id: "a1" }));
    const approvalAt = clock.value;
    clock.value += 500;
    result = reducer.handle(session, makeEvent("approval/decided", { id: "a1" }));
    expect(result.list[0].lastEventAt).toBe(approvalAt);

    clock.value += 500;
    reducer.handle(session, makeEvent("approval/asked", { id: "a2" }));
    const secondApprovalAt = clock.value;
    clock.value += 500;
    result = reducer.handle(session, makeEvent("user/message", { role: "user" }));
    expect(result.list[0].lastEventAt).toBe(secondApprovalAt);
  });

  it("caps the session list at 50, keeping asking/working/completed first", () => {
    const { clock, reducer } = createReducerHarness();
    const asker = makeSession("asker");
    reducer.handle(asker, makeEvent("turn/start"));
    reducer.handle(asker, makeEvent("tool/call", { name: "ask_user_question", callId: "q1" }));

    const worker = makeSession("worker");
    reducer.handle(worker, makeEvent("turn/start"));

    const done = makeSession("done");
    reducer.handle(done, makeEvent("turn/start"));
    reducer.handle(done, makeEvent("turn/end", { reason: { kind: "completed" } }));

    // 之后创建大量更新的 idle 会话，优先级必须保证前三条不被挤掉。
    const total = MAX_SESSION_LIST + 10;
    for (let index = 0; index < total; index += 1) {
      clock.value += 1;
      reducer.handle(
        makeSession(`idle-${index}`),
        makeEvent("session/title", { title: `标题 ${index}` }),
      );
    }

    const list = reducer.snapshot().list;
    expect(list).toHaveLength(MAX_SESSION_LIST);
    expect(list.slice(0, 3).map((entry) => entry.id)).toEqual(["asker", "worker", "done"]);
    expect(list.map((entry) => entry.id)).toContain(`idle-${total - 1}`);
    expect(list.map((entry) => entry.id)).not.toContain("idle-0");
    expect(list[0]).toMatchObject({ state: "asking", askKind: "question" });
    expect(list[1]).toMatchObject({ state: "working", askKind: null, completedAt: null });
    expect(list[2]).toMatchObject({ state: "idle", completedAt: expect.any(Number) });
  });

  it("adopts pre-existing sessions as idle metadata without clobbering live state", () => {
    const { clock, reducer } = createReducerHarness();
    const adopted = reducer.adoptSession(makeSession("existing"), {
      title: "  已存在\n会话 ",
      lastEventAt: clock.value,
    });
    expect(adopted).toMatchObject({ state: "idle", sessions: 0 });
    expect(adopted.list).toEqual([
      {
        id: "existing",
        title: "已存在 会话",
        source: "dsh",
        state: "idle",
        askKind: null,
        lastEventAt: clock.value,
        completedAt: null,
      },
    ]);

    // 已经有事件在手时只补标题，不把 working 覆盖回 idle。
    reducer.handle(makeSession("existing"), makeEvent("turn/start"));
    const again = reducer.adoptSession(makeSession("existing"), { title: "新标题" });
    expect(again).toMatchObject({ state: "working", sessions: 1 });
    expect(again.list[0].title).toBe("新标题");

    // 子代理不接管。
    expect(reducer.adoptSession(makeSession("sub", { origin: "subagent" }))).toBeNull();
    expect(reducer.snapshot().list.map((entry) => entry.id)).toEqual(["existing"]);
  });
});

describe("createHttpTransport", () => {
  it("POSTs JSON with bearer auth and an AbortSignal timeout", async () => {
    const calls = [];
    const transport = createHttpTransport({
      timeoutMs: 1_500,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200 };
      },
    });
    const message = { type: "hello", pluginVersion: 1, profile: "desktop", ts: 123 };
    const ok = await transport.send(BASE_CONFIG, message);

    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(BASE_CONFIG.endpoint);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers["Content-Type"]).toBe("application/json");
    expect(calls[0].init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(calls[0].init.body)).toEqual(message);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries exactly once and resolves false without throwing", async () => {
    let attempts = 0;
    const flaky = createHttpTransport({
      timeoutMs: 50,
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("connection refused");
        return { ok: true, status: 200 };
      },
    });
    await expect(flaky.send(BASE_CONFIG, { type: "heartbeat" })).resolves.toBe(true);
    expect(attempts).toBe(2);

    let failedAttempts = 0;
    const down = createHttpTransport({
      timeoutMs: 50,
      fetchImpl: async () => {
        failedAttempts += 1;
        throw new Error("down");
      },
    });
    await expect(down.send(BASE_CONFIG, { type: "heartbeat" })).resolves.toBe(false);
    expect(failedAttempts).toBe(2);

    const rejectedResponse = createHttpTransport({
      timeoutMs: 50,
      fetchImpl: async () => ({ ok: false, status: 401 }),
    });
    await expect(rejectedResponse.send(BASE_CONFIG, { type: "hello" })).resolves.toBe(false);
  });

  it("aborts a hanging request through AbortSignal.timeout", async () => {
    let attempts = 0;
    const transport = createHttpTransport({
      timeoutMs: 20,
      fetchImpl: (url, init) =>
        new Promise((resolve, reject) => {
          attempts += 1;
          init.signal.addEventListener(
            "abort",
            () => reject(new Error("aborted by timeout")),
            { once: true },
          );
        }),
    });
    await expect(transport.send(BASE_CONFIG, { type: "heartbeat" })).resolves.toBe(false);
    expect(attempts).toBe(2);
  });
});

describe("createHookController", () => {
  it("sends hello then the initial state once and polls config every second", async () => {
    const { controller, timers, transport } = createControllerHarness();
    controller.start();
    await controller.refreshConfig();
    await controller.whenIdle();

    expect(transport.sent.map(({ message }) => message.type)).toEqual(["hello", "state"]);
    expect(transport.sent[0].message).toMatchObject({
      type: "hello",
      pluginVersion: 2,
      profile: "desktop",
    });
    expect(transport.sent[0].message).not.toHaveProperty("state");
    expect(transport.sent[1].message).toMatchObject({
      type: "state",
      state: "idle",
      sessions: 0,
    });
    expect(transport.sent[1].message).not.toHaveProperty("resume");
    expect(
      timers.intervals.map((handle) => handle.ms).sort((left, right) => left - right),
    ).toEqual([1_000, 5_000]);

    controller.stop();
    expect(timers.intervals).toHaveLength(0);
  });

  it("publishes state changes, heartbeats and completed pulses", async () => {
    const { clock, controller, transport } = createControllerHarness();
    controller.start();
    await controller.refreshConfig();
    await controller.whenIdle();
    const session = makeSession("s1");

    controller.handleSessionEvent(session, makeEvent("turn/start", { turn: 1 }));
    await controller.whenIdle();
    expect(transport.sent.at(-1).message).toMatchObject({
      type: "state",
      state: "working",
      sessions: 1,
    });

    controller.handleSessionEvent(
      session,
      makeEvent("tool/call", { name: "ask_user_question", callId: "c1" }),
    );
    await controller.whenIdle();
    expect(transport.sent.at(-1).message).toMatchObject({ state: "asking", sessions: 1 });

    controller.handleSessionEvent(
      session,
      makeEvent("tool/result", { message: { role: "tool", toolCallId: "c1" } }),
    );
    await controller.whenIdle();
    expect(transport.sent.at(-1).message).toMatchObject({ state: "working", sessions: 1 });

    controller.handleSessionEvent(
      session,
      makeEvent("turn/end", { reason: { kind: "completed" } }),
    );
    await controller.whenIdle();
    expect(transport.sent.at(-1).message).toMatchObject({
      type: "state",
      state: "completed",
      sessions: 0,
      resume: "idle",
    });

    clock.value = 1_500;
    controller.sendHeartbeat();
    await controller.whenIdle();
    expect(transport.sent.at(-1).message).toMatchObject({
      type: "heartbeat",
      state: "idle",
      sessions: 0,
      resume: null,
      ts: 1_500,
    });

    controller.handleSessionDisposed(session);
    await controller.whenIdle();
    expect(transport.sent.at(-1).message).toMatchObject({ sessions: 0, state: "idle" });
    controller.stop();
  });

  it("sends sessionList on state and heartbeat messages", async () => {
    const { controller, transport } = createControllerHarness();
    controller.start();
    await controller.refreshConfig();
    await controller.whenIdle();
    const session = makeSession("s1");

    controller.handleSessionEvent(session, makeEvent("turn/start"));
    await controller.whenIdle();
    let last = transport.sent.at(-1).message;
    expect(last.type).toBe("state");
    expect(last.sessionList).toHaveLength(1);
    expect(last.sessionList[0]).toMatchObject({ id: "s1", state: "working", source: "dsh" });
    expect(transport.sent.at(-1).message).toHaveProperty("sessionList");

    // 只改标题（聚合态不变）也要推一条带列表的 state。
    controller.handleSessionEvent(session, makeEvent("session/title", { title: "修复登录" }));
    await controller.whenIdle();
    last = transport.sent.at(-1).message;
    expect(last).toMatchObject({ type: "state", state: "working", sessions: 1 });
    expect(last.sessionList[0]).toMatchObject({ id: "s1", title: "修复登录" });

    controller.sendHeartbeat();
    await controller.whenIdle();
    last = transport.sent.at(-1).message;
    expect(last).toMatchObject({ type: "heartbeat", state: "working", sessions: 1 });
    expect(last.sessionList).toHaveLength(1);
    expect(last.sessionList[0]).toMatchObject({ id: "s1", title: "修复登录" });
    controller.stop();
  });

  it("keeps sessionList on the completed pulse", async () => {
    const { controller, transport } = createControllerHarness();
    controller.start();
    await controller.refreshConfig();
    await controller.whenIdle();
    const session = makeSession("s1");

    controller.handleSessionEvent(session, makeEvent("turn/start"));
    controller.handleSessionEvent(session, makeEvent("session/title", { title: "完成任务" }));
    controller.handleSessionEvent(session, makeEvent("turn/end", { reason: { kind: "completed" } }));
    await controller.whenIdle();
    const last = transport.sent.at(-1).message;
    expect(last).toMatchObject({ type: "state", state: "completed", resume: "idle" });
    expect(last.sessionList).toHaveLength(1);
    expect(last.sessionList[0]).toMatchObject({
      id: "s1",
      title: "完成任务",
      state: "idle",
      completedAt: expect.any(Number),
    });
    controller.stop();
  });

  it("adopts pre-existing host sessions on start and announces them", async () => {
    const { controller, transport } = createControllerHarness();
    controller.start();
    await controller.refreshConfig();
    await controller.whenIdle();
    const before = transport.sent.length;

    const ctx = {
      sessions: { list: () => [makeSession("old"), makeSession("sub", { origin: "subagent" })] },
      sessionTitle: { get: (session) => (session.header.id === "old" ? "旧会话" : "子代理") },
    };
    expect(controller.adoptExistingSessions(ctx)).toBe(1);
    await controller.whenIdle();
    expect(transport.sent.length).toBeGreaterThan(before);
    const last = transport.sent.at(-1).message;
    expect(last).toMatchObject({ type: "state", state: "idle" });
    expect(last.sessionList).toEqual([
      {
        id: "old",
        title: "旧会话",
        source: "dsh",
        state: "idle",
        askKind: null,
        lastEventAt: 1_000,
        completedAt: null,
      },
    ]);
    controller.stop();
  });

  it("re-announces hello + state after config is disabled and re-enabled", async () => {
    const { configState, controller, transport } = createControllerHarness();
    controller.start();
    await controller.refreshConfig();
    await controller.whenIdle();
    expect(transport.sent.map(({ message }) => message.type)).toEqual(["hello", "state"]);

    configState.value = { ...BASE_CONFIG, enabled: false };
    await controller.refreshConfig();
    expect(transport.sent).toHaveLength(2);
    controller.handleSessionEvent(makeSession("s1"), makeEvent("turn/start"));
    await controller.whenIdle();
    expect(transport.sent).toHaveLength(2);

    configState.value = { ...BASE_CONFIG, enabled: true };
    await controller.refreshConfig();
    await controller.whenIdle();
    expect(transport.sent.map(({ message }) => message.type)).toEqual([
      "hello",
      "state",
      "hello",
      "state",
    ]);
    controller.stop();
  });

  it("stays silent without config, with a profile mismatch or a non-loopback endpoint", async () => {
    const scenarios = [
      null,
      { ...BASE_CONFIG, enabled: false },
      { ...BASE_CONFIG, profile: "web" },
      { ...BASE_CONFIG, endpoint: "http://192.168.1.20:47815/hook/dsh" },
      { ...BASE_CONFIG, token: "" },
    ];
    for (const config of scenarios) {
      const { controller, transport } = createControllerHarness(config);
      controller.start();
      await controller.refreshConfig();
      controller.handleSessionEvent(makeSession("s1"), makeEvent("turn/start"));
      controller.sendHeartbeat();
      expect(transport.sent, JSON.stringify(config)).toHaveLength(0);
      controller.stop();
    }
  });

  it("never throws from event callbacks or after stop", async () => {
    const { controller, transport } = createControllerHarness();
    controller.start();
    await controller.refreshConfig();
    await controller.whenIdle();
    expect(() => controller.handleSessionEvent(null, null)).not.toThrow();
    expect(() => controller.handleSessionDisposed(undefined)).not.toThrow();

    const before = transport.sent.length;
    controller.stop();
    controller.handleSessionEvent(makeSession("s1"), makeEvent("turn/start"));
    expect(controller.sendHeartbeat()).toBe(false);
    expect(transport.sent).toHaveLength(before);
  });
});
