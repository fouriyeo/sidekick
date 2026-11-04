import { cn } from "cn";
import { type CSSProperties, useEffect, useMemo } from "react";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { type AiState, displayStateOf } from "./ai-status";
import { isNight } from "./mood";
import styles from "./pet.module.css";
import { PetBubble } from "./pet-bubble";
import { PET_DISPLAY_NAME } from "./pet-name";
import { usePetStore } from "./pet-store";
import { SpritePet } from "./sprite-pet";
import type { PetState } from "./types";
import { useReducedMotion } from "./use-reduced-motion";

// 兼容旧引用：宠物固定显示名仍可从 pet-stage 导入。
export { PET_DISPLAY_NAME } from "./pet-name";

const STATUS_TEXT: Record<PetState["phase"], string> = {
  idle: "正在陪伴",
  sleeping: "睡着了",
  away: "在休息",
};

const AI_STATUS_TEXT: Record<Exclude<AiState, "idle">, string> = {
  working: "正在陪你工作",
  asking: "等你决定",
  completed: "完成",
};

type PetStageProps = {
  className?: string;
  /** 首用清单展开时让出舞台：只保留宠物，不叠气泡。 */
  hideBubble?: boolean;
};

/**
 * 宠物舞台（只负责中间视觉区）：气泡槽位 + 鲸鱼图集 + 固定显示名 + 读屏播报。
 *
 * D77：没有背景声呐环、没有触摸互动；麦克风只作为音效/触感门禁，不产生任何宠物事件。
 * 页面壳（顶部条 / 首用清单 / 现在 / 最近会话 / 麦克风 / 三档）由 PetPage 负责。
 */
export function PetStage({ className, hideBubble = false }: PetStageProps) {
  const pet = usePetStore((state) => state.pet);
  const bubble = usePetStore((state) => state.bubble);
  const hydrate = usePetStore((state) => state.hydrate);
  const dispatch = usePetStore((state) => state.dispatch);
  const flush = usePetStore((state) => state.flush);
  const ai = usePetStore((state) => state.ai);
  const aiCaption = usePetStore((state) => state.aiCaption);
  const setMicListening = usePetStore((state) => state.setMicListening);
  const unlockSound = usePetStore((state) => state.unlockSound);
  const micBusy = useMicStore(
    (state) =>
      state.phase === "arming" || state.phase === "listening" || state.phase === "processing",
  );

  const systemReduced = useReducedMotion();
  const reducedMotion =
    pet.settings.reduceMotion === "on" || (pet.settings.reduceMotion === "system" && systemReduced);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    dispatch({ type: "TICK", now: Date.now() });
    const timer = window.setInterval(() => {
      dispatch({ type: "TICK", now: Date.now() });
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [dispatch]);

  useEffect(() => {
    const onChange = () => {
      const visible = document.visibilityState === "visible";
      dispatch({ type: "VISIBILITY", now: Date.now(), visible });
      if (!visible) void flush();
    };

    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [dispatch, flush]);

  // 录音中静音 AI 触感/音效；结束后恢复。宠物本身不感知麦克风（D77）。
  useEffect(() => {
    setMicListening(micBusy);
  }, [micBusy, setMicListening]);

  // 首次用户手势解锁 Web Audio（浏览器/WebView 的自动播放策略）。
  useEffect(() => {
    const unlock = () => unlockSound();
    document.addEventListener("pointerdown", unlock, { once: true, capture: true });
    return () => document.removeEventListener("pointerdown", unlock, { capture: true });
  }, [unlockSound]);

  const night = isNight(Date.now());
  const displayAi = displayStateOf(pet.phase, ai.state);
  // AI 状态文案优先占用气泡槽位；休息时暂时让位给闲聊气泡。
  const caption = displayAi === "idle" ? null : aiCaption;
  const liveText =
    displayAi === "idle"
      ? `${PET_DISPLAY_NAME}，${STATUS_TEXT[pet.phase]}`
      : `${PET_DISPLAY_NAME}，${AI_STATUS_TEXT[displayAi]}`;

  const poseStyle = useMemo(
    () =>
      ({
        "--pet-x": "0%",
        "--pet-y": "-12%",
        "--pet-scale": "0.86",
        "--pet-session-shift": "0px",
      }) as CSSProperties,
    [],
  );

  return (
    <section
      aria-label={`${PET_DISPLAY_NAME}，正在陪伴`}
      className={cn("relative min-h-0 flex-1 overflow-hidden", className)}
      data-phase={pet.phase}
      data-ai-state={displayAi}
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      {!hideBubble && (
        <div className="absolute top-[3%] left-[6%] z-20 w-[52%] max-w-[260px]">
          <PetBubble bubble={bubble} caption={caption} />
        </div>
      )}

      <div className={styles.petSlot} style={poseStyle}>
        <div className="relative h-full w-full touch-none select-none" aria-hidden="true">
          <SpritePet
            ai={displayAi}
            phase={pet.phase}
            night={night}
            active
            reducedMotion={reducedMotion}
          />
        </div>
      </div>

      <p className="pointer-events-none absolute inset-x-0 bottom-[3%] z-10 text-center font-mono text-[9.5px] tracking-[0.16em] text-pet-muted uppercase">
        {PET_DISPLAY_NAME} · Sidekick
      </p>

      <div aria-live="polite" className="sr-only">
        {liveText}
      </div>
    </section>
  );
}
