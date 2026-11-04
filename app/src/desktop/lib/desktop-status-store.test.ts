import { beforeEach, expect, test } from "vitest";
import type { StatusMessage } from "@/protocol/messages";
import { useDesktopStatusStore } from "./desktop-status-store";

const message: StatusMessage = {
  type: "status",
  v: 1,
  source: "dsh",
  state: "working",
  sessions: 2,
  ts: 1700000000000,
  sessionList: [
    {
      id: "s-1",
      title: "重构登录模块",
      source: "dsh",
      state: "working",
      askKind: null,
      tool: "edit",
      lastEventAt: 1700000000000,
      completedAt: null,
    },
  ],
};

beforeEach(() => {
  useDesktopStatusStore.getState().reset();
});

test("applies status snapshot and session list", () => {
  useDesktopStatusStore.getState().apply(message);
  const state = useDesktopStatusStore.getState();
  expect(state.status?.state).toBe("working");
  expect(state.sessionList).toHaveLength(1);
  expect(state.sessionList[0].tool).toBe("edit");
  expect(state.updatedAt).not.toBeNull();
});

test("missing sessionList is treated as empty and reset clears state", () => {
  useDesktopStatusStore.getState().apply({ ...message, sessionList: undefined });
  expect(useDesktopStatusStore.getState().sessionList).toEqual([]);
  useDesktopStatusStore.getState().reset();
  expect(useDesktopStatusStore.getState().status).toBeNull();
  expect(useDesktopStatusStore.getState().updatedAt).toBeNull();
});
