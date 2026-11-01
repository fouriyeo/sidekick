import type { CSSProperties, ReactElement } from "react";
import styles from "./pet.module.css";

/**
 * AI 联动的 SVG 道具层：键盘/桌子、飞纸、汗滴、速度线、感叹号、彩纸、对勾。
 * 全部内联 SVG，只用 transform/opacity 动画；无外部资源、无 emoji。
 */

/** 两只短手臂：出生时缩在肚子边，working/asking/completed 用 CSS 摆姿势。 */
export function AiArms(): ReactElement {
  return (
    <g className={styles.arms} data-part="arms">
      <g className={styles.armLeft}>
        <path className={styles.arm} d="M 112 216 Q 90 236 96 262" />
        <ellipse className={styles.paw} cx={98} cy={266} rx={13} ry={10} />
      </g>
      <g className={styles.armRight}>
        <path className={styles.arm} d="M 208 216 Q 230 236 224 262" />
        <ellipse className={styles.paw} cx={222} cy={266} rx={13} ry={10} />
      </g>
    </g>
  );
}

const KEY_ROWS: Array<{ y: number; count: number }> = [
  { y: 271, count: 9 },
  { y: 280, count: 7 },
];

/** 工作中的小键盘 + 桌面。 */
export function AiKeyboard(): ReactElement {
  return (
    <g className={styles.keyboard} data-part="keyboard">
      <rect
        x={76}
        y={294}
        width={168}
        height={7}
        rx={3.5}
        fill="var(--pet-body-shadow)"
        opacity={0.45}
      />
      <rect x={98} y={263} width={124} height={34} rx={9} fill="var(--pet-body-shadow)" />
      <rect x={104} y={268} width={112} height={26} rx={5} fill="var(--pet-amber)" opacity={0.22} />
      {KEY_ROWS.map((row) => {
        const width = 11;
        const gap = 2.2;
        const rowWidth = row.count * width + (row.count - 1) * gap;
        const startX = 160 - rowWidth / 2;

        return Array.from({ length: row.count }, (_, keyIndex) => {
          const x = startX + keyIndex * (width + gap);
          const isAccent = row.y > 275 && x > 150 && x < 174;

          return (
            <rect
              key={x}
              x={x}
              y={row.y}
              width={width}
              height={7.5}
              rx={2}
              fill={isAccent ? "var(--pet-coral)" : "var(--pet-belly)"}
              opacity={isAccent ? 0.85 : 0.92}
            />
          );
        });
      })}
      <rect x={150} y={288} width={20} height={4} rx={2} fill="var(--pet-belly)" opacity={0.75} />
    </g>
  );
}

/** 工作太忙飞起来的纸片（每 5–7 秒一张）。 */
export function AiPaper(): ReactElement {
  return (
    <g className={styles.paper} data-part="paper">
      {[0, 1].map((index) => (
        <rect
          key={index}
          className={styles.paperSheet}
          width={17}
          height={21}
          rx={2.5}
          style={
            {
              "--paper-x": index === 0 ? "104px" : "198px",
              "--paper-y": index === 0 ? "268px" : "276px",
              animationDelay: index === 0 ? "0s" : "3.1s",
              animationDuration: index === 0 ? "6s" : "7s",
            } as CSSProperties
          }
        />
      ))}
    </g>
  );
}

/** 额头两侧的汗滴：琥珀 + 珊瑚，忙碌时左右交替冒。 */
export function AiSweat(): ReactElement {
  return (
    <g className={styles.sweat} data-part="sweat">
      <path
        className={styles.sweatAmber}
        d="M 246 96 q -10 16 0 24 q 10 -8 0 -24"
        data-drop="amber"
      />
      <path
        className={styles.sweatCoral}
        d="M 62 122 q -8 13 0 19 q 8 -6 0 -19"
        data-drop="coral"
      />
    </g>
  );
}

/** 身体两侧的速度线（忙碌时闪动）；按 SPEC 共 3 条。 */
export function AiSpeedLines(): ReactElement {
  return (
    <g className={styles.speedLines} data-part="speed-lines">
      <path className={styles.speedLine} d="M 24 148 h 36" />
      <path className={styles.speedLine} d="M 296 192 h -36" />
      <path className={styles.speedLine} d="M 30 240 h 26" />
    </g>
  );
}

