import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBackHandlers, handleBack } from "@/mobile/system-back";
import { PetSettings } from "./pet-settings";

beforeEach(() => {
  clearBackHandlers();
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

describe("PetSettings Android 返回键", () => {
  it("打开后消费返回键并关闭设置页", () => {
    const onClose = vi.fn();
    render(<PetSettings open onClose={onClose} />);

    expect(pressBack()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("重置确认中先收起确认，再按才关闭设置页", () => {
    const onClose = vi.fn();
    render(<PetSettings open onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /重置宠物/ }));
    expect(screen.getByText("要让我重新认识你吗？")).toBeInTheDocument();

    expect(pressBack()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("要让我重新认识你吗？")).not.toBeInTheDocument();

    expect(pressBack()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("关闭后不再消费返回键，交给根页面处理退出确认", () => {
    const { rerender } = render(<PetSettings open onClose={vi.fn()} />);

    rerender(<PetSettings open={false} onClose={vi.fn()} />);

    expect(pressBack()).toBe(false);
  });
});

describe("PetSettings 触摸互动", () => {
  it("不再提供摸摸/戳的无障碍替代按钮", () => {
    render(<PetSettings open onClose={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "摸摸它" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "戳一下" })).not.toBeInTheDocument();
    expect(screen.queryByText("无障碍互动")).not.toBeInTheDocument();
  });
});

describe("PetSettings 声音设置", () => {
  it("提供声音开关、三个试听按钮和限制说明", () => {
    render(<PetSettings open onClose={vi.fn()} />);

    expect(screen.getByRole("switch", { name: "声音" })).toBeInTheDocument();
    for (const name of ["开工", "提问", "完成"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/只在宠物页前台播放/)).toBeInTheDocument();
    expect(screen.getByText(/录音时不响/)).toBeInTheDocument();
  });

  it("点击试听按钮不会抛错（无 Web Audio 时静默降级）", () => {
    render(<PetSettings open onClose={vi.fn()} />);

    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: "开工" }));
      fireEvent.click(screen.getByRole("button", { name: "提问" }));
      fireEvent.click(screen.getByRole("button", { name: "完成" }));
    }).not.toThrow();
  });
});
