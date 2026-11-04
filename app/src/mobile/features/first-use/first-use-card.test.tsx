import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useUiStore } from "@/mobile/ui-store";
import { FIRST_USE_KEY } from "@/shared/lib/local-storage";
import { FirstUseCard } from "./first-use-card";
import { useFirstUseStore } from "./store";

beforeEach(() => {
  localStorage.clear();
  useUiStore.setState({ view: "pet", scanOpen: false, offlineReturnView: "pet" });
  useConnectionStore.setState({ status: "connected" });
  useFirstUseStore.setState({ micReady: false, dismissed: false, hydrated: false });
});

afterEach(() => {
  cleanup();
});

describe("FirstUseCard 首用清单", () => {
  it("连接完成 = 1/4，麦克风完成 = 2/4；后两步永远不是「已完成」", () => {
    render(<FirstUseCard />);
    expect(screen.getByText(/1\/4/)).toBeInTheDocument();
    expect(screen.getByText(/还差 3 步 · 当前：允许麦克风权限/)).toBeInTheDocument();

    cleanup();
    useFirstUseStore.setState({ micReady: true, hydrated: true });
    render(<FirstUseCard />);
    expect(screen.getByText(/2\/4/)).toBeInTheDocument();
    expect(screen.getByText(/当前：在电脑上完成剩余两步/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /首用清单，已完成 2\/4/ }));
    expect(screen.getAllByText("已完成")).toHaveLength(2);
    expect(screen.getAllByText("在电脑上完成")).toHaveLength(2);
    expect(screen.queryByText("在电脑上配置百炼语音")?.parentElement?.textContent).toBe(
      "在电脑上配置百炼语音在电脑上完成",
    );
  });

  it("未连接时当前步骤是连接电脑，展开给「去连接」", () => {
    useConnectionStore.setState({ status: "disconnected" });
    render(<FirstUseCard />);

    expect(screen.getByText(/0\/4/)).toBeInTheDocument();
    expect(screen.getByText(/当前：连接电脑/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /首用清单，已完成 0\/4/ }));
    fireEvent.click(screen.getByRole("button", { name: "去连接" }));
    expect(useUiStore.getState().view).toBe("offline");
  });

  it("可收起并持久化，重启后不再显示", () => {
    render(<FirstUseCard />);
    fireEvent.click(screen.getByRole("button", { name: "收起首用清单" }));

    expect(useFirstUseStore.getState().dismissed).toBe(true);
    expect(JSON.parse(localStorage.getItem(FIRST_USE_KEY) ?? "{}").dismissed).toBe(true);

    cleanup();
    useFirstUseStore.setState({ hydrated: false, dismissed: false, micReady: false });
    render(<FirstUseCard />);
    expect(screen.queryByText("首用清单")).not.toBeInTheDocument();
    expect(useFirstUseStore.getState().dismissed).toBe(true);
  });
});
