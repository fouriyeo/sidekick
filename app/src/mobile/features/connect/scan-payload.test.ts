import { describe, expect, it } from "vitest";
import { parseScanPayload, SCAN_DEFAULT_PORT } from "./scan-payload";

describe("parseScanPayload", () => {
  // 桌面端二维码的实际内容形态
  it("解析桌面二维码的 http 地址", () => {
    expect(parseScanPayload("http://192.168.1.5:47810")).toBe("192.168.1.5:47810");
    expect(parseScanPayload("http://30.166.162.215:47810")).toBe("30.166.162.215:47810");
  });

  it("忽略尾部斜杠与 path", () => {
    expect(parseScanPayload("http://192.168.1.5:47810/")).toBe("192.168.1.5:47810");
    expect(parseScanPayload("http://192.168.1.5:47810/index.html")).toBe("192.168.1.5:47810");
  });

  it("忽略 query（为将来带配对 token 的二维码留余地）", () => {
    expect(parseScanPayload("http://192.168.1.5:47810/?t=abc123")).toBe("192.168.1.5:47810");
  });

  it("缺少端口时用默认端口", () => {
    expect(parseScanPayload("http://192.168.1.5")).toBe(`192.168.1.5:${SCAN_DEFAULT_PORT}`);
    expect(parseScanPayload("192.168.1.5")).toBe(`192.168.1.5:${SCAN_DEFAULT_PORT}`);
  });

  it("支持 https / ws / wss", () => {
    expect(parseScanPayload("https://192.168.1.5:47811")).toBe("192.168.1.5:47811");
    expect(parseScanPayload("ws://192.168.1.5:47810/ws")).toBe("192.168.1.5:47810");
    expect(parseScanPayload("wss://192.168.1.5:47812")).toBe("192.168.1.5:47812");
  });

  it("接受裸地址", () => {
    expect(parseScanPayload("192.168.1.5:47810")).toBe("192.168.1.5:47810");
    expect(parseScanPayload("  192.168.1.5:47810  ")).toBe("192.168.1.5:47810");
  });

  it("拒绝非 IPv4 主机（避免扫到任意二维码就去连域名）", () => {
    expect(parseScanPayload("https://example.com:47810")).toBeNull();
    expect(parseScanPayload("http://localhost:47810")).toBeNull();
    expect(parseScanPayload("example.com:47810")).toBeNull();
  });

  it("拒绝非法 IP", () => {
    expect(parseScanPayload("192.168.1.256:47810")).toBeNull();
    expect(parseScanPayload("300.1.1.1:47810")).toBeNull();
    expect(parseScanPayload("192.168.1:47810")).toBeNull();
  });

  it("拒绝非法端口", () => {
    expect(parseScanPayload("192.168.1.5:0")).toBeNull();
    expect(parseScanPayload("192.168.1.5:65536")).toBeNull();
    expect(parseScanPayload("http://192.168.1.5:99999")).toBeNull();
  });

  it("拒绝不支持的协议", () => {
    expect(parseScanPayload("ftp://192.168.1.5:21")).toBeNull();
    expect(parseScanPayload("javascript:alert(1)")).toBeNull();
  });

  it("拒绝空值与无关文本", () => {
    expect(parseScanPayload("")).toBeNull();
    expect(parseScanPayload("   ")).toBeNull();
    expect(parseScanPayload("这不是一个二维码")).toBeNull();
    expect(parseScanPayload(`http://192.168.1.5:47810/${"a".repeat(500)}`)).toBe(
      "192.168.1.5:47810",
    );
  });
});
