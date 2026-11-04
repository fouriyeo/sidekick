import type { CopyId } from "./types";

export const COPY: Record<CopyId, string> = {
  first_meet: "你来了。叫我什么？",
  named: "那我就叫{name}。",
  returning: "回来啦。",
  returning_long: "我刚刚在打盹，没听见你。",
  night: "夜深了，我陪你一会儿。",
  corrupted: "它有点睡迷糊了，先从头认识你。",
  ai_working: "陪你工作中",
  ai_asking: "等你决定",
  ai_completed: "搞定啦",
};

export function renderCopy(id: CopyId, name: string): string {
  return COPY[id].replace(/\{name\}/g, name);
}
