import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignalDot } from "./signal-dot";

describe("SignalDot", () => {
  it("renders a decorative dot without announcing itself", () => {
    const { container } = render(<SignalDot status="connected" />);
    const dot = container.firstElementChild;

    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("bg-signal");
    expect(container.querySelector(".sonar-dot-ring")).not.toBeNull();
  });

  it("does not pulse when disconnected", () => {
    const { container } = render(<SignalDot status="waiting" />);

    expect(container.querySelector(".sonar-dot-ring")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
