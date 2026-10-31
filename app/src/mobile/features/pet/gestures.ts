import type { GestureEvent } from "./types";

export type PointerSample = {
  pointerId: number;
  x: number;
  y: number;
  t: number;
};

export type GestureRecognizer = {
  down: (sample: PointerSample) => GestureEvent[];
  move: (sample: PointerSample) => GestureEvent[];
  up: (sample: PointerSample) => GestureEvent[];
  cancel: (sample: PointerSample) => GestureEvent[];
  reset: () => void;
};

export type GestureOptions = {
  turnWindowMs?: number;
  turnsRequired?: number;
  tapMaxMs?: number;
  petCompleteMs?: number;
  slopPx?: number;
};

type Direction = -1 | 0 | 1;

export function createGestureRecognizer(options: GestureOptions = {}): GestureRecognizer {
  const turnWindowMs = options.turnWindowMs ?? 1500;
  const turnsRequired = options.turnsRequired ?? 2;
  const tapMaxMs = options.tapMaxMs ?? 250;
  const petCompleteMs = options.petCompleteMs ?? 3000;
  const slopPx = options.slopPx ?? 8;

  let activePointer: number | null = null;
  let startedAt = 0;
  let lastX = 0;
  let lastY = 0;
  let totalDistance = 0;
  let lastDirection: Direction = 0;
  let turns: number[] = [];
  let petting = false;
  let completed = false;

  function reset() {
    activePointer = null;
    startedAt = 0;
    lastX = 0;
    lastY = 0;
    totalDistance = 0;
    lastDirection = 0;
    turns = [];
    petting = false;
    completed = false;
  }

  function directionFor(dx: number, dy: number): Direction {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return 0;
    return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : -1) : dy > 0 ? 1 : -1;
  }

  function down(sample: PointerSample): GestureEvent[] {
    if (activePointer !== null) return [];

    reset();
    activePointer = sample.pointerId;
    startedAt = sample.t;
    lastX = sample.x;
    lastY = sample.y;
    return [];
  }

  function move(sample: PointerSample): GestureEvent[] {
    if (activePointer !== sample.pointerId) return [];

    const dx = sample.x - lastX;
    const dy = sample.y - lastY;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.5) return [];

    totalDistance += distance;
    lastX = sample.x;
    lastY = sample.y;

    const direction = directionFor(dx, dy);
    if (direction !== 0) {
      if (lastDirection !== 0 && direction !== lastDirection) {
        turns.push(sample.t);
      }
      lastDirection = direction;
    }

    turns = turns.filter((at) => sample.t - at <= turnWindowMs);

    const events: GestureEvent[] = [];
    if (!petting && totalDistance >= slopPx && turns.length >= turnsRequired) {
      petting = true;
      events.push({ type: "pet-start", at: sample.t });
    }

    if (petting) {
      events.push({ type: "pet-progress", at: sample.t, elapsed: sample.t - startedAt });
      if (!completed && sample.t - startedAt >= petCompleteMs) {
        completed = true;
        events.push({ type: "pet-complete", at: sample.t, duration: sample.t - startedAt });
      }
    }

    return events;
  }

  function up(sample: PointerSample): GestureEvent[] {
    if (activePointer !== sample.pointerId) return [];

    const duration = sample.t - startedAt;
    const events: GestureEvent[] = [];

    if (petting) {
      events.push({ type: "pet-end", at: sample.t, duration });
    } else if (duration < tapMaxMs && totalDistance < slopPx) {
      events.push({ type: "poke", at: sample.t });
    }

    reset();
    return events;
  }

  function cancel(sample: PointerSample): GestureEvent[] {
    if (activePointer !== sample.pointerId) return [];

    const events: GestureEvent[] = petting
      ? [{ type: "pet-end", at: sample.t, duration: sample.t - startedAt }]
      : [];

    reset();
    return events;
  }

  return { down, move, up, cancel, reset };
}
