import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { MobileApp } from "@/mobile/app";
import "@/mobile/styles/clean.css";

export function mountMobile(root: Root): void {
  root.render(
    <StrictMode>
      {/* `.mobile-clean` 只给手机端挂干净版令牌；contents 不产生布局盒子。 */}
      <div className="mobile-clean contents">
        <MobileApp />
      </div>
    </StrictMode>,
  );
}
