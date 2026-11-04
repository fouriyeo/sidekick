import { createActivityStore } from "@/shared/lib/activity-store";

/** 桌面端最近发生（总览「最近事件」）。内存 cap 20，不落盘。 */
export const useDesktopActivityStore = createActivityStore();
