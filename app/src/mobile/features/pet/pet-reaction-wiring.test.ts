import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
import type { SessionSummary } from "@/protocol/messages";
import { clearPetReaction, usePetReactionStore } from "./pet-reaction";
import { installPetReactions } from "./pet-reaction-wiring";
import { usePetStore } from "./pet-store";

function session(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    title: id,
    source: "dsh",
    state: "working",
    lastEventAt: 1,
    ...overrides,
  };
}

function action() {
  return usePetReactionStore.getState().reaction?.action ?? null;
}

let uninstall: (() => void) | null = null;

function mount() {
  uninstall = installPetReactions();
}

beforeEach(() => {
  clearPetReaction();
  useMicStore.setState({ phase: "idle" });
  useConnectionStore.setState({ status: "connected" });
  useSessionStore.setState({ raw: [], hasBaseline: false });
  usePetStore.setState({ bubble: null });
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
  clearPetReaction();
});

describe("pet-reaction-wiring", () => {
  it("录音上屏 → 点头；识别失败 → 耷拉", () => {
    mount();

    useMicStore.setState({ phase: "delivered" });
    expect(action()).toBe("affirm");

    clearPetReaction();
    useMicStore.setState({ phase: "error" });
    expect(action()).toBe("failure");
  });

  it("录音中/转写中不产生瞬态反应（由动作优先级保持）", () => {
    mount();

    useMicStore.setState({ phase: "listening" });
    expect(action()).toBeNull();

    useMicStore.setState({ phase: "processing" });
    expect(action()).toBeNull();
  });

  it("首次连接不点头（只有掉线重连才算）", () => {
    useConnectionStore.setState({ status: "disconnected" });
    mount();

    useConnectionStore.setState({ status: "connecting" });
    useConnectionStore.setState({ status: "connected" });
    expect(action()).toBeNull();
  });

  it("连接失败（connecting → error）→ 失败", () => {
    useConnectionStore.setState({ status: "disconnected" });
    mount();

    useConnectionStore.setState({ status: "connecting" });
    useConnectionStore.setState({ status: "error" });
    expect(action()).toBe("failure");
  });

  it("断开连接 → 失败；重连 → 点头", () => {
    mount();

    useConnectionStore.setState({ status: "disconnected" });
    expect(action()).toBe("failure");

    clearPetReaction();
    useConnectionStore.setState({ status: "connected" });
    expect(action()).toBe("affirm");
  });

  it("首份会话快照只做基线，不弹惊讶", () => {
    mount();

    useSessionStore.setState({ raw: [session("a")], hasBaseline: true });
    expect(action()).toBeNull();
  });

  it("新增 1–2 个会话 → 惊讶", () => {
    useSessionStore.setState({ raw: [session("a")], hasBaseline: true });
    mount();
    clearPetReaction();

    useSessionStore.setState({ raw: [session("a"), session("b")] });
    expect(action()).toBe("surprise");
  });

  it("批量新增（重连整表）不弹惊讶", () => {
    useSessionStore.setState({ raw: [session("a")], hasBaseline: true });
    mount();
    clearPetReaction();

    useSessionStore.setState({
      raw: [session("a"), session("b"), session("c"), session("d")],
    });
    expect(action()).toBeNull();
  });

  it("回来问候 → 爱心", () => {
    mount();

    usePetStore.setState({ bubble: { id: 7, copyId: "returning", text: "你回来啦" } });
    expect(action()).toBe("love");
  });

  it("普通气泡不触发动作", () => {
    mount();

    usePetStore.setState({ bubble: { id: 8, copyId: "first_meet", text: "你来了" } });
    expect(action()).toBeNull();
  });

  it("退订后不再触发", () => {
    mount();
    uninstall?.();
    uninstall = null;

    useMicStore.setState({ phase: "delivered" });
    expect(action()).toBeNull();
  });

  it("重复挂载只保留一套订阅（StrictMode 双执行）", () => {
    const first = installPetReactions();
    const second = installPetReactions();

    useMicStore.setState({ phase: "delivered" });
    expect(action()).toBe("affirm");

    // 只释放一份：仍有订阅在跑。
    first();
    clearPetReaction();
    useMicStore.setState({ phase: "idle" });
    useMicStore.setState({ phase: "delivered" });
    expect(action()).toBe("affirm");

    second();
    expect(action()).toBeNull();
  });
});
