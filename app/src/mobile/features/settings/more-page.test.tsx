import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { defaultPetState } from "@/mobile/features/pet/persistence";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import { clearBackHandlers, handleBack } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";
import { THEME_STORAGE_KEY } from "@/shared/lib/local-storage";
import { MorePage } from "./more-page";

vi.mock("@/mobile/features/pet/tauri-pet-storage", () => ({
  createTauriPetStorage: () => ({
    load: async () => ({ raw: null }),
    save: async () => undefined,
    clear: async () => undefined,
  }),
}));

beforeEach(() => {
  clearBackHandlers();
  localStorage.clear();
  useUiStore.setState({ view: "settings", scanOpen: false, offlineReturnView: "pet" });
  useConnectionStore.setState({ status: "connected", addr: "192.168.1.5:47810" });
  usePetStore.setState({
    pet: defaultPetState(Date.now()),
    hydrated: true,
    saveStatus: "idle",
    bubble: null,
  });
  document.documentElement.dataset.theme = "dark";
});

afterEach(() => {
  cleanup();
  clearBackHandlers();
});

function pressBack(): boolean {
  let handled = false;
  act(() => {
    handled = handleBack();
  });
  return handled;
}

describe("MorePage 结构", () => {
  it("分组顺序：连接/外观/反馈/显示/数据与关于/消息通道，且不再有名字", () => {
    render(<MorePage />);

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["连接", "外观", "反馈", "显示", "数据与关于", "消息通道"]);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/改名|昵称|自定义名字/)).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByText(/Sidekick 0\.1\.0/)).toBeInTheDocument();
  });

  it("是整页而不是弹层（没有 dialog/modal 角色）", () => {
    const { container } = render(<MorePage />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(container.querySelector("section[aria-label='更多']")).not.toBeNull();
  });
});

describe("MorePage 设置项", () => {
  it("连接组点按打开连接页", () => {
    render(<MorePage />);

    fireEvent.click(screen.getByRole("button", { name: /连接状态：已连接/ }));
    expect(useUiStore.getState().view).toBe("offline");
  });

  it("外观三选一即时生效并只写本机", () => {
    render(<MorePage />);

    fireEvent.click(screen.getByRole("button", { name: "深色" }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("反馈：震动 / AI 音效开关写入宠物设置", async () => {
    render(<MorePage />);

    fireEvent.click(screen.getByRole("switch", { name: "震动" }));
    await waitFor(() => expect(usePetStore.getState().pet.settings.haptics).toBe(false));

    fireEvent.click(screen.getByRole("switch", { name: "AI 音效" }));
    // 默认音效关闭（D 默认），点一次变 true。
    await waitFor(() => expect(usePetStore.getState().pet.settings.sound).toBe(true));
  });

  it("反馈：三个试听按钮可点且不抛错", () => {
    render(<MorePage />);

    for (const name of ["开工", "提问", "完成"]) {
      expect(() => fireEvent.click(screen.getByRole("button", { name }))).not.toThrow();
    }
  });

  it("显示：屏幕常亮关闭后隐藏最长时长选项", async () => {
    render(<MorePage />);

    expect(screen.getByText("最长常亮 · KEEP AWAKE")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "屏幕常亮" }));
    await waitFor(() => expect(usePetStore.getState().pet.settings.keepAwake).toBe(false));
    expect(screen.queryByText("最长常亮 · KEEP AWAKE")).toBeNull();
  });

  it("显示：最长时长与变暗等待可调", async () => {
    render(<MorePage />);

    fireEvent.click(screen.getByRole("button", { name: "4 小时" }));
    await waitFor(() => expect(usePetStore.getState().pet.settings.keepAwakeHours).toBe(4));

    fireEvent.click(screen.getByRole("button", { name: "10 分钟" }));
    await waitFor(() => expect(usePetStore.getState().pet.settings.dimMinutes).toBe(10));
  });
});

describe("MorePage 重置与消息通道", () => {
  it("重置确认：先展开确认，再点才重置；返回键先收起确认", async () => {
    render(<MorePage />);

    fireEvent.click(screen.getByRole("button", { name: "重置宠物" }));
    expect(screen.getByText("要重置宠物吗？")).toBeInTheDocument();
    expect(pressBack()).toBe(true);
    expect(screen.queryByText("要重置宠物吗？")).not.toBeInTheDocument();
    expect(useUiStore.getState().view).toBe("settings");

    fireEvent.click(screen.getByRole("button", { name: "重置宠物" }));
    fireEvent.click(screen.getByRole("button", { name: "重置" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("要重置宠物吗？")).not.toBeInTheDocument();
  });

  it("消息通道打开聊天页", () => {
    render(<MorePage />);

    fireEvent.click(screen.getByRole("button", { name: /消息通道/ }));
    expect(useUiStore.getState().view).toBe("chat");
  });
});
