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
import { HookSection } from "./hook-section";

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

describe("HookSection", () => {
  it("已连接时展示联动状态、插件版本、profile 与最近心跳，不出现会话预览", async () => {
    tauri.getDshHookStatus.mockResolvedValue(makeStatus({ lastHeartbeatAt: Date.now() - 15_000 }));
    render(<HookSection />);

    expect(await screen.findByText("已连接")).toBeInTheDocument();
    expect(screen.getByText("插件版本")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("DSH profile")).toBeInTheDocument();
    expect(screen.getByText("最近心跳")).toBeInTheDocument();
    expect(screen.getByText(/秒前/)).toBeInTheDocument();
    expect(screen.getByText(/只发状态和会话标题/)).toBeInTheDocument();

    // 会话列表、事件映射与隐私长文已下线。
    expect(screen.queryByText("当前 AI 会话")).not.toBeInTheDocument();
    expect(screen.queryByText("状态怎么映射")).not.toBeInTheDocument();
    expect(screen.queryByText("最近事件")).not.toBeInTheDocument();
  });

  it("未写入时点开关弹二次确认，确认后按所选 profile 写入", async () => {
    tauri.getDshHookStatus.mockResolvedValue(notInstalled);
    render(<HookSection />);

    expect(await screen.findByText("未写入")).toBeInTheDocument();
    expect(screen.queryByText("还没有写入联动")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "启用 AI 联动" }));

    expect(await screen.findByText("写入 AI 联动？")).toBeInTheDocument();
    expect(screen.getByText("写入后需要重启一次 DeepSeek Harness。")).toBeInTheDocument();
    expect(tauri.installDshHook).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认写入" }));

    await waitFor(() => expect(tauri.installDshHook).toHaveBeenCalledWith("desktop"));
    await waitFor(() => expect(screen.queryByText("写入 AI 联动？")).not.toBeInTheDocument());

    // 写入后还没重启 DSH，不能直接宣称已连接。
    expect(await screen.findByText("等待连接")).toBeInTheDocument();
  });

  it("已安装但未连接时状态显示等待连接，心跳为空", async () => {
    tauri.getDshHookStatus.mockResolvedValue(
      makeStatus({ installed: true, enabled: true, connected: false, lastHeartbeatAt: null }),
    );
    render(<HookSection />);

    expect(await screen.findByText("等待连接")).toBeInTheDocument();
    expect(screen.getByText("还没有收到心跳")).toBeInTheDocument();
    expect(screen.queryByText("已连接")).not.toBeInTheDocument();
  });

  it("已连接后开关只调用 setDshHookEnabled", async () => {
    render(<HookSection />);

    expect(await screen.findByText("已连接")).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: "启用 AI 联动" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);

    await waitFor(() => expect(tauri.setDshHookEnabled).toHaveBeenCalledWith(false));
    expect(tauri.installDshHook).not.toHaveBeenCalled();
  });

  it("模拟按钮把状态传给 testDshHook", async () => {
    render(<HookSection />);

    expect(await screen.findByText("已连接")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "模拟等你决定" }));

    await waitFor(() => expect(tauri.testDshHook).toHaveBeenCalledWith("asking"));
  });

  it("移除联动需要二次确认，确认后调用 removeDshHook", async () => {
    render(<HookSection />);

    expect(await screen.findByText("已连接")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "移除联动" }));

    expect(await screen.findByText("移除 AI 联动？")).toBeInTheDocument();
    expect(tauri.removeDshHook).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认移除" }));

    await waitFor(() => expect(tauri.removeDshHook).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("移除 AI 联动？")).not.toBeInTheDocument());
  });

  it("已写入后 profile 选择器锁定", async () => {
    render(<HookSection />);

    expect(await screen.findByText("已连接")).toBeInTheDocument();
    const select = screen.getByLabelText("DSH profile");
    expect(select).toBeDisabled();
    expect(select).toHaveValue("desktop");
    expect(screen.getByText("已写入，先移除再切换")).toBeInTheDocument();
  });

  it("未写入时可以选另一个 profile 再写入", async () => {
    tauri.getDshHookStatus.mockResolvedValue(notInstalled);
    render(<HookSection />);

    expect(await screen.findByText("未写入")).toBeInTheDocument();
    const select = screen.getByLabelText("DSH profile");
    expect(select).not.toBeDisabled();

    fireEvent.change(select, { target: { value: "web" } });
    fireEvent.click(screen.getByRole("switch", { name: "启用 AI 联动" }));

    expect(await screen.findByText("写入 AI 联动？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认写入" }));

    await waitFor(() => expect(tauri.installDshHook).toHaveBeenCalledWith("web"));
  });

  it("读取失败时诊断组显示一行结论与重试", async () => {
    tauri.getDshHookStatus.mockRejectedValue(new Error("permission denied"));
    render(<HookSection />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("读取联动失败");
    expect(alert).toHaveTextContent("下一步");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.getByText("读不到联动状态")).toBeInTheDocument();
  });

  it("状态快照带 error 时显示修复与移除入口", async () => {
    tauri.getDshHookStatus.mockResolvedValue(makeStatus({ error: "cordis.patch.yml 写入失败" }));
    render(<HookSection />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("cordis.patch.yml 写入失败");
    expect(screen.getByText("联动出错")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "修复 / 重新写入" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除联动" })).toBeEnabled();
  });
});
