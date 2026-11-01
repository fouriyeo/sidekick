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
