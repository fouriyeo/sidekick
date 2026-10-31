import { useEffect, useState } from "react";
import type { Orientation } from "./posture";

const PORTRAIT_QUERY = "(orientation: portrait)";

export function readOrientation(): Orientation {
  if (typeof window === "undefined") return "portrait";

  if (typeof window.matchMedia === "function") {
    return window.matchMedia(PORTRAIT_QUERY).matches ? "portrait" : "landscape";
  }

  return window.innerHeight >= window.innerWidth ? "portrait" : "landscape";
}

export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(readOrientation);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const update = () => setOrientation(readOrientation());
    const media =
      typeof window.matchMedia === "function" ? window.matchMedia(PORTRAIT_QUERY) : null;

    if (media) {
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", update);
      } else {
        media.addListener?.(update);
      }
    }

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    update();

    return () => {
      if (media) {
        if (typeof media.removeEventListener === "function") {
          media.removeEventListener("change", update);
        } else {
          media.removeListener?.(update);
        }
      }

      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return orientation;
}
