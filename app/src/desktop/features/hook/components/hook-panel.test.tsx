import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DshHookStatus } from "@/shared/lib/tauri";

const tauri = vi.hoisted(() => ({
  getDshHookStatus: vi.fn(),
  installDshHook: vi.fn(),
  setDshHookEnabled: vi.fn(),
  removeDshHook: vi.fn(),
  testDshHook: vi.fn(),
  subscribeDshHookStatus: vi.fn(),
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { useHookStore } from "../hook-store";
import { HookPanel } from "./hook-panel";

function makeStatus(overrides: Partial<DshHookStatus> = {}): DshHookStatus {
  return {
    installed: true,
    enabled: true,
    connected: true,
    profile: "desktop",
    currentState: "working",
    sessions: 1,
    lastEventAt: 1_000,
    lastHeartbeatAt: 2_000,
    pluginVersion: 1,
    endpoint: "http://127.0.0.1:47815/hook/dsh",
    configPath: "/Users/test/.dsh/sidekick/config.json",
    pluginPath: "/Users/test/.dsh/profiles/desktop/plugins/sidekick-hook.mjs",
    patchPath: "/Users/test/.dsh/profiles/desktop/cordis.patch.yml",
    error: null,
    recentEvents: [{ at: 1_000, state: "working", sessions: 1, source: "dsh" }],
    profiles: [
      { name: "desktop", label: "桌面端", active: true, installed: true },
      { name: "web", label: "网页端", active: false, installed: false },
    ],
    ...overrides,
  };
}

const notInstalled = makeStatus({
  installed: false,
  enabled: false,
  connected: false,
  profile: null,
  pluginVersion: null,
  endpoint: null,
  pluginPath: null,
  patchPath: null,
  recentEvents: [],
});

const installedWaiting = makeStatus({
  installed: true,
  enabled: true,
  connected: false,
  pluginVersion: null,
  lastEventAt: null,
  lastHeartbeatAt: null,
  recentEvents: [],
});

beforeEach(() => {
  useHookStore.getState().reset();
  vi.resetAllMocks();
  tauri.subscribeDshHookStatus.mockReturnValue(vi.fn());
  tauri.getDshHookStatus.mockResolvedValue(makeStatus());
  tauri.installDshHook.mockResolvedValue(installedWaiting);
  tauri.setDshHookEnabled.mockResolvedValue(makeStatus({ enabled: false, connected: false }));
  tauri.removeDshHook.mockResolvedValue(notInstalled);
  tauri.testDshHook.mockResolvedValue(makeStatus({ currentState: "asking" }));
});

afterEach(() => {
  cleanup();
  useHookStore.getState().reset();
});

describe("HookPanel", () => {
  it("未安装时给出首次写入说明，确认后按所选 profile 安装", async () => {
    tauri.getDshHookStatus.mockResolvedValue(notInstalled);
    render(<HookPanel />);

    expect(await screen.findByText("未写入")).toBeInTheDocument();
    expect(screen.getByText("还没有写入联动")).toBeInTheDocument();
    expect(screen.getByText(/首次写入后需要重启一次 DeepSeek Harness/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "启用 AI 联动" }));

    expect(await screen.findByText("写入 AI 联动？")).toBeInTheDocument();
    expect(screen.getByText(/会在本机写入三处内容/)).toBeInTheDocument();
    expect(screen.getByText(/每 5 秒一次心跳/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "写入联动" }));

    await waitFor(() => expect(tauri.installDshHook).toHaveBeenCalledWith("desktop"));
    await waitFor(() => expect(screen.queryByText("写入 AI 联动？")).not.toBeInTheDocument());

    // 写入后还没重启 DSH，不能直接宣称已连接。
    const waiting = await screen.findAllByText(/已写入，等待 DeepSeek Harness 重启\/连接/);
    expect(waiting.length).toBeGreaterThan(0);
  });

  it("已安装但未连接时提示等待 DSH 重启/连接", async () => {
    tauri.getDshHookStatus.mockResolvedValue(
      makeStatus({ installed: true, enabled: true, connected: false }),
    );
    render(<HookPanel />);

    const matches = await screen.findAllByText(/已写入，等待 DeepSeek Harness 重启\/连接/);
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.queryByText("还没有写入联动")).not.toBeInTheDocument();
  });

  it("已连接后开关只调用 setDshHookEnabled", async () => {
    render(<HookPanel />);

    expect(await screen.findByText("已连接")).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: "启用 AI 联动" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);

    await waitFor(() => expect(tauri.setDshHookEnabled).toHaveBeenCalledWith(false));
    expect(tauri.installDshHook).not.toHaveBeenCalled();
  });

  it("模拟按钮把状态传给 testDshHook", async () => {
    render(<HookPanel />);

    expect(await screen.findByText("已连接")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "模拟等你决定" }));

    await waitFor(() => expect(tauri.testDshHook).toHaveBeenCalledWith("asking"));
  });

  it("移除联动需要二次确认，确认后调用 removeDshHook", async () => {
    render(<HookPanel />);

    expect(await screen.findByText("已连接")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "移除联动" }));

    expect(await screen.findByText("移除 AI 联动？")).toBeInTheDocument();
    expect(tauri.removeDshHook).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认移除" }));

    await waitFor(() => expect(tauri.removeDshHook).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("移除 AI 联动？")).not.toBeInTheDocument());
  });

  it("已写入后 profile 选择器锁定，提示先移除联动", async () => {
    render(<HookPanel />);

    expect(await screen.findByText("已连接")).toBeInTheDocument();
    const select = screen.getByLabelText("DSH profile");
    expect(select).toBeDisabled();
    expect(select).toHaveValue("desktop");
    expect(screen.getByText("切换 profile 请先移除联动")).toBeInTheDocument();
  });

  it("未写入时可以选另一个 profile 再写入", async () => {
    tauri.getDshHookStatus.mockResolvedValue(notInstalled);
    render(<HookPanel />);

    expect(await screen.findByText("未写入")).toBeInTheDocument();
    const select = screen.getByLabelText("DSH profile");
    expect(select).not.toBeDisabled();

    fireEvent.change(select, { target: { value: "web" } });
    fireEvent.click(screen.getByRole("switch", { name: "启用 AI 联动" }));

    expect(await screen.findByText("写入 AI 联动？")).toBeInTheDocument();
    expect(screen.getByText(/将写入 profile：网页端/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "写入联动" }));

    await waitFor(() => expect(tauri.installDshHook).toHaveBeenCalledWith("web"));
  });

  it("读取失败时显示带下一步的 alert", async () => {
    tauri.getDshHookStatus.mockRejectedValue(new Error("permission denied"));
    render(<HookPanel />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("读取联动失败");
    expect(alert).toHaveTextContent("下一步");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("状态快照带 error 时显示修复与移除入口", async () => {
    tauri.getDshHookStatus.mockResolvedValue(makeStatus({ error: "cordis.patch.yml 写入失败" }));
    render(<HookPanel />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("cordis.patch.yml 写入失败");
    expect(screen.getByRole("button", { name: "修复 / 重新写入" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除联动" })).toBeEnabled();
  });

  it("展示事件列表、状态映射与隐私说明，不含对话内容", async () => {
    render(<HookPanel />);

    expect(await screen.findByText("已连接")).toBeInTheDocument();
    expect(screen.getByText("最近事件")).toBeInTheDocument();
    expect(screen.getByText("状态怎么映射")).toBeInTheDocument();
    expect(screen.getByText("DSH")).toBeInTheDocument();
    expect(
      screen.getByText(/不含工具名原文、提示词、回复、工具参数或文件路径/),
    ).toBeInTheDocument();
    expect(screen.getByText("/Users/test/.dsh/sidekick/config.json")).toBeInTheDocument();
    expect(screen.getByText("后续版本")).toBeInTheDocument();
  });
});
