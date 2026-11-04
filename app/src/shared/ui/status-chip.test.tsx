import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { StatusChip } from "./status-chip";

test("StatusChip shows label, detail and signal bars", () => {
  const { container } = render(
    <StatusChip label="已连接" detail="· 1 台设备" level={3} tone="signal" />,
  );
  expect(screen.getByText("已连接")).toBeInTheDocument();
  expect(screen.getByText("· 1 台设备")).toBeInTheDocument();
  expect(container.querySelector("[data-signal-bars='3']")).not.toBeNull();
});

test("StatusChip is a button when clickable", () => {
  const onClick = vi.fn();
  render(<StatusChip label="等你决定" level={1} tone="decide" onClick={onClick} />);
  const button = screen.getByRole("button", { name: "等你决定" });
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);
});

test("StatusChip keeps text when not clickable", () => {
  render(<StatusChip label="工作中" level={2} tone="signal" />);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("工作中")).toBeInTheDocument();
});
