import { cn } from "cn";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MicButton } from "@/mobile/features/mic/mic-button";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { SessionFeed } from "@/mobile/features/sessions/session-feed";
import {
  COMPLETED_AUTO_CLEAR_MS,
  visibleSessions as selectVisibleSessions,
  useSessionStore,
} from "@/mobile/features/sessions/session-store";
import { useSessionClock } from "@/mobile/features/sessions/use-session-clock";
import { MobilePage } from "@/mobile/shell/page";
import { PetTopBar } from "@/mobile/shell/pet-top-bar";
import { useUiStore } from "@/mobile/ui-store";
import styles from "./pet.module.css";
import { PetStage } from "./pet-stage";
import { usePetStore } from "./pet-store";

/** 56 圆钮居中、距底 56：原 24 贴着手势条/屏幕下沿，按住不舒服。 */
const MIC_BOTTOM_CLASS = "bottom-[calc(env(safe-area-inset-bottom)+56px)]";
/** 底部留给麦克风的空间（56 圆钮 + 56 距底），让鲸鱼在消息卡与麦克风之间居中。 */
const MIC_SPACER_CLASS = "h-[calc(env(safe-area-inset-bottom)+112px)] flex-none";

/**
 * 宠物页（v16）：顶部 44 条 → 消息卡 → 鲸鱼（无底色、居中偏下）→ 居中麦克风。
 *
 * 没有首用清单 / NowRow / 最近 1 条 / 底部三档；设置从左上 gear 进、消息从右上 chat 进。
 * 保留：变暗遮罩、存档失败提示、录音中读屏、keep-awake（app 层统一处理）。
 */
export function PetPage() {
  const pet = usePetStore((state) => state.pet);
  const saveStatus = usePetStore((state) => state.saveStatus);
  const micBusy = useMicStore(
    (state) =>
      state.phase === "arming" || state.phase === "listening" || state.phase === "processing",
  );
  const sessionRaw = useSessionStore((state) => state.raw);
  const sessionCleared = useSessionStore((state) => state.cleared);
  const clearSession = useSessionStore((state) => state.clear);
  const setView = useUiStore((state) => state.setView);
  const openOffline = useUiStore((state) => state.openOffline);

  // 已完成会话完成后 2 小时没有新事件就自动隐藏；60s 时钟驱动到期刷新。
  const now = useSessionClock();
  const rows = useMemo(
    () =>
      selectVisibleSessions(sessionRaw, sessionCleared, {
        now,
        autoClearCompletedAfterMs: COMPLETED_AUTO_CLEAR_MS,
      }),
    [sessionRaw, sessionCleared, now],
  );
  const askingKey = useMemo(
    () =>
      rows
        .filter((row) => row.display === "asking")
        .map((row) => row.id)
        .join(","),
    [rows],
  );

  // 消息卡展开时鲸鱼收到 220。
  const [feedExpanded, setFeedExpanded] = useState(false);

  const openAsking = useCallback(() => setView("asking"), [setView]);

  // 无操作自动变暗：触摸任意位置恢复；「等你决定」会主动唤醒。
  const [dimmed, setDimmed] = useState(false);
  const dimMs = Math.max(1, pet.settings.dimMinutes) * 60_000;
  const dimmedRef = useRef(false);
  const dimTimer = useRef<number | null>(null);

  const markActivity = useCallback(() => {
    if (dimTimer.current !== null) window.clearTimeout(dimTimer.current);
    if (dimmedRef.current) {
      dimmedRef.current = false;
      setDimmed(false);
    }
    dimTimer.current = window.setTimeout(() => {
      dimmedRef.current = true;
      setDimmed(true);
    }, dimMs);
  }, [dimMs]);

  useEffect(() => {
    markActivity();
    return () => {
      if (dimTimer.current !== null) window.clearTimeout(dimTimer.current);
    };
  }, [markActivity]);

  // 新的「等你决定」叫醒变暗屏幕，避免用户错过反问。
  useEffect(() => {
    if (askingKey) markActivity();
  }, [askingKey, markActivity]);

  return (
    <MobilePage
      tone="stage"
      aria-label="宠物"
      data-pet-page=""
      className={cn(styles.stage, "select-none")}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDownCapture={markActivity}
    >
      <PetTopBar />

      <SessionFeed
        rows={rows}
        onOpenAsking={openAsking}
        onClear={clearSession}
        onExpandedChange={setFeedExpanded}
      />

      <PetStage compact={feedExpanded} />

      <div className={MIC_SPACER_CLASS} aria-hidden="true" />

      <MicButton
        active
        shape="circle"
        bottomOffsetClassName={MIC_BOTTOM_CLASS}
        onOpenConnection={openOffline}
      />

      {saveStatus === "error" && (
        <p
          role="status"
          className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+128px)] z-30 mx-auto w-fit text-xs text-pet-muted"
        >
          这次记不住，下次再试。
        </p>
      )}

      {micBusy && (
        <span className="sr-only" role="status" aria-live="polite">
          录音中
        </span>
      )}

      {dimmed && (
        <div
          role="presentation"
          className="absolute inset-0 z-40 bg-black opacity-30"
          onPointerDown={(event) => {
            event.preventDefault();
            markActivity();
          }}
        />
      )}
    </MobilePage>
  );
}
