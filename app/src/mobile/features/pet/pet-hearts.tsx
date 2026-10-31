import { Heart } from "lucide-react";
import styles from "./pet.module.css";
import type { HeartBurst } from "./types";

const POSITIONS = [42, 48, 54, 60, 46, 52];

type PetHeartsProps = {
  burst: HeartBurst | null;
  reducedMotion: boolean;
};

export function PetHearts({ burst, reducedMotion }: PetHeartsProps) {
  if (!burst || reducedMotion) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
      {Array.from({ length: Math.min(6, burst.count) }, (_, index) => (
        <Heart
          key={`${burst.id}-${POSITIONS[index]}`}
          className={styles.heart}
          style={{
            left: `${POSITIONS[index] ?? 52}%`,
            animationDelay: `${index * 45}ms`,
          }}
          fill="currentColor"
        />
      ))}
    </div>
  );
}
