import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getAccessibilityInfo: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => api);

import { AccessibilityHint } from "./accessibility-hint";

function makeInfo(trusted: boolean) {
  return {
    trusted,
    appName: "Sidekick",
    executablePath: "/Applications/Sidekick.app",
    isDev: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getAccessibilityInfo.mockResolvedValue(makeInfo(false));
});

afterEach(cleanup);

describe("AccessibilityHint 外壳级提示条", () => {
  it("未授权时出现提示条，「去开启」跳到设置页", async () => {
    const onOpenSettings = vi.fn();
    render(<AccessibilityHint onOpenSettings={onOpenSettings} />);

    expect(await screen.findByText("自动输入还没开启")).toBeInTheDocument();
    expect(screen.getByText(/只能复制到剪贴板/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "去开启" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("「知道了」收起提示条", async () => {
    render(<AccessibilityHint onOpenSettings={vi.fn()} />);

    await screen.findByText("自动输入还没开启");
    fireEvent.click(screen.getByRole("button", { name: "知道了" }));

    expect(screen.queryByText("自动输入还没开启")).toBeNull();
  });

  it("已授权时不占位置", async () => {
    api.getAccessibilityInfo.mockResolvedValue(makeInfo(true));
    render(<AccessibilityHint onOpenSettings={vi.fn()} />);

    await Promise.resolve();
    expect(screen.queryByText("自动输入还没开启")).toBeNull();
  });

  it("命令不可用（非 macOS）时静默不显示", async () => {
    api.getAccessibilityInfo.mockRejectedValue(new Error("unsupported"));
    render(<AccessibilityHint onOpenSettings={vi.fn()} />);

    await Promise.resolve();
    expect(screen.queryByText("自动输入还没开启")).toBeNull();
  });
});
