import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { MicHud } from "@/desktop/features/mic-receiver/mic-hud";
import "@/desktop/styles/ios.css";
import "@/desktop/styles/hud.css";

/**
 * 桌面顶部麦克风 HUD 的第二窗口入口（`?window=mic-hud`）。
 *
 * 与菜单栏看板同一套路：不加载桌面主壳、不连 WS，只订阅 Rust 推的 `mic-hud` 事件。
 * `.desktop-ios` 挂到 `<html>` 是为了拿到桌面令牌/字体；`.dsl-transparent-window`
 * 让 hud.css 能压过 ios.css 的 `:root.desktop-ios` 画布底色——窗口是 transparent(true)，
 * 留白被填成页面底色就会在状态条外多出一圈实心矩形。
 */
export function mountMicHud(root: Root): void {
  document.documentElement.classList.add("desktop-ios", "dsl-transparent-window");
  root.render(
    <StrictMode>
      <MicHud />
    </StrictMode>,
  );
}
