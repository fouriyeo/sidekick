import type { Posture } from "./types";

export type Orientation = "portrait" | "landscape";

export const POSTURE_LABEL: Record<Posture, string> = {
  docked: "支架",
  handheld: "手持",
};

export function postureForOrientation(orientation: Orientation): Posture {
  return orientation === "landscape" ? "docked" : "handheld";
}

export function isPosture(value: unknown): value is Posture {
  return value === "docked" || value === "handheld";
}

export function nextPosture(posture: Posture): Posture {
  return posture === "docked" ? "handheld" : "docked";
}
