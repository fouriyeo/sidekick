import { describe, expect, it } from "vitest";
import { parseScanPayload, SCAN_DEFAULT_PORT } from "./scan-payload";

/** 只关心地址的旧断言。 */
function addr(text: string) {
  return parseScanPayload(text)?.addr ?? null;
}

describe("parseScanPayload", () => {
  // 桌面端二维码的实际内容形态
  it("解析桌面二维码的 http 地址", () => {
    expect(addr("http://192.168.1.5:47810")).toBe("192.168.1.5:47810");
    expect(addr("http://30.166.162.215:47810")).toBe("30.166.162.215:47810");
  });

  it("忽略尾部斜杠与 path", () => {
    expect(addr("http://192.168.1.5:47810/")).toBe("192.168.1.5:47810");
    expect(addr("http://192.168.1.5:47810/index.html")).toBe("192.168.1.5:47810");
  });

  it("忽略 query（为将来带配对 token 的二维码留余地）", () => {
    expect(addr("http://192.168.1.5:47810/?t=abc123")).toBe("192.168.1.5:47810");
  });

  it("缺少端口时用默认端口", () => {
    expect(addr("http://192.168.1.5")).toBe(`192.168.1.5:${SCAN_DEFAULT_PORT}`);
    expect(addr("192.168.1.5")).toBe(`192.168.1.5:${SCAN_DEFAULT_PORT}`);
  });

  it("支持 https / ws / wss", () => {
    expect(addr("https://192.168.1.5:47811")).toBe("192.168.1.5:47811");
    expect(addr("ws://192.168.1.5:47810/ws")).toBe("192.168.1.5:47810");
    expect(addr("wss://192.168.1.5:47812")).toBe("192.168.1.5:47812");
  });

  it("接受裸地址", () => {
    expect(addr("192.168.1.5:47810")).toBe("192.168.1.5:47810");
    expect(addr("  192.168.1.5:47810  ")).toBe("192.168.1.5:47810");
  });

  it("拒绝非 IPv4 主机（避免扫到任意二维码就去连域名）", () => {
    expect(addr("https://example.com:47810")).toBeNull();
    expect(addr("http://localhost:47810")).toBeNull();
    expect(addr("example.com:47810")).toBeNull();
  });

  it("拒绝非法 IP", () => {
    expect(addr("192.168.1.256:47810")).toBeNull();
    expect(addr("300.1.1.1:47810")).toBeNull();
    expect(addr("192.168.1:47810")).toBeNull();
  });

  it("拒绝非法端口", () => {
    expect(addr("192.168.1.5:0")).toBeNull();
    expect(addr("192.168.1.5:65536")).toBeNull();
    expect(addr("http://192.168.1.5:99999")).toBeNull();
  });

  it("拒绝不支持的协议", () => {
    expect(addr("ftp://192.168.1.5:21")).toBeNull();
    expect(addr("javascript:alert(1)")).toBeNull();
  });

  it("解析二维码里的 6 位配对码", () => {
    expect(parseScanPayload("http://192.168.1.5:47810/?pair=123456")).toEqual({
      addr: "192.168.1.5:47810",
      pairCode: "123456",
    });
    expect(addr("http://192.168.1.5:47810/?pair=123456")).toBe("192.168.1.5:47810");
    expect(addr("http://192.168.1.5:47810/?t=abc123")).toBe("192.168.1.5:47810");
  });

  it("配对码不是 6 位数字时整张二维码按无效处理", () => {
    expect(parseScanPayload("http://192.168.1.5:47810/?pair=12345")).toBeNull();
    expect(parseScanPayload("http://192.168.1.5:47810/?pair=abcdef")).toBeNull();
  });

  it("拒绝空值与无关文本", () => {
    expect(addr("")).toBeNull();
    expect(addr("   ")).toBeNull();
    expect(addr("这不是一个二维码")).toBeNull();
    expect(addr(`http://192.168.1.5:47810/${"a".repeat(500)}`)).toBe("192.168.1.5:47810");
  });
});
