import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playPcm16 } from "@/mobile/features/mic/mic-probe";
import { recordDefaultClip } from "@/mobile/features/mic/mic-probe-default";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { primeMicrophone } from "@/mobile/features/mic/voice-recorder";
import { micProbeDevices, micProbeRecord } from "@/shared/lib/tauri";
import { MicProbeCard } from "./mic-probe-card";

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  micProbeDevices: vi.fn(),
  micProbeRecord: vi.fn(),
}));

vi.mock("@/mobile/features/mic/voice-recorder", () => ({
  primeMicrophone: vi.fn(),
}));

vi.mock("@/mobile/features/mic/mic-probe-default", () => ({
  recordDefaultClip: vi.fn(),
}));

vi.mock("@/mobile/features/mic/mic-probe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/mobile/features/mic/mic-probe")>()),
  playPcm16: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

const TOP = {
  id: 17,
  address: "back",
  productName: "RMX3370",
  channelCounts: [1, 2],
  sampleRates: [16000],
};

const BOTTOM = {
  id: 16,
  address: "bottom",
  productName: "RMX3370",
  channelCounts: [1, 2],
  sampleRates: [16000],
};

const CLIP = {
  pcmBase64: "AAA=",
  sampleRate: 16000,
  samples: 1,
  sourceUsed: 9,
  routedAddress: "back",
  preferredApplied: true,
  rms: 0.01,
  peak: 0.02,
  elapsedMs: 3000,
};

const AUTO_CLIP = {
  ...CLIP,
  sourceUsed: 7,
  routedAddress: "default",
  auto: true,
};

beforeEach(() => {
  localStorage.clear();
  useMicStore.setState({ phase: "idle" });
  vi.mocked(micProbeDevices).mockResolvedValue([BOTTOM, TOP]);
  vi.mocked(micProbeRecord).mockResolvedValue(CLIP);
  vi.mocked(recordDefaultClip).mockResolvedValue(AUTO_CLIP);
  vi.mocked(primeMicrophone).mockResolvedValue(undefined);
  vi.mocked(playPcm16).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("MicProbeCard", () => {
  it("默认自动；列出自动/顶部/底部，顶部在原生项里优先", async () => {
    render(<MicProbeCard />);

    expect(await screen.findByText("自动（默认）")).toBeInTheDocument();
    expect(await screen.findByText("顶部麦克风")).toBeInTheDocument();
    expect(screen.getByText("底部麦克风")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "试录 顶部麦克风 3 秒" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "试录 底部麦克风 3 秒" })).toBeInTheDocument();
  });

  it("试录顶部 → 显示实际路由 → 播放 → 记住偏好", async () => {
    render(<MicProbeCard />);
    await screen.findByText("顶部麦克风");

    fireEvent.click(screen.getByRole("button", { name: "试录 顶部麦克风 3 秒" }));

    await waitFor(() => expect(micProbeRecord).toHaveBeenCalledWith(17, 3));
    expect(await screen.findByText(/实际路由：顶部麦克风（back）/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "播放 顶部麦克风 的试录" }));
    await waitFor(() => expect(playPcm16).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "使用 顶部麦克风" }));
    expect(localStorage.getItem("sidekick:mic-probe:preferred:v2")).toBe("back");
    expect(screen.getByText(/已记录偏好：顶部麦克风/)).toBeInTheDocument();
  });

  it("试听默认走系统链路；可以从顶部切回自动", async () => {
    render(<MicProbeCard />);
    await screen.findByText("自动（默认）");

    expect(screen.getByRole("button", { name: "使用 自动（默认）" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "试听默认 3 秒" }));
    await waitFor(() => expect(recordDefaultClip).toHaveBeenCalledWith(3));
    expect(await screen.findByText(/实际路由：系统默认（未单独指定）/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "使用 顶部麦克风" }));
    fireEvent.click(screen.getByRole("button", { name: "使用 自动（默认）" }));
    expect(localStorage.getItem("sidekick:mic-probe:preferred:v2")).toBe("auto");
  });

  it("原生拒绝时把原因留在卡片里", async () => {
    vi.mocked(micProbeRecord).mockRejectedValue("需要麦克风权限：请先在宠物页按一次麦克风授权");
    render(<MicProbeCard />);
    await screen.findByText("顶部麦克风");

    fireEvent.click(screen.getByRole("button", { name: "试录 顶部麦克风 3 秒" }));

    expect(
      await screen.findByText("需要麦克风权限：请先在宠物页按一次麦克风授权"),
    ).toBeInTheDocument();
  });

  it("枚举失败时显示平台提示而不是崩溃", async () => {
    vi.mocked(micProbeDevices).mockRejectedValue("当前平台不支持麦克风选择");
    render(<MicProbeCard />);

    expect(await screen.findByText(/仅 Android 实验版可用/)).toBeInTheDocument();
  });
});
