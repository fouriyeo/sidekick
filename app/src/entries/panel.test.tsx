import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountUsagePanel } from "./panel";

/**
 * 面板窗口的「画布透明」契约（2026-11-15 回归）：
 *
 * `panel.css` 用 `html.desktop-ios.dsl-transparent-window`（0,2,1）压过 ios.css 的
 * `:root.desktop-ios`（0,2,0）画布底色。类名少一个，整窗就会被刷成 #f2f2f7，
 * 卡片外多出一圈灰框（原生玻璃也采不到壁纸）。CSS 权重测不了，这里守住 JS 这半。
 * 麦克风 HUD 窗口（mic-hud.tsx / hud.css）是同一个契约。
 */
describe("mountUsagePanel", () => {
  afterEach(() => {
    document.documentElement.className = "";
  });

  it("给 <html> 同时挂桌面令牌类与透明小窗标记", () => {
    const render = vi.fn();

    mountUsagePanel({ render } as unknown as Root);

    const classes = document.documentElement.classList;
    expect(classes.contains("desktop-ios")).toBe(true);
    expect(classes.contains("dsl-transparent-window")).toBe(true);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
