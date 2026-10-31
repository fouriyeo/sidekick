import { describe, expect, it } from "vitest";
import { createGestureRecognizer } from "./gestures";

function sample(pointerId: number, x: number, t: number) {
  return { pointerId, x, y: 0, t };
}

describe("createGestureRecognizer", () => {
  it("recognizes back-and-forth petting and completes after three seconds", () => {
    const gestures = createGestureRecognizer();
    expect(gestures.down(sample(1, 0, 0))).toEqual([]);

    expect(gestures.move(sample(1, 20, 100))).toEqual([]);
    expect(gestures.move(sample(1, 0, 200))).toEqual([]);
    const start = gestures.move(sample(1, 20, 300));
    expect(start).toContainEqual({ type: "pet-start", at: 300 });

    const complete = gestures.move(sample(1, 24, 3000));
    expect(complete).toContainEqual({ type: "pet-complete", at: 3000, duration: 3000 });

    expect(gestures.up(sample(1, 24, 3200))).toContainEqual({
      type: "pet-end",
      at: 3200,
      duration: 3200,
    });
  });

  it("recognizes a short tap as a poke", () => {
    const gestures = createGestureRecognizer();
    gestures.down(sample(1, 10, 0));
    expect(gestures.up(sample(1, 10, 120))).toEqual([{ type: "poke", at: 120 }]);
  });

  it("does not turn a long press into a poke", () => {
    const gestures = createGestureRecognizer();
    gestures.down(sample(1, 10, 0));
    expect(gestures.up(sample(1, 10, 400))).toEqual([]);
  });

  it("ignores additional pointers", () => {
    const gestures = createGestureRecognizer();
    gestures.down(sample(1, 10, 0));
    expect(gestures.down(sample(2, 30, 20))).toEqual([]);
    expect(gestures.move(sample(2, 80, 40))).toEqual([]);
    expect(gestures.up(sample(2, 80, 60))).toEqual([]);
    expect(gestures.up(sample(1, 10, 100))).toEqual([{ type: "poke", at: 100 }]);
  });

  it("requires direction turns inside the 1.5s window", () => {
    const gestures = createGestureRecognizer();
    gestures.down(sample(1, 0, 0));
    gestures.move(sample(1, 20, 100));
    gestures.move(sample(1, 0, 200));
    const late = gestures.move(sample(1, 20, 2000));
    expect(late.some((event) => event.type === "pet-start")).toBe(false);
  });

  it("ends petting on cancel", () => {
    const gestures = createGestureRecognizer();
    gestures.down(sample(1, 0, 0));
    gestures.move(sample(1, 20, 100));
    gestures.move(sample(1, 0, 200));
    gestures.move(sample(1, 20, 300));
    expect(gestures.cancel(sample(1, 20, 400))).toContainEqual({
      type: "pet-end",
      at: 400,
      duration: 400,
    });
  });
});
