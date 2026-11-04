import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setThemePreference } from "@/shared/lib/theme";
import { ThemeOptions } from "./theme-options";

beforeEach(() => {
  localStorage.clear();
  setThemePreference("dark");
});

afterEach(() => {
  localStorage.clear();
});

describe("ThemeOptions", () => {
  it("marks the current preference and switches theme", () => {
    render(<ThemeOptions />);

    expect(screen.getByRole("button", { name: "深色" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "浅色" }));

    expect(screen.getByRole("button", { name: "浅色" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("sidekick:theme")).toBe("light");
  });
});
