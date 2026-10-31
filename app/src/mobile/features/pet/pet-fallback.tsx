import { cn } from "cn";
import styles from "./pet.module.css";
import type { Mood, PetPhase } from "./types";

type PetFallbackProps = {
  mood: Mood;
  energy: number;
  isNight: boolean;
  phase: PetPhase;
  reducedMotion: boolean;
  idleAction: "look" | "stretch" | null;
};

function Eyes({ mood, phase }: { mood: Mood; phase: PetPhase }) {
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

function Mouth({ mood, phase }: { mood: Mood; phase: PetPhase }) {
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

export function PetFallback({
  mood,
  energy,
  isNight,
  phase,
  reducedMotion,
  idleAction,
}: PetFallbackProps) {
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
      data-energy={energy < 30 ? "low" : "ok"}
      data-night={isNight ? "true" : "false"}
    >
      <svg className={styles.petArt} viewBox="0 0 320 320" aria-hidden="true">
        <ellipse className={styles.shadow} cx={160} cy={286} rx={88} ry={16} />

        <g className={styles.tail}>
          <path
            d="M 224 246 C 270 250 288 222 276 194"
            fill="none"
            stroke="var(--pet-body-shadow)"
            strokeWidth={20}
            strokeLinecap="round"
          />
        </g>

        <ellipse cx={160} cy={226} rx={88} ry={70} fill="var(--pet-body)" />
        <ellipse cx={160} cy={238} rx={52} ry={42} fill="var(--pet-belly)" />
        <ellipse cx={122} cy={284} rx={28} ry={14} fill="var(--pet-body-shadow)" opacity={0.7} />
        <ellipse cx={198} cy={284} rx={28} ry={14} fill="var(--pet-body-shadow)" opacity={0.7} />

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

          <Eyes mood={mood} phase={phase} />
          <Mouth mood={mood} phase={phase} />

          {mood === "concerned" && (
            <>
              <path d="M 118 126 L 136 130" className={styles.eyebrow} />
              <path d="M 202 126 L 184 130" className={styles.eyebrow} />
            </>
          )}

          <ellipse className={styles.cheek} cx={110} cy={166} rx={14} ry={7} />
          <ellipse className={styles.cheek} cx={210} cy={166} rx={14} ry={7} />
        </g>
      </svg>
    </div>
  );
}
