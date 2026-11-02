import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import type { AiState } from "./ai-status";
import styles from "./pet.module.css";
import { MANIFEST, PET_POSTER_URL, PET_SHEET_URL, type SpriteState } from "./sprite-manifest";
import { advanceFrames } from "./sprite-player";
import { resolveSpriteState, spriteStateChain } from "./sprite-state-map";
import type { PetPhase } from "./types";

type SpritePetProps = {
  /** 舞台最终展示的 AI 姿态（displayStateOf 的结果）。 */
  ai: AiState;
  phase: PetPhase;
  night: boolean;
  /** 宠物页是否在前台（聊天/设置打开时为 false）。 */
  active: boolean;
  reducedMotion: boolean;
};

type SheetStatus = "loading" | "ready" | "error";

type SheetInfo = {
  /** 图集实际行数（naturalHeight / cell），允许比 manifest 声明的多。 */
  rows: number;
};

function frameStyle(state: SpriteState, index: number, cell: number): string | null {
  const frame = state.frames[index] ?? state.frames[state.frames.length - 1];
  if (!frame) return null;
  return `${-frame.col * cell}px ${-state.row * cell}px`;
}

/**
 * OpenPets schema 2 图集播放器。
 *
 * 一列一帧，每状态最多 32 帧；状态由 `spriteStateChain` 解析成 manifest 里存在的名字，
 * 所以图集以后加行（sleeping / petting …）不用改这里。
 */
export function SpritePet({ ai, phase, night, active, reducedMotion }: SpritePetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const frameIndexRef = useRef(0);
  const lastStateRef = useRef<string | null>(null);
  const [status, setStatus] = useState<SheetStatus>(MANIFEST ? "loading" : "error");
  const [sheet, setSheet] = useState<SheetInfo | null>(null);
  const [size, setSize] = useState(0);
  const [hidden, setHidden] = useState(false);

  const stateName = MANIFEST
    ? resolveSpriteState(spriteStateChain(phase, ai), MANIFEST.states, MANIFEST.defaultState)
    : null;
  const state = stateName && MANIFEST ? (MANIFEST.states[stateName] ?? null) : null;
  const cell = size > 0 ? size : (MANIFEST?.cell ?? 256);

  // 解码 + 尺寸校验：宽必须 = cols × cell，高必须是 cell 的整数倍且覆盖所有行。
  useEffect(() => {
    const manifest = MANIFEST;
    if (!manifest) {
      setStatus("error");
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.src = PET_SHEET_URL;
    const ready =
      typeof image.decode === "function"
        ? image.decode().then(() => image)
        : Promise.resolve(image);

    ready
      .then((decoded) => {
        if (cancelled) return;
        const rows = decoded.naturalHeight / manifest.cell;
        const valid =
          decoded.naturalWidth === manifest.cols * manifest.cell &&
          decoded.naturalHeight % manifest.cell === 0 &&
          rows >= manifest.rows;
        if (valid) {
          setSheet({ rows });
          setStatus("ready");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 容器尺寸变化（旋转/姿态切换）时重算背景尺寸，不重新解码。
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    if (typeof ResizeObserver === "undefined") {
      setSize(element.clientWidth || 0);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setSize(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 后台暂停：rAF 在 WebView 后台会被降频，这里直接停。
  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onChange);
    onChange();
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    const element = spriteRef.current;
    if (!element || !MANIFEST || !state || !sheet || status !== "ready") return;

    element.style.backgroundSize = `${MANIFEST.cols * cell}px ${sheet.rows * cell}px`;

    if (lastStateRef.current !== stateName) {
      lastStateRef.current = stateName;
      frameIndexRef.current = 0;
    }

    const apply = (index: number) => {
      const position = frameStyle(state, index, cell);
      if (position) element.style.backgroundPosition = position;
    };

    if (reducedMotion) {
      frameIndexRef.current = 0;
      apply(0);
      return;
    }

    if (!active || hidden) {
      apply(frameIndexRef.current);
      return;
    }

    let index = frameIndexRef.current;
    const offset = state.frames.slice(0, index).reduce((sum, frame) => sum + frame.duration, 0);
    const startedAt = performance.now() - offset;
    apply(index);

    let raf = 0;
    const tick = (now: number) => {
      const step = advanceFrames(state.frames, now - startedAt, state.loop);
      if (step.index !== index) {
        index = step.index;
        apply(index);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      frameIndexRef.current = index;
    };
  }, [state, stateName, sheet, status, cell, active, hidden, reducedMotion]);

  return (
    <div
      ref={rootRef}
      className={cn(styles.motionLayer, "relative h-full w-full")}
      data-ai-state={ai}
      data-phase={phase}
      data-night={night ? "true" : "false"}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-sprite-state={stateName ?? "none"}
      data-sprite-status={status}
    >
      {status !== "ready" && (
        <img
          src={PET_POSTER_URL}
          alt=""
          aria-hidden="true"
          draggable={false}
          className={styles.poster}
        />
      )}
      <div
        ref={spriteRef}
        aria-hidden="true"
        className={styles.sprite}
        style={MANIFEST ? { backgroundImage: `url(${PET_SHEET_URL})` } : undefined}
      />
    </div>
  );
}
