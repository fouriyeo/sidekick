import { cn } from "cn";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FirstUseCard } from "@/mobile/features/first-use/first-use-card";
import { MicButton } from "@/mobile/features/mic/mic-button";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { SessionRow } from "@/mobile/features/sessions/session-row";
import {
  visibleSessions as selectVisibleSessions,
  useSessionStore,
} from "@/mobile/features/sessions/session-store";
import { MobilePage } from "@/mobile/shell/page";
import { PetTopBar } from "@/mobile/shell/pet-top-bar";
import { MobileTabBar } from "@/mobile/shell/tab-bar";
import { useUiStore } from "@/mobile/ui-store";
import { NowRow } from "./now-row";
import styles from "./pet.module.css";
import { PetStage } from "./pet-stage";
import { usePetStore } from "./pet-store";

/** 宠物页底部留给麦克风胶囊的空间（62 三档 + 12 间距 + 56 胶囊 - 62 已由三档占掉）。 */
const MIC_SPACER_CLASS = "h-[68px] flex-none";
const MIC_OFFSET_CLASS = "bottom-[calc(env(safe-area-inset-bottom)+74px)]";

/** 宠物页：顶部 44 状态条 + 首用清单 + 舞台 + 现在 + 最近 1 条 + 麦克风胶囊 + 三档。 */
export function PetPage() {
  const pet = usePetStore((state) => state.pet);
  const saveStatus = usePetStore((state) => state.saveStatus);
  const micBusy = useMicStore(
    (state) =>
      state.phase === "arming" || state.phase === "listening" || state.phase === "processing",
  );
  const sessionRaw = useSessionStore((state) => state.raw);
  const sessionCleared = useSessionStore((state) => state.cleared);
  const setView = useUiStore((state) => state.setView);
  const openOffline = useUiStore((state) => state.openOffline);

  const rows = useMemo(
    () => selectVisibleSessions(sessionRaw, sessionCleared),
    [sessionRaw, sessionCleared],
  );
  const recent = rows[0];
  const askingKey = useMemo(
    () =>
      rows
        .filter((row) => row.display === "asking")
        .map((row) => row.id)
        .join(","),
    [rows],
  );

  // 首用清单展开时让出气泡，避免把宠物压得太小。
  const [firstUseExpanded, setFirstUseExpanded] = useState(false);

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

  const openRecent = recent
    ? () => setView(recent.display === "asking" ? "asking" : "stream")
    : undefined;

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
      <FirstUseCard onExpandedChange={setFirstUseExpanded} />

      <PetStage hideBubble={firstUseExpanded} />

      <NowRow />

      {recent && openRecent && (
        <div className="mx-3 mt-2 flex-none overflow-hidden rounded-[14px] border border-pet-border bg-pet-surface [--background:var(--pet-surface)] [--border:var(--pet-border)] [--decide:var(--pet-ask)] [--foreground:var(--pet-text)] [--muted-foreground:var(--pet-muted)] [--signal:var(--pet-signal)] [--success:var(--pet-success)] [--wash:var(--pet-wash)]">
          <ul className="list-none p-0" aria-label="最近会话">
            <SessionRow row={recent} variant="compact" onOpen={openRecent} />
          </ul>
        </div>
      )}

      <div className={MIC_SPACER_CLASS} aria-hidden="true" />

      <MobileTabBar active="pet" tone="stage" />

      <MicButton
        active
        onOpenConnection={openOffline}
        bottomOffsetClassName={MIC_OFFSET_CLASS}
        overlayBottomClassName={recent ? "bottom-[124px]" : undefined}
      />

      {saveStatus === "error" && (
        <p
          role="status"
          className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+140px)] z-30 mx-auto w-fit text-xs text-pet-muted"
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
