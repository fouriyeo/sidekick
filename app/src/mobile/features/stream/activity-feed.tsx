import { Activity, Mic, Sparkles, Wifi, WifiOff } from "lucide-react";
import type { ActivityEvent, ActivityKind } from "@/shared/lib/activity";
import { formatRelativeTime } from "@/shared/lib/format";
import { useMobileActivityStore } from "./activity-store";

const ICON: Record<ActivityKind, typeof Mic> = {
  voice: Mic,
  ai: Sparkles,
  connection: Wifi,
  clipboard: Activity,
  system: Activity,
};

const TONE: Record<ActivityKind, string> = {
  voice: "text-signal",
  ai: "text-signal",
  connection: "text-muted-foreground",
  clipboard: "text-muted-foreground",
  system: "text-muted-foreground",
};

function ActivityRow({ event }: { event: ActivityEvent }) {
  const Icon =
    event.kind === "connection" && event.title.includes("断") ? WifiOff : ICON[event.kind];
  return (
    <li className="flex items-start gap-2.5 border-t border-border px-3 py-2.5 first:border-t-0">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card ${TONE[event.kind]}`}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{event.title}</span>
        {event.detail && (
          <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
            {event.detail}
          </span>
        )}
      </span>
      <time className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {formatRelativeTime(event.at)}
      </time>
    </li>
  );
}

/**
 * 最近发生（只在本机内存保留，最多 20 条）。
 * 不展示剪贴板内容与 AI 提问正文；列表内部滚动，不撑破页面。
 */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="px-3 py-4 text-xs leading-relaxed text-muted-foreground">
        还没有动静。连接、语音输入和 AI 状态变化会出现在这里，只保留在手机内存里。
      </p>
    );
  }

  return (
    <ul className="max-h-[240px] list-none overflow-y-auto p-0">
      {events.map((event) => (
        <ActivityRow key={event.id} event={event} />
      ))}
    </ul>
  );
}

/** 订阅内存活动流（最新在前）。 */
export function useActivityEvents() {
  return useMobileActivityStore((state) => state.events);
}
