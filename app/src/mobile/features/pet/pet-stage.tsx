import { cn } from "cn";
import { useEffect } from "react";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { type AiState, displayStateOf } from "./ai-status";
import { BoopPet } from "./boop-pet";
import { isNight } from "./mood";
import styles from "./pet.module.css";
import { PET_DISPLAY_NAME } from "./pet-name";
import { installPetReactions } from "./pet-reaction-wiring";
import { usePetStore } from "./pet-store";
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
  /**
   * 顶部预留（px）：会话卡折叠态的高度。卡片是浮层（D107），
   * 展开只盖住舞台上半部分，这里固定按折叠高度居中，鲸鱼不位移、不缩放。
   */
  reserveTop?: number;
};

/**
 * 宠物舞台（只负责中间视觉区）：鲸鱼图集 + 读屏播报。
 *
 * v18：没有底色、没有卡片、没有气泡、没有品牌小字；鲸鱼固定 230，在「折叠会话卡底」与
 * 「麦克风顶」之间居中偏下；会话卡展开时只做浮层，鲸鱼不动（D107）。
 * D77：没有背景声呐环、没有触摸互动；麦克风只作为音效/触感门禁，不产生任何宠物事件。
 * 页面壳（顶栏 / 消息卡 / 麦克风 / 变暗）由 PetPage 负责。
 */
export function PetStage({ className, reserveTop = 0 }: PetStageProps) {
  const pet = usePetStore((state) => state.pet);
  const hydrate = usePetStore((state) => state.hydrate);
  const dispatch = usePetStore((state) => state.dispatch);
  const flush = usePetStore((state) => state.flush);
  const ai = usePetStore((state) => state.ai);
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

  // 麦克风/连接/会话/问候 → 宠物瞬时反应（D133）；卸载即退订。
  useEffect(() => installPetReactions(), []);

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
  const liveText =
    displayAi === "idle"
      ? `${PET_DISPLAY_NAME}，${STATUS_TEXT[pet.phase]}`
      : `${PET_DISPLAY_NAME}，${AI_STATUS_TEXT[displayAi]}`;

  return (
    <section
      aria-label={`${PET_DISPLAY_NAME}，正在陪伴`}
      className={cn("relative min-h-0 flex-1 overflow-hidden", className)}
      data-phase={pet.phase}
      data-ai-state={displayAi}
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      {/* 宠物在「折叠会话卡底」与「麦克风顶」之间居中偏下（不铺底、不描边、不加光晕）。 */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-center"
        style={{ top: reserveTop }}
      >
        <div className={cn(styles.petSlot, "mt-9")}>
          <div className="relative h-full w-full touch-none select-none" aria-hidden="true">
            <BoopPet
              ai={displayAi}
              phase={pet.phase}
              night={night}
              reducedMotion={reducedMotion}
              autoSleepMs={pet.settings.dimMinutes * 60_000}
            />
          </div>
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {liveText}
      </div>
    </section>
  );
}
