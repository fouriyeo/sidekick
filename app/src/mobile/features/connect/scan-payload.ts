/**
 * 解析电脑端二维码里的连接地址与配对码。
 *
 * 桌面端二维码内容是 `http://<ip>:<port>/?pair=<6 位码>`。手机扫码后：
 * - `addr` 交给 `connect_server`（`ip:端口`）；
 * - `pairCode` 只在首次配对/重新配对时带上，配对成功后会换成长期 token。
 *
 * 只接受 IPv4 字面量：桌面端 `pick_lan_ip` 只会选 IPv4，接受域名会让扫到任意二维码都发起连接。
 * path 忽略；`pair` 必须是 6 位数字，否则整张二维码按无效处理，避免把坏码当普通连接。
 */

/** 与 Rust `mobile_client::DEFAULT_PORT` 保持一致。 */
export const SCAN_DEFAULT_PORT = 47810;

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);
const BARE_ADDRESS = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/;
const PAIR_CODE = /^\d{6}$/;

export type ScanPayload = {
  addr: string;
  /** 首次配对码；已配对/普通地址二维码为 null。 */
  pairCode: string | null;
};

function isIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    return Number(part) <= 255;
  });
}

/** 空端口用默认值；非法端口返回 null。 */
function resolvePort(raw: string | null | undefined): number | null {
  if (!raw) return SCAN_DEFAULT_PORT;
  if (!/^\d{1,5}$/.test(raw)) return null;
  const port = Number(raw);
  return port >= 1 && port <= 65535 ? port : null;
}

/** 从二维码文本解析电脑地址与一次性配对码；不可识别时返回 null。 */
export function parseScanPayload(text: string): ScanPayload | null {
  const raw = text.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (SUPPORTED_PROTOCOLS.has(url.protocol) && isIpv4(url.hostname)) {
      const port = resolvePort(url.port);
      if (port === null) return null;
      const pair = url.searchParams.get("pair");
      if (pair !== null && !PAIR_CODE.test(pair)) return null;
      return { addr: `${url.hostname}:${port}`, pairCode: pair };
    }
  } catch {
    // 不是合法 URL，继续按裸地址尝试。
  }

  const bare = BARE_ADDRESS.exec(raw);
  if (!bare) return null;

  const host = bare[1];
  if (!isIpv4(host)) return null;

  const port = resolvePort(bare[2]);
  if (port === null) return null;
  return { addr: `${host}:${port}`, pairCode: null };
}
