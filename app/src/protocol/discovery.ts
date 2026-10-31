export type DiscoveredServer = {
  /** 电脑名（主机名），用于多台设备时区分。 */
  name: string;
  ip: string;
  port: number;
  /** 可直接传给 connect_server 的地址，形如 "192.168.1.5:47810"。 */
  addr: string;
};

/**
 * 校验 Rust `discover_servers` 返回的单条设备信息。
 * 广播包来自局域网，必须当作不可信输入过滤。
 */
export function isDiscoveredServer(value: unknown): value is DiscoveredServer {
  if (typeof value !== "object" || value === null) return false;
  const server = value as Record<string, unknown>;
  return (
    typeof server.name === "string" &&
    typeof server.ip === "string" &&
    server.ip.length > 0 &&
    typeof server.port === "number" &&
    Number.isInteger(server.port) &&
    server.port > 0 &&
    server.port <= 65535 &&
    typeof server.addr === "string" &&
    server.addr.length > 0
  );
}
