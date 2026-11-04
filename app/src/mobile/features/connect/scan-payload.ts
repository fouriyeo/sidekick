/**
 * 解析电脑端二维码里的连接地址。
 *
 * 桌面端的二维码内容是 `http://<ip>:<port>`（见 `desktop_server.rs` 的 `server_info`），
 * 手机 App 扫码后要用 `connect_server` 的 `ip:端口` 形式连过去，这里负责两者之间的转换。
 *
 * 只接受 IPv4 字面量：桌面端 `pick_lan_ip` 只会选 IPv4，接受域名会让扫到任意二维码都发起连接。
 * path / query 一律忽略——将来二维码带配对 token 时也能继续用。
 */

/** 与 Rust `mobile_client::DEFAULT_PORT` 保持一致。 */
export const SCAN_DEFAULT_PORT = 47810;

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);
const BARE_ADDRESS = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/;

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

/** 从二维码文本解析电脑地址（`ip:端口`）；不可识别时返回 null。 */
export function parseScanPayload(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (SUPPORTED_PROTOCOLS.has(url.protocol) && isIpv4(url.hostname)) {
      const port = resolvePort(url.port);
      return port === null ? null : `${url.hostname}:${port}`;
    }
  } catch {
    // 不是合法 URL，继续按裸地址尝试。
  }

  const bare = BARE_ADDRESS.exec(raw);
  if (!bare) return null;

  const host = bare[1];
  if (!isIpv4(host)) return null;

  const port = resolvePort(bare[2]);
  return port === null ? null : `${host}:${port}`;
}