const URGENCY_LINES = ["M 232 44 l 12 -11", "M 262 28 l 0 -15", "M 284 44 l 10 -10"];

/** 「等你决定」的珊瑚感叹号 + 三条着急线。 */
export function AiExclamation(): ReactElement {
  return (
    <g className={styles.exclamation} data-part="exclamation">
      <g className={styles.askBubble}>
        <circle cx={258} cy={76} r={23} fill="var(--pet-coral)" />
        <rect x={255} y={61} width={6.5} height={19} rx={3.2} fill="var(--pet-belly)" />
        <circle cx={258.25} cy={87} r={3.8} fill="var(--pet-belly)" />
      </g>
      <g className={styles.urgencyLines}>
        {URGENCY_LINES.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g className={styles.questionMark} data-part="question" transform="translate(42 58)">
        <path
          d="M 0 8 q 0 -10 9 -10 q 9 0 9 9 q 0 6 -7 7 l 0 5"
          fill="none"
          stroke="var(--pet-coral)"
          strokeWidth={5}
          strokeLinecap="round"
        />
        <circle cx={11} cy={26} r={3.4} fill="var(--pet-coral)" />
      </g>
    </g>
  );
}

const CONFETTI = [
  { x: 46, y: 118, rotate: 24, color: "var(--pet-coral)", delay: 0 },
  { x: 76, y: 62, rotate: -18, color: "var(--pet-amber)", delay: 0.08 },
  { x: 252, y: 48, rotate: 12, color: "var(--pet-success)", delay: 0.04 },
  { x: 284, y: 112, rotate: -28, color: "var(--pet-coral)", delay: 0.12 },
  { x: 34, y: 192, rotate: 32, color: "var(--pet-amber)", delay: 0.18 },
  { x: 292, y: 196, rotate: -14, color: "var(--pet-success)", delay: 0.06 },
  { x: 106, y: 34, rotate: 8, color: "var(--pet-coral)", delay: 0.22 },
  { x: 224, y: 28, rotate: -22, color: "var(--pet-amber)", delay: 0.16 },
];

const CONFETTI_HEARTS = [
  { x: 48, y: 138, delay: 0.12 },
  { x: 266, y: 130, delay: 0.24 },
  { x: 158, y: 20, delay: 0.36 },
];

/** 完成时的 8 片彩纸/闪光 + 3 颗爱心（SPEC：彩纸 6–8、爱心 ≤3）。 */
export function AiConfetti(): ReactElement {
  return (
    <g className={styles.confetti} data-part="confetti">
      {CONFETTI.map((piece) => (
        <rect
          key={`${piece.x}-${piece.y}`}
          className={styles.confettiPiece}
          x={piece.x}
          y={piece.y}
          width={9}
          height={13}
          rx={2}
          fill={piece.color}
          style={
            {
              "--confetti-rotate": `${piece.rotate}deg`,
              animationDelay: `${piece.delay}s`,
            } as CSSProperties
          }
        />
      ))}
      <g data-part="hearts">
        {CONFETTI_HEARTS.map((heart) => (
          <g key={`${heart.x}-${heart.y}`} transform={`translate(${heart.x} ${heart.y})`}>
            <path
              className={styles.heartPiece}
              d="M 0 4 C 0 1 3 0 4 2 C 5 0 8 1 8 4 C 8 7 4 9 4 9 C 4 9 0 7 0 4 Z"
              fill="var(--pet-coral)"
              style={{ animationDelay: `${heart.delay}s` }}
            />
          </g>
        ))}
      </g>
    </g>
  );
}

/** 完成时头顶的对勾气泡（取代感叹号的槽位）。 */
export function AiCheckBubble(): ReactElement {
  return (
    <g className={styles.checkBubble} data-part="check">
      <circle cx={258} cy={76} r={23} fill="var(--pet-success)" />
      <path
        className={styles.checkMark}
        d="M 246 77 l 8 9 l 16 -18"
        fill="none"
        stroke="var(--pet-eye)"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
