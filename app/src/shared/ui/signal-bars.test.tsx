import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { SignalBars } from "./signal-bars";

test("SignalBars renders three bars and marks active ones", () => {
  const { container } = render(<SignalBars level={2} tone="signal" />);
  const bars = container.querySelectorAll("[data-signal-bars] > span");
  expect(bars).toHaveLength(3);
  expect(bars[0].className).toContain("opacity-100");
  expect(bars[1].className).toContain("opacity-100");
  expect(bars[2].className).toContain("opacity-25");
  expect(container.querySelector("[data-signal-bars]")?.className).toContain("text-signal");
});

test("SignalBars is decoration only", () => {
  const { container } = render(<SignalBars level={3} tone="decide" />);
  expect(container.querySelector("[data-signal-bars]")).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelector("[data-signal-bars]")?.className).toContain("text-decide");
});
