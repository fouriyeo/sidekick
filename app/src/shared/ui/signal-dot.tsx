import { cn } from "@/shared/lib/utils";

export type SignalStatus = "connected" | "waiting" | "idle" | "error";

const DOT_CLASS: Record<SignalStatus, string> = {
  connected: "bg-signal",
  waiting: "bg-decide",
  idle: "bg-muted-foreground",
  error: "bg-destructive",
};

/** 宠物舞台令牌：随主题翻转（浅色主题下是压深的海玻璃色），与页面壳层的 signal/decide 分开。 */
const PET_DOT_CLASS: Record<SignalStatus, string> = {
  connected: "bg-pet-signal",
  waiting: "bg-pet-ask",
  idle: "bg-pet-muted",
  error: "bg-pet-danger",
};

type SignalDotProps = {
  status?: SignalStatus;
  /** 是否播放极慢声呐环；只在已连接时生效。 */
  pulse?: boolean;
  /** stage = 宠物舞台（用随主题的 --pet-* 令牌）。 */
  tone?: "default" | "stage";
  className?: string;
};

/** 状态点 + 一圈 5.6s 的极低声呐环；纯装饰，文字状态由调用方提供。 */
export function SignalDot({
  status = "idle",
  pulse = true,
  tone = "default",
  className,
}: SignalDotProps) {
  const toneClass = tone === "stage" ? PET_DOT_CLASS[status] : DOT_CLASS[status];
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-flex size-2 shrink-0 rounded-full", toneClass, className)}
    >
      {status === "connected" && pulse && (
        <span
          className={cn(
            "sonar-dot-ring absolute inset-0 rounded-full border opacity-60",
            tone === "stage" ? "border-pet-signal" : "border-signal",
          )}
        />
      )}
    </span>
  );
}
