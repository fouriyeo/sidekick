import { cn } from "cn";
import { useEffect, useState } from "react";
import type { AiState } from "./ai-status";
import styles from "./pet.module.css";
import {
  AiArms,
  AiCheckBubble,
  AiConfetti,
  AiExclamation,
  AiKeyboard,
  AiPaper,
  AiSpeedLines,
  AiSweat,
} from "./pet-ai-props";
import type { Mood, PetPhase } from "./types";

type PetFallbackProps = {
  mood: Mood;
  energy: number;
  isNight: boolean;
  phase: PetPhase;
  /** 舞台最终展示的 AI 姿态（displayStateOf 的结果）。 */
  aiState: AiState;
  reducedMotion: boolean;
  idleAction: "look" | "stretch" | null;
};

/** 「等你决定」先着急 6 秒，之后降为更温和的 4 秒循环。 */
const ASK_URGENT_MS = 6000;

function useAskingCalm(active: boolean): boolean {
  const [calm, setCalm] = useState(false);

  useEffect(() => {
    if (!active) {
      setCalm(false);
      return;
    }

    setCalm(false);
    const timer = window.setTimeout(() => setCalm(true), ASK_URGENT_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  return calm;
}

type FaceProps = {
  mood: Mood;
  phase: PetPhase;
  aiState: AiState;
};

function Eyes({ mood, phase, aiState }: FaceProps) {
  // 四态表情优先于心情：AI 联动时用夸张脸，否则回到原有 mood 表情。
  if (aiState === "asking") {
    return (
      <g className={styles.eyes} data-face="wide">
        <ellipse cx={126} cy={140} rx={14} ry={15} fill="var(--pet-belly)" />
        <ellipse cx={194} cy={140} rx={14} ry={15} fill="var(--pet-belly)" />
        <circle cx={128} cy={143} r={8} fill="var(--pet-eye)" />
        <circle cx={196} cy={143} r={8} fill="var(--pet-eye)" />
        <circle cx={130.8} cy={139.6} r={2.6} fill="var(--pet-belly)" />
        <circle cx={198.8} cy={139.6} r={2.6} fill="var(--pet-belly)" />
      </g>
    );
  }

  if (aiState === "completed") {
    return (
      <g className={styles.eyes} data-face="happy">
        <path d="M 116 144 Q 126 130 136 144" className={styles.mouth} strokeWidth={5} />
        <path d="M 184 144 Q 194 130 204 144" className={styles.mouth} strokeWidth={5} />
      </g>
    );
  }

  if (aiState === "working") {
    return (
      <g className={styles.eyes} data-face="focus">
        <ellipse cx={128} cy={143} rx={7} ry={6.2} fill="var(--pet-eye)" />
        <ellipse cx={192} cy={143} rx={7} ry={6.2} fill="var(--pet-eye)" />
        <circle cx={130.5} cy={140.8} r={2} fill="var(--pet-belly)" opacity={0.85} />
        <circle cx={194.5} cy={140.8} r={2} fill="var(--pet-belly)" opacity={0.85} />
      </g>
    );
  }

  const sleepy = phase === "sleeping" || mood === "sleepy";
  const happy = mood === "happy" || mood === "proud";

  if (sleepy) {
    return (
      <g className={styles.eyes}>
        <path d="M 120 142 Q 128 148 136 142" className={styles.mouth} />
        <path d="M 184 142 Q 192 148 200 142" className={styles.mouth} />
      </g>
    );
  }

  if (happy) {
    return (
      <g className={styles.eyes}>
        <path d="M 120 144 Q 128 134 136 144" className={styles.mouth} />
        <path d="M 184 144 Q 192 134 200 144" className={styles.mouth} />
      </g>
    );
  }

  return (
    <g className={styles.eyes}>
      <ellipse cx={128} cy={142} rx={7} ry={8} fill="var(--pet-eye)" />
      <ellipse cx={192} cy={142} rx={7} ry={8} fill="var(--pet-eye)" />
      <circle cx={130.5} cy={139.5} r={2.2} fill="var(--pet-belly)" opacity={0.85} />
      <circle cx={194.5} cy={139.5} r={2.2} fill="var(--pet-belly)" opacity={0.85} />
    </g>
  );
}

function Mouth({ mood, phase, aiState }: FaceProps) {
  if (aiState === "asking") {
    return (
      <g className={styles.askMouth} data-face="open">
        <ellipse cx={160} cy={177} rx={8} ry={10} fill="var(--pet-eye)" />
        <ellipse cx={160} cy={182} rx={4.5} ry={3.2} fill="var(--pet-coral)" />
      </g>
    );
  }

  if (aiState === "completed") {
    return <path d="M 146 170 Q 160 190 174 170" className={styles.mouth} strokeWidth={5} />;
  }

  if (aiState === "working") {
    return <path d="M 154 175 Q 160 182 166 175" className={styles.mouth} />;
  }

  if (phase === "sleeping" || mood === "sleepy") {
    return <path d="M 154 176 Q 160 180 166 176" className={styles.mouth} />;
  }

  if (mood === "happy" || mood === "proud") {
    return <path d="M 150 172 Q 160 184 170 172" className={styles.mouth} />;
  }

  if (mood === "concerned") {
    return <path d="M 152 178 Q 160 172 168 178" className={styles.mouth} />;
  }

  if (mood === "curious" || mood === "listening") {
    return (
      <ellipse
        cx={160}
        cy={176}
        rx={4}
        ry={5}
        fill="none"
        stroke="var(--pet-eye)"
        strokeWidth={4}
      />
    );
  }

  return <path d="M 152 171 Q 160 178 168 171" className={styles.mouth} />;
}

function FaceExtras({ mood, aiState }: { mood: Mood; aiState: AiState }) {
  if (aiState === "working") {
    // 皱眉干活。
    return (
      <g data-face="brows">
        <path d="M 114 121 L 138 127" className={styles.eyebrow} />
        <path d="M 206 121 L 182 127" className={styles.eyebrow} />
      </g>
    );
  }

  if (aiState === "asking") {
    // 眉毛全挑起来，显得着急。
    return (
      <g data-face="brows">
        <path d="M 110 118 Q 126 108 142 117" className={styles.eyebrow} />
        <path d="M 210 118 Q 194 108 178 117" className={styles.eyebrow} />
      </g>
    );
  }

  if (mood === "concerned") {
    return (
      <g data-face="brows">
        <path d="M 118 126 L 136 130" className={styles.eyebrow} />
        <path d="M 202 126 L 184 130" className={styles.eyebrow} />
      </g>
    );
  }

  return null;
}

export function PetFallback({
  mood,
  energy,
  isNight,
  phase,
  aiState,
  reducedMotion,
  idleAction,
}: PetFallbackProps) {
  const askingCalm = useAskingCalm(aiState === "asking" && !reducedMotion);
  const askingTone = aiState === "asking" ? (askingCalm ? "calm" : "urgent") : undefined;

  return (
    <div
      className={cn(
        styles.motionLayer,
        idleAction === "look" && styles.look,
        idleAction === "stretch" && styles.stretch,
        reducedMotion && styles.reduceMotion,
      )}
      data-mood={mood}
      data-phase={phase}
      data-ai-state={aiState}
      data-ask-tone={askingTone}
      data-energy={energy < 30 ? "low" : "ok"}
      data-night={isNight ? "true" : "false"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      <svg className={styles.petArt} viewBox="0 0 320 320" aria-hidden="true">
        <ellipse className={styles.shadow} cx={160} cy={288} rx={92} ry={15} />
        <circle className={styles.stateHalo} cx={160} cy={192} r={134} />

        {aiState === "working" && <AiSpeedLines />}
        {aiState === "completed" && <AiConfetti />}

        <g className={styles.tail}>
          <path
            d="M 224 246 C 270 250 288 222 276 194"
            fill="none"
            stroke="var(--pet-body-shadow)"
            strokeWidth={20}
            strokeLinecap="round"
          />
        </g>

        <g className={styles.bodyRig}>
          <ellipse cx={160} cy={226} rx={88} ry={70} fill="var(--pet-body)" />
          <ellipse cx={160} cy={238} rx={52} ry={42} fill="var(--pet-belly)" />
          <ellipse cx={122} cy={284} rx={28} ry={14} fill="var(--pet-body-shadow)" opacity={0.7} />
          <ellipse cx={198} cy={284} rx={28} ry={14} fill="var(--pet-body-shadow)" opacity={0.7} />
        </g>

        {aiState === "working" && <AiKeyboard />}

        <g className={styles.head}>
          <g className={styles.earLeft}>
            <ellipse cx={108} cy={82} rx={28} ry={34} fill="var(--pet-ear)" />
            <ellipse cx={110} cy={88} rx={13} ry={18} fill="var(--pet-belly)" opacity={0.55} />
          </g>
          <g className={styles.earRight}>
            <ellipse cx={212} cy={82} rx={28} ry={34} fill="var(--pet-ear)" />
            <ellipse cx={210} cy={88} rx={13} ry={18} fill="var(--pet-belly)" opacity={0.55} />
          </g>

          <ellipse cx={160} cy={146} rx={84} ry={74} fill="var(--pet-body)" />
          <ellipse cx={160} cy={164} rx={46} ry={34} fill="var(--pet-belly)" opacity={0.55} />

          <Eyes mood={mood} phase={phase} aiState={aiState} />
          <Mouth mood={mood} phase={phase} aiState={aiState} />
          <FaceExtras mood={mood} aiState={aiState} />

          <ellipse className={styles.cheek} cx={110} cy={166} rx={14} ry={7} />
          <ellipse className={styles.cheek} cx={210} cy={166} rx={14} ry={7} />
        </g>

        <AiArms />

        {aiState === "working" && <AiSweat />}
        {aiState === "working" && <AiPaper />}
        {aiState === "asking" && <AiExclamation />}
        {aiState === "completed" && <AiCheckBubble />}
      </svg>
    </div>
  );
}
