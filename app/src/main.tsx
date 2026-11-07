import { createRoot } from "react-dom/client";
import { getAppRole, normalizeError } from "@/shared/lib/tauri";
import { initTheme } from "@/shared/lib/theme";
import "./shared/styles/globals.css";

function FatalError({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-lg font-semibold">Sidekick 启动失败</h1>
        <p className="text-sm text-muted-foreground">请重启 App 再试一次。</p>
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}

/** 是否菜单栏用量小看板窗口（`?window=panel`）；浏览器 dev 也用同一入口做 QA。 */
function isUsagePanelWindow(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("window") === "panel";
}

async function bootstrap() {
  const container = document.getElementById("root");
  if (!container) throw new Error("缺少 #root 挂载点");

  if (import.meta.env.DEV) {
    const { installTauriMock } = await import("./dev/tauri-mock");
    installTauriMock();
  }

  initTheme();
  const root = createRoot(container);

  try {
    // 菜单栏用量小看板（D108）：Rust 用 `index.html?window=panel` 创建第二个窗口，
    // 这里先于 app_role 判定，直接挂紧凑面板，不加载桌面主壳。
    if (isUsagePanelWindow()) {
      const { mountUsagePanel } = await import("./entries/panel");
      mountUsagePanel(root);
      return;
    }

    const role = await getAppRole();
    if (role === "mobile") {
      const { mountMobile } = await import("./entries/mobile");
      mountMobile(root);
    } else {
      const { mountDesktop } = await import("./entries/desktop");
      mountDesktop(root);
    }
  } catch (error) {
    root.render(<FatalError message={normalizeError(error)} />);
  }
}

void bootstrap();
