import { loadSkins } from "boopface";
import { useEffect, useRef, useState } from "react";
import "boopface";
import { cn } from "cn";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import type { AiState } from "./ai-status";
import styles from "./pet.module.css";
import { isContinuous, type PetAction, resolvePetAction } from "./pet-action";
import { usePetReactionStore } from "./pet-reaction";
import type { PetPhase } from "./types";

/** 固定皮肤：冰透蓝（201），深浅主题共用；见 D132。 */
const PET_SKIN = "201";
/**
 * 皮肤 painter 是懒加载 chunk，第一帧还没到位时先画这个底色，
 * 避免浅色页面上闪一下默认的近黑色。
 */
const PET_FALLBACK_COLOR = "#d5e4f5";

// 一次性预热皮肤 painter，别等第一次入画才下载。
void loadSkins();

type BoopFaceElement = HTMLElement & {
  play(action: string): Promise<unknown> | unknown;
  startWaiting(options?: { variant?: "spin" | "wrap" | "wave" }): unknown;
  stopWaiting(): unknown;
  wake(): unknown;
  setPointerFollow(enabled: boolean): unknown;
};

type BoopPetProps = {
  /** 舞台最终展示的 AI 姿态（displayStateOf 的结果）。 */
  ai: AiState;
  phase: PetPhase;
  night: boolean;
  reducedMotion: boolean;
  /** 无操作多久后自己睡着；与「变暗」用同一个设置。 */
  autoSleepMs: number;
};

function applyAction(face: BoopFaceElement, action: PetAction): void {
  face.stopWaiting?.();
  if (action === "sleep") {
    void face.play("sleep");
    return;
  }
  // 睡眠态下 play('idle') 不会自己醒，先显式唤醒（醒着时是无操作）。
  face.wake?.();
  if (isContinuous(action)) {
    face.startWaiting({ variant: "wave" });
    return;
  }
  void face.play(action);
}

/**
 * BoopFace 包装（D132/D133）：纯渲染，不做业务判断。
 *
 * 动作由 `resolvePetAction` 算好；这里只负责去重、切换和生命周期。
 * 不接管触摸：挤压/拖天线显式关闭，视线跟随关闭（手机没有悬停指针）。
 */
export function BoopPet({ ai, phase, night, reducedMotion, autoSleepMs }: BoopPetProps) {
  const faceRef = useRef<BoopFaceElement | null>(null);
  const lastActionRef = useRef<PetAction | null>(null);
  const mic = useMicStore((state) => state.phase);
  const reaction = usePetReactionStore((state) => state.reaction);
  const action = resolvePetAction({ phase, ai, mic, reaction, now: Date.now() });

  const [defined, setDefined] = useState(
    () => typeof customElements !== "undefined" && Boolean(customElements.get("boop-face")),
  );

  useEffect(() => {
    if (defined || typeof customElements === "undefined") return;
    let alive = true;
    void customElements.whenDefined("boop-face").then(() => {
      if (alive) setDefined(true);
    });
    return () => {
      alive = false;
    };
  }, [defined]);

  useEffect(() => {
    faceRef.current?.setPointerFollow?.(false);
  }, []);

  useEffect(() => {
    const face = faceRef.current;
    if (!face || !defined) return;
    if (lastActionRef.current === action) return;
    lastActionRef.current = action;
    applyAction(face, action);
  }, [action, defined]);

  return (
    <div
      className={cn(styles.motionLayer, "relative h-full w-full")}
      data-ai-state={ai}
      data-phase={phase}
      data-night={night ? "true" : "false"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-pet-action={action}
      data-pet-renderer="boop"
    >
      <boop-face
        ref={faceRef}
        className={styles.face}
        skin={PET_SKIN}
        color={PET_FALLBACK_COLOR}
        motion={reducedMotion ? "reduce" : "auto"}
        auto-sleep={String(Math.max(0, autoSleepMs))}
        wake-on="activity"
        press-squeeze="false"
        antenna-drag="false"
      />
    </div>
  );
}
