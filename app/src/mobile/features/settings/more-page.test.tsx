import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useFirstUseStore } from "@/mobile/features/first-use/store";
import { defaultPetState } from "@/mobile/features/pet/persistence";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import { clearBackHandlers, handleBack } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";
import { FIRST_USE_KEY, THEME_STORAGE_KEY } from "@/shared/lib/local-storage";
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
  useFirstUseStore.setState({
    hydrated: false,
    micReady: false,
    dismissed: false,
    desktop: null,
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

/** 页面里除根 section（aria-label="更多"）与首用 banner 以外的分组卡。 */
function groupLabels(container: HTMLElement): Array<string | null> {
  return [...container.querySelectorAll("section[aria-label]")]
    .map((element) => element.getAttribute("aria-label"))
    .filter((label) => label !== "更多" && label !== "首用清单");
}

describe("MorePage 二级页结构", () => {
  it("是二级页：17/400 inline 标题 + 返回键，无页内大标题、无底部 tab", () => {
    const { container } = render(<MorePage />);

    const title = screen.getByRole("heading", { level: 1, name: "更多" });
    expect(title.className).toContain("text-[17px]");
    expect(title.className).toContain("font-normal");
    expect(screen.queryByRole("navigation", { name: "主导航" })).toBeNull();
    expect(container.querySelector("section[aria-label='更多']")).not.toBeNull();

    // 页头说明保留一行 13/400，不是 mono 大写英文副标。
    const sub = screen.getByText("设置 · 只影响这台手机");
    expect(sub.className).toContain("text-[13px]");
    expect(sub.className).not.toContain("font-mono");
    expect(sub.className).not.toContain("uppercase");
  });

  it("分组卡顺序：连接/外观/反馈/显示/数据与关于/消息通道（用量不在这里）", () => {
    const { container } = render(<MorePage />);

    expect(groupLabels(container)).toEqual([
      "连接",
      "外观",
      "反馈",
      "显示",
      "数据与关于",
      "消息通道",
    ]);
    expect(screen.queryByText(/^0[1-6]$/)).toBeNull();
    expect(screen.queryByText(/SOUND|MOTION|KEEP AWAKE|DIM/)).toBeNull();
    expect(screen.getByText(/Sidekick 0\.1\.0/)).toBeInTheDocument();
  });

  it("全站 400 字重：页面里不出现 semibold/bold/medium", () => {
    const { container } = render(<MorePage />);
    expect(container.innerHTML).not.toMatch(/font-(semibold|bold|medium)/);
  });

  it("返回键回宠物页", () => {
    render(<MorePage />);

    fireEvent.click(screen.getByRole("button", { name: "返回宠物" }));
    expect(useUiStore.getState().view).toBe("pet");
  });

  it("不再有「用量」入口：v17 起在宠物页顶栏的今日数字里", () => {
    const { container } = render(<MorePage />);

    expect(container.querySelector("section[aria-label='用量']")).toBeNull();
    expect(screen.queryByRole("button", { name: /用量/ })).toBeNull();
    expect(useUiStore.getState().view).toBe("settings");
  });
});

describe("MorePage 首用清单 banner", () => {
  it("一行「首用清单 · 还差 N 步」，点开才展开四步", () => {
    render(<MorePage />);

    expect(screen.getByText(/还差 3 步/)).toBeInTheDocument();
    expect(screen.queryByText("允许麦克风权限")).toBeNull();

    const banner = screen.getByRole("button", { name: /首用清单，已完成 1\/4/ });
    fireEvent.click(banner);
    expect(banner.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("允许麦克风权限")).toBeInTheDocument();
    expect(screen.getAllByText("在电脑上完成")).toHaveLength(2);

    fireEvent.click(banner);
    expect(screen.queryByText("允许麦克风权限")).toBeNull();
  });

  it("返回键先收起展开的清单", () => {
    render(<MorePage />);

    fireEvent.click(screen.getByRole("button", { name: /首用清单，已完成 1\/4/ }));
    expect(pressBack()).toBe(true);
    expect(screen.queryByText("允许麦克风权限")).toBeNull();
  });

  it("麦克风已用过时还差 2 步；已收起时整条 banner 不渲染", () => {
    localStorage.setItem(FIRST_USE_KEY, JSON.stringify({ micReady: true, dismissed: false }));
    const first = render(<MorePage />);
    expect(screen.getByText(/还差 2 步/)).toBeInTheDocument();
    first.unmount();

    localStorage.setItem(FIRST_USE_KEY, JSON.stringify({ micReady: true, dismissed: true }));
    useFirstUseStore.setState({
      hydrated: false,
      micReady: false,
      dismissed: false,
      desktop: null,
    });
    render(<MorePage />);
    expect(screen.queryByText(/首用清单/)).toBeNull();
  });

  it("desktop 未知（旧桌面）：保持 2 个「在电脑上完成」", () => {
    useFirstUseStore.setState({ hydrated: true, micReady: true, desktop: null });
    render(<MorePage />);

    expect(screen.getByText(/还差 2 步/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /首用清单，已完成 2\/4/ }));
    expect(screen.getAllByText("在电脑上完成")).toHaveLength(2);
  });

  it("电脑侧全部真实完成：banner「已完成」，四步都是「已完成」", () => {
    useFirstUseStore.setState({
      hydrated: true,
      micReady: true,
      desktop: { asrConfigured: true, asrHasKey: true, accessibilityTrusted: true, at: 1 },
    });
    render(<MorePage />);

    expect(screen.queryByText(/还差/)).toBeNull();
    // banner 文案是「首用清单」+「 · 已完成」两段文本，按按钮整体文本断言。
    const banner = screen.getByRole("button", { name: /首用清单，已完成 4\/4/ });
    expect(banner.textContent).toContain("首用清单 · 已完成");

    fireEvent.click(banner);
    expect(screen.getAllByText("已完成")).toHaveLength(4);
    expect(screen.queryByText("在电脑上完成")).toBeNull();
    expect(
      screen.getByText("电脑已保存百炼 Key，并已通过配置检查；录音只发往电脑配置的百炼。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("电脑已授权；转写完会自动输入，结果卡有「回车 / 清空」。"),
    ).toBeInTheDocument();
  });

  it("百炼已配置但辅助功能未授权：已完成 3/4、还差 1 步、只剩 1 个「在电脑上完成」", () => {
    useFirstUseStore.setState({
      hydrated: true,
      micReady: true,
      desktop: { asrConfigured: true, asrHasKey: true, accessibilityTrusted: false, at: 2 },
    });
    render(<MorePage />);

    expect(screen.getByText(/还差 1 步/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /首用清单，已完成 3\/4/ }));
    expect(screen.getAllByText("已完成")).toHaveLength(3);
    expect(screen.getAllByText("在电脑上完成")).toHaveLength(1);
    expect(
      screen.getByText("还没授权；不开只会复制到剪贴板，没有「回车 / 清空」，也不会自动输入。"),
    ).toBeInTheDocument();
  });

  it("电脑已保存 Key 但配置不完整：仍算未完成并提示缺什么", () => {
    useFirstUseStore.setState({
      hydrated: true,
      desktop: { asrConfigured: false, asrHasKey: true, accessibilityTrusted: false, at: 3 },
    });
    render(<MorePage />);

    fireEvent.click(screen.getByRole("button", { name: /首用清单，已完成 1\/4/ }));
    expect(
      screen.getByText("电脑已保存 Key，但配置还不完整（同意上传 / 地址或模型）。"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("在电脑上完成")).toHaveLength(2);
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

    const themeGroup = screen.getByRole("group", { name: "外观" });
    fireEvent.click(within(themeGroup).getByRole("button", { name: "深色" }));
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

  it("反馈：减少动效三选一写入宠物设置", async () => {
    render(<MorePage />);

    const group = screen.getByRole("group", { name: "减少动效" });
    fireEvent.click(within(group).getByRole("button", { name: "开启" }));
    await waitFor(() => expect(usePetStore.getState().pet.settings.reduceMotion).toBe("on"));

    fireEvent.click(within(group).getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(usePetStore.getState().pet.settings.reduceMotion).toBe("off"));
  });

  it("显示：屏幕常亮关闭后隐藏最长时长选项", async () => {
    render(<MorePage />);

    expect(screen.getByRole("group", { name: "最长常亮" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "屏幕常亮" }));
    await waitFor(() => expect(usePetStore.getState().pet.settings.keepAwake).toBe(false));
    expect(screen.queryByRole("group", { name: "最长常亮" })).toBeNull();
  });

  it("显示：最长时长与变暗等待可调", async () => {
    render(<MorePage />);

    fireEvent.click(screen.getByRole("button", { name: "4 小时" }));
    await waitFor(() => expect(usePetStore.getState().pet.settings.keepAwakeHours).toBe(4));

    const dimGroup = screen.getByRole("group", { name: "无操作自动变暗" });
    fireEvent.click(within(dimGroup).getByRole("button", { name: "10 分钟" }));
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
