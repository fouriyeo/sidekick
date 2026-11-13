import type { DetailedHTMLProps, HTMLAttributes } from "react";

type BoopFaceAttributes = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  /** 像素尺寸；不传时用 `--face-size` 变量，舞台里设成 100% 跟随槽位。 */
  size?: string;
  /** 无皮肤时的主体颜色。 */
  color?: string;
  /** 皮肤编号，如 "201"；设置后 `color` 失效。 */
  skin?: string;
  /** 闲置多久自动入睡（毫秒字符串，"0" 关闭）。 */
  "auto-sleep"?: string;
  "wake-on"?: "activity" | "interaction" | "manual";
  motion?: "auto" | "reduce" | "full";
  /** 触摸设备上按压不触发挤压（挤压本来就只认鼠标/笔）。 */
  "press-squeeze"?: "true" | "false";
  /** 触摸拖动天线会触发弹簧拉扯，宠物页显式关掉。 */
  "antenna-drag"?: "true" | "false";
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "boop-face": BoopFaceAttributes;
    }
  }
}
