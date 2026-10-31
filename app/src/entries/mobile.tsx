import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { MobileApp } from "@/mobile/app";

export function mountMobile(root: Root): void {
  root.render(
    <StrictMode>
      <MobileApp />
    </StrictMode>,
  );
}
