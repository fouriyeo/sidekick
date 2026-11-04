import { create } from "zustand";
import { ACTIVITY_LIMIT, type ActivityEvent } from "@/shared/lib/activity";

export type ActivityInput = Omit<ActivityEvent, "id" | "at"> & { at?: number };

export type ActivityState = {
  events: ActivityEvent[];
  record: (input: ActivityInput) => void;
  reset: () => void;
};

/**
 * 最近发生的内存活动流：最新在前，最多 ACTIVITY_LIMIT 条。
 * 不落盘、不上传；重启后从空开始。
 */
export function createActivityStore() {
  let seq = 0;
  return create<ActivityState>((set) => ({
    events: [],
    record: (input) =>
      set((state) => {
        seq += 1;
        const event: ActivityEvent = {
          id: seq,
          at: input.at ?? Date.now(),
          kind: input.kind,
          title: input.title.slice(0, 80),
          detail: input.detail?.slice(0, 120),
        };
        return { events: [event, ...state.events].slice(0, ACTIVITY_LIMIT) };
      }),
    reset: () => set({ events: [] }),
  }));
}
