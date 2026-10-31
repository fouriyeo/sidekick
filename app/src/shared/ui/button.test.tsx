import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { cn } from "@/shared/lib/utils";
import { Button } from "./button";

test("Button renders its label", () => {
  render(<Button>Hello</Button>);

  expect(screen.getByRole("button", { name: "Hello" })).toBeInTheDocument();
});

test("cn merges conflicting Tailwind classes", () => {
  expect(cn("px-2", "px-4")).toBe("px-4");
});
