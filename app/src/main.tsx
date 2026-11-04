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
