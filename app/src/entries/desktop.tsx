import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { DesktopApp } from "@/desktop/app";

export function mountDesktop(root: Root): void {
  root.render(
    <StrictMode>
      <DesktopApp />
    </StrictMode>,
  );
}
