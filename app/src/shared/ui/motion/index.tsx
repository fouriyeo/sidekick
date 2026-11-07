import { cn } from "@/shared/lib/utils";
import "./motion.css";

/** 动效图标的公共属性：颜色一律 currentColor，尺寸单位 px。 */
export type MotionIconProps = {
  /** 图标边长（px）。行内图标位一般是 20，结果卡/大按钮 24–32。 */
  size?: number;
  className?: string;
  /** 读屏文案；缺省视为纯装饰（aria-hidden），文案由调用方负责。 */
  label?: string;
};

const a11yProps = (label?: string) => ({
  role: label ? ("img" as const) : undefined,
  "aria-label": label,
  "aria-hidden": label ? undefined : true,
});

/**
 * 加载 · 轨道弧：通用 loading。
 * 弧长会呼吸、整颗极轻地缩放；1.7s 一圈。数据是“有在动”但不催人。
 */
export function LoadingOrbit({ size = 20, className, label }: MotionIconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: 动效图标默认是装饰（aria-hidden），需要语义时由 label 提供 role=img + aria-label
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={cn("sk-orbit", className)}
      {...a11yProps(label)}
    >
      <circle className="sk-orbit__track" cx="20" cy="20" r="16" />
      <circle className="sk-orbit__arc" cx="20" cy="20" r="16" />
    </svg>
  );
}

/**
 * 加载 · 三点波：最轻的“正在想”，适合文字旁的等待。
 */
export function LoadingDots({ size = 20, className, label }: MotionIconProps) {
  return (
    <span className={cn("sk-dots", className)} style={{ fontSize: size }} {...a11yProps(label)}>
      <i />
      <i />
      <i />
    </span>
  );
}

export type HintCheckProps = MotionIconProps & {
  /** draw = 描线（克制，适合行内）；pop = 实心弹起（完成感更强，适合结果卡）。 */
  mode?: "draw" | "pop";
};

/**
 * 提示 · 完成：draw 先描圆再描勾，画完留一圈很慢的呼吸；
 * pop 实心圆弹起—回落—稳住，勾随后画出。
 */
export function HintCheck({ size = 20, mode = "draw", className, label }: HintCheckProps) {
  const draw = mode === "draw";
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: 动效图标默认是装饰（aria-hidden），需要语义时由 label 提供 role=img + aria-label
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={cn("sk-glyph", draw ? "sk-check" : "sk-check sk-check--pop", className)}
      {...a11yProps(label)}
    >
      {draw ? (
        <>
          <circle className="sk-check__halo" cx="20" cy="20" r="16" />
          <circle className="sk-check__ring" cx="20" cy="20" r="16" />
          <path className="sk-check__mark" d="M12 20.5l5.5 5.5L28 14.5" pathLength={100} />
        </>
      ) : (
        <>
          <circle className="sk-check__disc-halo" cx="20" cy="20" r="17.5" />
          <circle className="sk-check__disc" cx="20" cy="20" r="16" />
          <path className="sk-check__disc-mark" d="M12 20.5l5.5 5.5L28 14.5" pathLength={100} />
        </>
      )}
    </svg>
  );
}

/**
 * 提示 · 等待：环更胖更慢，中心一直呼吸。
 * 颜色由调用方给（app 里是 text-decide），只做“等人决定”的暗示。
 */
export function HintAsk({ size = 20, className, label }: MotionIconProps) {
  return (
    <span
      className={cn("sk-ask", className)}
      style={{ fontSize: size, width: size, height: size }}
      {...a11yProps(label)}
    >
      <i className="sk-ask__ripple" />
      <i className="sk-ask__ripple" />
      <b className="sk-ask__core" />
    </span>
  );
}

/**
 * 提示 · 失败：画叉后轻抖、再弹一下落定。只抖一次。
 */
export function HintError({ size = 20, className, label }: MotionIconProps) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: 动效图标默认是装饰（aria-hidden），需要语义时由 label 提供 role=img + aria-label
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={cn("sk-glyph sk-error", className)}
      {...a11yProps(label)}
    >
      <circle className="sk-error__ring" cx="20" cy="20" r="16" />
      <path
        className="sk-error__cross"
        d="M14.6 14.6l10.8 10.8M25.4 14.6L14.6 25.4"
        pathLength={100}
      />
    </svg>
  );
}
