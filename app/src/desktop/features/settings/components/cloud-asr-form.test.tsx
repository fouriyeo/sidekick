import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudAsrStatus } from "@/shared/lib/tauri";

const tauri = vi.hoisted(() => ({
  getCloudAsrStatus: vi.fn(),
  saveCloudAsr: vi.fn(),
  testCloudAsr: vi.fn(),
  selectAsrEngine: vi.fn(),
  clearCloudAsr: vi.fn(),
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);
vi.mock("@/desktop/features/settings/components/model-manager", () => ({
  ModelManager: () => null,
}));

import { useCloudAsrStore } from "../cloud-asr-store";
import { AsrEngineCard } from "./asr-engine-card";

function makeStatus(overrides: Partial<CloudAsrStatus> = {}): CloudAsrStatus {
  return {
    engine: "local",
    configured: true,
    consent: true,
    hasKey: true,
    keyMasked: "sk-••••cdef",
    fallbackToLocal: true,
    localReady: true,
    config: {
      endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
      workspaceId: "",
      model: "qwen-audio-3.1-asr-flash-streaming",
      languageHints: ["zh"],
      keepDialect: false,
      vadModel: "near_meeting_16k",
      maxSentenceSilenceMs: 800,
      heartbeat: true,
      vocabulary: ["异步"],
    },
    ...overrides,
  };
}

async function renderCloudTab() {
  render(<AsrEngineCard />);
  await screen.findByText("当前生效：本机 whisper");
  fireEvent.click(screen.getByRole("tab", { name: "百炼云端" }));
  await screen.findByLabelText("API Key");
}

beforeEach(() => {
  useCloudAsrStore.getState().reset();
  vi.resetAllMocks();
  tauri.getCloudAsrStatus.mockResolvedValue(makeStatus());
  tauri.saveCloudAsr.mockResolvedValue(makeStatus({ engine: "bailian" }));
  tauri.selectAsrEngine.mockResolvedValue(makeStatus({ engine: "bailian" }));
  tauri.testCloudAsr.mockResolvedValue({
    ok: true,
    latencyMs: 320,
    model: "qwen-audio-3.1-asr-flash-streaming",
    errorCode: null,
    message: null,
  });
});

afterEach(() => {
  cleanup();
  useCloudAsrStore.getState().reset();
});

describe("AsrEngineCard / 百炼云端表单", () => {
  it("加载后显示掩码 Key 与默认模型", async () => {
    await renderCloudTab();

    const key = screen.getByLabelText("API Key");
    expect(key).toHaveAttribute("placeholder", expect.stringContaining("sk-"));
    expect(key).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("模型")).toHaveValue("qwen-audio-3.1-asr-flash-streaming");
    expect(screen.getByText("云端未启用")).toBeInTheDocument();
  });

  it("保存并启用时提交完整配置并切换引擎", async () => {
    await renderCloudTab();

    fireEvent.click(screen.getByRole("button", { name: "保存并启用" }));

    await waitFor(() => expect(tauri.saveCloudAsr).toHaveBeenCalledTimes(1));
    expect(tauri.saveCloudAsr).toHaveBeenCalledWith({
      config: {
        endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
        workspaceId: "",
        model: "qwen-audio-3.1-asr-flash-streaming",
        languageHints: ["zh"],
        keepDialect: false,
        vadModel: "near_meeting_16k",
        maxSentenceSilenceMs: 800,
        heartbeat: true,
        vocabulary: ["异步"],
      },
      consent: true,
      fallbackToLocal: true,
      apiKey: null,
      clearKey: false,
    });
    await waitFor(() => expect(tauri.selectAsrEngine).toHaveBeenCalledWith("bailian"));
  });

  it("测试连接成功显示延迟", async () => {
    await renderCloudTab();

    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    expect(await screen.findByText(/连接成功 · 320ms/)).toBeInTheDocument();
    expect(tauri.testCloudAsr).toHaveBeenCalledWith({
      config: expect.objectContaining({
        endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
        model: "qwen-audio-3.1-asr-flash-streaming",
      }),
      apiKey: null,
    });
  });

  it("测试连接失败显示中文错误", async () => {
    tauri.testCloudAsr.mockResolvedValue({
      ok: false,
      latencyMs: null,
      model: null,
      errorCode: "cloud_key_invalid",
      message: "百炼 API Key 无效或已过期",
    });
    await renderCloudTab();

    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    expect(await screen.findByText("百炼 API Key 无效或已过期")).toBeInTheDocument();
  });

  it("未勾选同意时不能保存启用", async () => {
    tauri.getCloudAsrStatus.mockResolvedValue(makeStatus({ consent: false }));
    await renderCloudTab();

    const save = screen.getByRole("button", { name: "保存并启用" });
    expect(save).toBeDisabled();
    expect(screen.getByText("先勾选上方同意才能保存启用。")).toBeInTheDocument();

    fireEvent.click(save);
    expect(tauri.saveCloudAsr).not.toHaveBeenCalled();
  });

  it("服务地址不是 wss 时阻止测试", async () => {
    await renderCloudTab();

    fireEvent.change(screen.getByLabelText("服务地址"), {
      target: { value: "http://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    expect(
      await screen.findByText("服务地址必须是 wss://（本机测试可用 ws://localhost）"),
    ).toBeInTheDocument();
    expect(tauri.testCloudAsr).not.toHaveBeenCalled();
  });

  it("清除 Key 只删除密钥、保留配置", async () => {
    await renderCloudTab();

    fireEvent.click(screen.getByRole("button", { name: "清除 Key" }));

    await waitFor(() =>
      expect(tauri.saveCloudAsr).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: null, clearKey: true }),
      ),
    );
  });
});
