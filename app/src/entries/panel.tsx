import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { UsagePanel } from "@/desktop/panel/usage-panel";
import "@/desktop/styles/ios.css";
import "@/desktop/styles/panel.css";

/**
 * 菜单栏 Token 用量小看板（D108）的第二窗口入口。
 *
 * 由 `main.tsx` 在 `?window=panel` 时动态挂载，不加载桌面主壳（不连 WS、不做导航）。
 * `.desktop-ios` 挂到 `<html>` 是为了拿到桌面令牌/字体；`.dsl-transparent-window`
 * 是「这是透明小窗、别铺画布」的标记——`panel.css` 靠它把权重抬到能压过 ios.css 的
 * `:root.desktop-ios` 画布底色，否则整窗被刷成 #f2f2f7，卡片外多出一圈灰框。
 */
export function mountUsagePanel(root: Root): void {
  document.documentElement.classList.add("desktop-ios", "dsl-transparent-window");
  root.render(
    <StrictMode>
      <UsagePanel />
    </StrictMode>,
  );
}
