import { describe, expect, it } from "vitest";
import { isDiscoveredServer } from "./discovery";

describe("isDiscoveredServer", () => {
  it("accepts a complete device payload", () => {
    expect(
      isDiscoveredServer({
        name: "开发者的 MacBook",
        ip: "192.168.1.5",
        port: 47810,
        addr: "192.168.1.5:47810",
      }),
    ).toBe(true);
  });

  it("rejects non-object payloads", () => {
    expect(isDiscoveredServer(null)).toBe(false);
    expect(isDiscoveredServer(undefined)).toBe(false);
    expect(isDiscoveredServer("192.168.1.5:47810")).toBe(false);
    expect(isDiscoveredServer([{ name: "x" }])).toBe(false);
  });

  it("rejects payloads with missing or mistyped fields", () => {
    expect(isDiscoveredServer({ ip: "192.168.1.5", port: 47810, addr: "192.168.1.5:47810" })).toBe(
      false,
    );
    expect(isDiscoveredServer({ name: "Mac", ip: 1, port: 47810, addr: "192.168.1.5:47810" })).toBe(
      false,
    );
    expect(isDiscoveredServer({ name: "Mac", ip: "192.168.1.5", port: "47810", addr: "a" })).toBe(
      false,
    );
    expect(isDiscoveredServer({ name: "Mac", ip: "192.168.1.5", port: 47810 })).toBe(false);
  });

  it("rejects empty addresses and out-of-range ports", () => {
    expect(
      isDiscoveredServer({ name: "Mac", ip: "", port: 47810, addr: "192.168.1.5:47810" }),
    ).toBe(false);
    expect(isDiscoveredServer({ name: "Mac", ip: "192.168.1.5", port: 47810, addr: "" })).toBe(
      false,
    );
    expect(isDiscoveredServer({ name: "Mac", ip: "192.168.1.5", port: 0, addr: "a" })).toBe(false);
    expect(isDiscoveredServer({ name: "Mac", ip: "192.168.1.5", port: 70000, addr: "a" })).toBe(
      false,
    );
    expect(isDiscoveredServer({ name: "Mac", ip: "192.168.1.5", port: 1.5, addr: "a" })).toBe(
      false,
    );
  });
});
