import { cn } from "cn";
import { useEffect, useRef } from "react";

const BAR_KEYS = Array.from({ length: 48 }, (_, index) => `wave-bar-${index}`);

type VoiceWaveformProps = {
  active: boolean;
  getLevel: () => number;
  reducedMotion: boolean;
  bars?: number;
  className?: string;
};

export function VoiceWaveform({
  active,
  getLevel,
  reducedMotion,
  bars = 24,
  className,
}: VoiceWaveformProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const elements = Array.from(container.children) as HTMLElement[];
    const paintStatic = () => {
      elements.forEach((bar, index) => {
        bar.style.transform = `scaleY(${0.16 + ((index * 7) % 5) * 0.06})`;
      });
    };

    if (!active || reducedMotion) {
      paintStatic();
      return;
    }

    const history = new Array<number>(elements.length).fill(0.08);
    let frame = 0;
    let lastSample = 0;

    const tick = (time: number) => {
      if (time - lastSample >= 50) {
        lastSample = time;
        history.push(getLevel());
        history.shift();

        elements.forEach((bar, index) => {
          const value = history[index] ?? 0;
          const variation = 0.62 + ((index * 7) % 10) / 24;
          bar.style.transform = `scaleY(${Math.max(0.08, Math.min(1, value * variation))})`;
        });
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, getLevel, reducedMotion]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn("flex h-7 items-center justify-center gap-[2px]", className)}
    >
      {BAR_KEYS.slice(0, bars).map((key) => (
        <span
          key={key}
          className="h-6 w-[3px] origin-center rounded-full bg-current transition-transform duration-75"
        />
      ))}
    </div>
  );
}
