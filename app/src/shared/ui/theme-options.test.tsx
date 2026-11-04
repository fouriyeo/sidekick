import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeOptions } from "./theme-options";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("ThemeOptions", () => {
  it("defaults to system and switches theme", () => {
    render(<ThemeOptions />);

    expect(screen.getByRole("button", { name: "跟随系统" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "浅色" }));

    expect(screen.getByRole("button", { name: "浅色" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("sidekick:theme")).toBe("light");
  });
});
