import { expect, test } from "vitest";
import { ACTIVITY_LIMIT } from "./activity";
import { createActivityStore } from "./activity-store";

test("records newest first and caps at limit", () => {
  const store = createActivityStore();
  for (let index = 0; index < ACTIVITY_LIMIT + 5; index += 1) {
    store.getState().record({ kind: "ai", title: `事件 ${index}` });
  }
  const events = store.getState().events;
  expect(events).toHaveLength(ACTIVITY_LIMIT);
  expect(events[0].title).toBe(`事件 ${ACTIVITY_LIMIT + 4}`);
  expect(events[events.length - 1]?.title).toBe("事件 5");
});

test("truncates long titles and keeps optional detail", () => {
  const store = createActivityStore();
  store.getState().record({ kind: "voice", title: "x".repeat(200), detail: "12 秒" });
  const event = store.getState().events[0];
  expect(event.title.length).toBe(80);
  expect(event.detail).toBe("12 秒");
  store.getState().reset();
  expect(store.getState().events).toEqual([]);
});
