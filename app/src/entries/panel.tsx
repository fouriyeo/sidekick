import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { UsagePanel } from "@/desktop/panel/usage-panel";
import "@/desktop/styles/ios.css";
import "@/desktop/styles/panel.css";

/**
 * 菜单栏 Token 用量小看板（D108）的第二窗口入口。
 *
 * 由 `main.tsx` 在 `?window=panel` 时动态挂载，不加载桌面主壳（不连 WS、不做导航）。
 * `.desktop-ios` 挂到 `<html>` 是为了拿到桌面令牌/字体；卡片自己铺不透明背景，
 * 因为 `html.dsl-vibrancy` 会把 html/body 设成透明（透明窗口 + CSS 圆角/阴影）。
 */
export function mountUsagePanel(root: Root): void {
  document.documentElement.classList.add("desktop-ios");
  root.render(
    <StrictMode>
      <UsagePanel />
    </StrictMode>,
  );
}
