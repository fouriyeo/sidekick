//! 局域网 UDP 自动发现协议（纯标准库，无第三方依赖）。
//!
//! 手机广播探测
//! `{"sk":"sidekick.discover","v":1,"id":"<hex>"}` 到 `255.255.255.255:47820`，
//! 桌面响应器校验后单播回
//! `{"sk":"sidekick","v":1,"id":"<回显>","name":"<主机名>","port":<真实端口>}`。
//! 手机只用 UDP **源 IP** + 报文里的 `port` 拼连接地址，报文内的 IP 一律忽略。
//!
//! cfg 约定：
//! - `desktop`：UDP 响应器（[`spawn_responder`]）；
//! - `mobile`：扫描（[`scan_once`]）与 `discover_servers` 命令；
//! - 宿主 `cargo test`：两侧代码都编译，方便单元/集成测试。

use std::net::SocketAddr;
use std::time::Duration;

use serde::Deserialize;
#[cfg(any(mobile, test))]
use serde::Serialize;
#[cfg(any(mobile, test))]
use std::net::IpAddr;

/// 桌面 HTTP/WS 服务的候选端口，按顺序 bind，第一个成功者生效。
#[cfg(any(desktop, test))]
pub const SERVICE_PORTS: [u16; 6] = [47810, 47811, 47812, 47813, 47814, 8848];

/// UDP 发现的固定端口（桌面响应器监听、手机探测目标）。
pub const DISCOVERY_PORT: u16 = 47820;

/// 探测报文的 `sk`。
pub const PROBE_MAGIC: &str = "sidekick.discover";
/// 响应报文的 `sk`。
pub const REPLY_MAGIC: &str = "sidekick";
/// 当前协议版本，不匹配的报文直接丢弃。
pub const PROTOCOL_VERSION: u8 = 1;

/// 一次发现最多返回的电脑数量。
#[cfg(any(mobile, test))]
pub const MAX_SERVERS: usize = 8;
/// 电脑名最多保留的字符数。
pub const MAX_NAME_CHARS: usize = 32;
/// 取不到主机名或主机名清洗后为空时的兜底显示名。
pub const DEFAULT_NAME: &str = "我的电脑";

/// 手机一次扫描的总窗口。
#[cfg(any(mobile, test))]
pub const SCAN_TIMEOUT: Duration = Duration::from_millis(1500);

/// 探测包的发送时间点（相对扫描开始，毫秒）。
#[cfg(any(mobile, test))]
const PROBE_SEND_OFFSETS_MS: [u64; 3] = [0, 400, 800];

/// 扫描时单次 `recv` 的阻塞上限，同时也是回包轮询粒度。
#[cfg(any(mobile, test))]
const RECV_POLL_INTERVAL: Duration = Duration::from_millis(100);

/// 发现到的一台电脑，即 `discover_servers` 的返回元素。
#[cfg(any(mobile, test))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DiscoveredServer {
    /// 电脑短主机名（已清洗，非空）。
    pub name: String,
    /// UDP 源 IP（不是报文里的自述 IP）。
    pub ip: String,
    /// 桌面服务真实端口。
    pub port: u16,
    /// 可直接传给 `connect_server` 的地址，形如 `192.168.1.5:47810`。
    pub addr: String,
}

/// 清洗电脑名：控制字符/空白压成单行，截断到 [`MAX_NAME_CHARS`] 字符，
/// 清洗后为空则回退 [`DEFAULT_NAME`]。
pub fn sanitize_name(raw: &str) -> String {
    let mut single_line = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if ch.is_control() || ch.is_whitespace() {
            if !single_line.is_empty() && !single_line.ends_with(' ') {
                single_line.push(' ');
            }
        } else {
            single_line.push(ch);
        }
    }

    let trimmed = single_line.trim();
    let truncated = trimmed.chars().take(MAX_NAME_CHARS).collect::<String>();
    let name = truncated.trim_end();
    if name.is_empty() {
        DEFAULT_NAME.to_string()
    } else {
        name.to_string()
    }
}

/// 生成探测报文（手机侧）。
#[cfg(any(mobile, test))]
pub fn probe_payload(id: &str) -> String {
    serde_json::json!({
        "sk": PROBE_MAGIC,
        "v": PROTOCOL_VERSION,
        "id": id,
    })
    .to_string()
}

/// 生成响应报文（桌面侧）。
#[cfg(any(desktop, test))]
pub fn reply_payload(id: &str, name: &str, port: u16) -> String {
    serde_json::json!({
        "sk": REPLY_MAGIC,
        "v": PROTOCOL_VERSION,
        "id": id,
        "name": name,
        "port": port,
    })
    .to_string()
}

#[cfg(any(desktop, test))]
#[derive(Deserialize)]
struct ProbePayload {
    sk: String,
    v: u8,
    id: String,
}

/// 校验探测报文，返回需要回显的 `id`；不是合法探测包时返回 `None`。
#[cfg(any(desktop, test))]
pub fn probe_id_from(text: &str) -> Option<String> {
    let probe: ProbePayload = serde_json::from_str(text.trim()).ok()?;
    if probe.sk != PROBE_MAGIC || probe.v != PROTOCOL_VERSION {
        return None;
    }

    let id = probe.id.trim();
    if id.is_empty() || id.len() > 64 {
        return None;
    }
    Some(id.to_string())
}

#[cfg(any(mobile, test))]
#[derive(Deserialize)]
struct ReplyPayload {
    sk: String,
    v: u8,
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    port: u16,
}

#[cfg(any(mobile, test))]
impl ReplyPayload {
    /// 校验 `sk` / `v` / JSON / `port`；报文里多余字段（例如伪造的 `ip`）忽略。
    fn decode(text: &str) -> Option<Self> {
        let reply: ReplyPayload = serde_json::from_str(text.trim()).ok()?;
        if reply.sk != REPLY_MAGIC || reply.v != PROTOCOL_VERSION || reply.port == 0 {
            return None;
        }
        Some(reply)
    }

    fn into_server(self, source_ip: IpAddr) -> DiscoveredServer {
        let ip = source_ip.to_string();
        DiscoveredServer {
            name: sanitize_name(&self.name),
            addr: format!("{ip}:{}", self.port),
            ip,
            port: self.port,
        }
    }
}

/// 解析桌面回包。`source_ip` 是 UDP 源地址，**始终**用它覆盖报文内任何 IP 字段。
#[cfg(any(mobile, test))]
pub fn parse_reply(text: &str, source_ip: IpAddr) -> Option<DiscoveredServer> {
    ReplyPayload::decode(text).map(|reply| reply.into_server(source_ip))
}

/// 回包里的 `id` 是否与本次探测一致（丢弃过期/乱序/伪造回包）。
#[cfg(any(mobile, test))]
fn reply_matches_probe(text: &str, expected_id: &str) -> bool {
    serde_json::from_str::<ReplyPayload>(text.trim())
        .map(|reply| reply.id == expected_id)
        .unwrap_or(false)
}

/// 生成一次扫描用的随机 hex id（不引入随机数依赖）。
#[cfg(any(mobile, test))]
fn probe_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as u64)
        .unwrap_or(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut value =
        nanos ^ seq.wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ (u64::from(std::process::id()) << 32);
    value ^= value >> 33;
    value = value.wrapping_mul(0xFF51_AFD7_ED55_8CCD);
    value ^= value >> 33;
    format!("{value:016x}")
}

/// 扫描一轮局域网（**阻塞**，手机侧放到 `spawn_blocking` 里跑）。
///
/// 在 `0/400/800ms` 各发一次探测到 `target`，每次 `recv` 最多阻塞 100ms，
/// 总耗时不超过 `timeout`。返回按 `ip:port` 去重、按 IP 排序、最多
/// [`MAX_SERVERS`] 台的结果；绑定/发送失败只打日志并返回空/已发现列表。
#[cfg(any(mobile, test))]
pub fn scan_once(target: SocketAddr, timeout: Duration) -> Vec<DiscoveredServer> {
    use std::collections::HashSet;
    use std::time::Instant;

    let mut servers: Vec<DiscoveredServer> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    let socket = match std::net::UdpSocket::bind((std::net::Ipv4Addr::UNSPECIFIED, 0)) {
        Ok(socket) => socket,
        Err(error) => {
            eprintln!("[discovery] 扫描端口绑定失败: {error}");
            return servers;
        }
    };
    let _ = socket.set_broadcast(true);
    let _ = socket.set_read_timeout(Some(RECV_POLL_INTERVAL));

    let id = probe_id();
    let probe = probe_payload(&id);
    let started = Instant::now();
    let mut sent = [false; PROBE_SEND_OFFSETS_MS.len()];
    let mut buffer = [0u8; 2048];

    loop {
        let elapsed = started.elapsed();
        if elapsed >= timeout {
            break;
        }

        let elapsed_ms = elapsed.as_millis() as u64;
        for (index, offset) in PROBE_SEND_OFFSETS_MS.iter().enumerate() {
            if !sent[index] && elapsed_ms >= *offset {
                if let Err(error) = socket.send_to(probe.as_bytes(), target) {
                    eprintln!("[discovery] 发送探测失败: {error}");
                }
                sent[index] = true;
            }
        }

        match socket.recv_from(&mut buffer) {
            Ok((len, peer)) => {
                let text = String::from_utf8_lossy(&buffer[..len]);
                if reply_matches_probe(&text, &id) {
                    if let Some(server) = parse_reply(&text, peer.ip()) {
                        if seen.insert(server.addr.clone()) {
                            servers.push(server);
                        }
                    }
                }
            }
            Err(error) => {
                let timed_out = matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                );
                if !timed_out {
                    eprintln!("[discovery] 读取回包失败: {error}");
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
        }
    }

    // 按 IP（数值序）+ 端口排序，方便前端稳定展示。
    servers.sort_by(|a, b| {
        let ip_a = a.ip.parse::<IpAddr>().ok();
        let ip_b = b.ip.parse::<IpAddr>().ok();
        ip_a.cmp(&ip_b).then_with(|| a.port.cmp(&b.port))
    });
    servers.truncate(MAX_SERVERS);
    println!("[discovery] 扫描结束，发现 {} 台电脑", servers.len());
    servers
}

/// 桌面本机短主机名（带缓存，取不到回退 [`DEFAULT_NAME`]）。
#[cfg(any(desktop, test))]
pub fn hostname() -> String {
    use std::sync::OnceLock;

    static HOSTNAME: OnceLock<String> = OnceLock::new();

    HOSTNAME
        .get_or_init(|| {
            let raw = std::process::Command::new("hostname")
                .output()
                .ok()
                .filter(|output| output.status.success())
                .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
                .or_else(|| std::env::var("HOSTNAME").ok())
                .or_else(|| std::env::var("COMPUTERNAME").ok())
                .unwrap_or_default();
            // macOS 主机名通常带 `.local` 后缀，展示时去掉更像「电脑名」。
            let short = raw
                .strip_suffix(".local")
                .or_else(|| raw.strip_suffix(".localdomain"))
                .unwrap_or(&raw);
            sanitize_name(short)
        })
        .clone()
}

/// 桌面响应器：解析探测并生成回包；不是合法探测包时返回 `None`。
#[cfg(any(desktop, test))]
pub fn reply_for(text: &str, name: &str, bound_port: u16) -> Option<String> {
    let id = probe_id_from(text)?;
    Some(reply_payload(&id, name, bound_port))
}

/// 启动桌面 UDP 响应器，绑 `0.0.0.0:47820`。
///
/// 返回是否绑定成功；绑定失败只打日志（自动发现不可用，`discoveryPort` 为 null）。
#[cfg(desktop)]
pub async fn spawn_responder(bound_port: u16) -> bool {
    let bind = SocketAddr::from(([0, 0, 0, 0], DISCOVERY_PORT));
    let socket = match tokio::net::UdpSocket::bind(bind).await {
        Ok(socket) => socket,
        Err(error) => {
            eprintln!("[discovery] UDP 响应器绑定 {bind} 失败: {error}（自动发现不可用）");
            return false;
        }
    };

    tauri::async_runtime::spawn(async move {
        let mut buffer = [0u8; 2048];
        loop {
            match socket.recv_from(&mut buffer).await {
                Ok((len, peer)) => {
                    let text = String::from_utf8_lossy(&buffer[..len]);
                    let Some(reply) = reply_for(&text, &hostname(), bound_port) else {
                        continue;
                    };
                    if let Err(error) = socket.send_to(reply.as_bytes(), peer).await {
                        eprintln!("[discovery] 回包发送到 {peer} 失败: {error}");
                    }
                }
                Err(error) => {
                    eprintln!("[discovery] 响应器接收失败: {error}");
                    tokio::time::sleep(Duration::from_millis(500)).await;
                }
            }
        }
    });

    true
}

/// 手机端 Tauri 命令：扫描局域网电脑。内部错误只打日志，始终返回数组。
#[cfg(mobile)]
#[tauri::command]
pub async fn discover_servers() -> Vec<DiscoveredServer> {
    let target = SocketAddr::from(([255, 255, 255, 255], DISCOVERY_PORT));
    match tauri::async_runtime::spawn_blocking(move || scan_once(target, SCAN_TIMEOUT)).await {
        Ok(servers) => servers,
        Err(error) => {
            eprintln!("[discovery] 扫描任务失败: {error}");
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, SocketAddr};

    fn local_ip() -> IpAddr {
        IpAddr::V4(Ipv4Addr::new(192, 168, 1, 20))
    }

    #[test]
    fn probe_payload_round_trip() {
        let id = probe_id();
        assert_eq!(id.len(), 16, "id 应为 16 位 hex");
        assert!(id.chars().all(|ch| ch.is_ascii_hexdigit()));

        let text = probe_payload(&id);
        assert_eq!(probe_id_from(&text).as_deref(), Some(id.as_str()));
    }

    #[test]
    fn probe_id_from_ignores_invalid_packets() {
        // 响应包的 magic 不能被当成探测包
        assert!(probe_id_from(&reply_payload("aa", "电脑", 47810)).is_none());
        // 版本不匹配
        assert!(probe_id_from(r#"{"sk":"sidekick.discover","v":2,"id":"aa"}"#).is_none());
        // 坏 JSON / 空 id
        assert!(probe_id_from("not json").is_none());
        assert!(probe_id_from(r#"{"sk":"sidekick.discover","v":1,"id":""}"#).is_none());
        assert!(probe_id_from("{}").is_none());
    }

    #[test]
    fn reply_payload_round_trip_sanitizes_name() {
        let text = reply_payload("6f1c", "  mac\nmini  ", 47812);
        let server = parse_reply(&text, local_ip()).expect("应解析成功");
        assert_eq!(server.name, "mac mini");
        assert_eq!(server.ip, "192.168.1.20");
        assert_eq!(server.port, 47812);
        assert_eq!(server.addr, "192.168.1.20:47812");
    }

    #[test]
    fn parse_reply_uses_udp_source_ip_and_ignores_payload_ip() {
        let text =
            r#"{"sk":"sidekick","v":1,"id":"aa","ip":"10.9.9.9","name":"电脑","port":47810}"#;
        let server = parse_reply(text, local_ip()).expect("应解析成功");
        assert_eq!(server.ip, "192.168.1.20");
        assert_eq!(server.addr, "192.168.1.20:47810");
    }

    #[test]
    fn parse_reply_ignores_invalid_packets() {
        let ip = local_ip();
        // 探测包的 magic 不能被当成响应包
        assert!(parse_reply(&probe_payload("aa"), ip).is_none());
        // 版本不匹配
        assert!(parse_reply(r#"{"sk":"sidekick","v":2,"name":"电脑","port":47810}"#, ip).is_none());
        // 坏 JSON / 空文本
        assert!(parse_reply("", ip).is_none());
        assert!(parse_reply("not json", ip).is_none());
        // 越界端口：0 / 超出 u16
        assert!(
            parse_reply(r#"{"sk":"sidekick","v":1,"name":"电脑","port":0}"#, ip).is_none(),
            "0 端口应拒绝"
        );
        assert!(
            parse_reply(r#"{"sk":"sidekick","v":1,"name":"电脑","port":65536}"#, ip).is_none(),
            "超出 u16 的端口应拒绝"
        );
    }

    #[test]
    fn reply_id_must_match_probe() {
        let text = reply_payload("aa", "电脑", 47810);
        assert!(reply_matches_probe(&text, "aa"));
        assert!(
            !reply_matches_probe(&text, "bb"),
            "过期/伪造 id 的回包应丢弃"
        );
        assert!(!reply_matches_probe("not json", "aa"));
    }

    #[test]
    fn sanitize_name_truncates_and_cleans() {
        // 控制字符 / 换行压成单行空格
        assert_eq!(sanitize_name("  mac \n\t mini  "), "mac mini");
        assert_eq!(sanitize_name("a\u{0}b\u{7f}c"), "a b c");
        // 中文按字符截断（32 个字符，不是 32 字节）
        let long = "电".repeat(40);
        let cleaned = sanitize_name(&long);
        assert_eq!(cleaned.chars().count(), MAX_NAME_CHARS);
        // 全空白 / 空串回退
        assert_eq!(sanitize_name("   "), DEFAULT_NAME);
        assert_eq!(sanitize_name(""), DEFAULT_NAME);
        // 正常名字原样保留
        assert_eq!(sanitize_name("jiangtao 的 MacBook"), "jiangtao 的 MacBook");
    }

    #[test]
    fn reply_for_desktop_responder() {
        let probe = probe_payload("abcd1234");
        let reply = reply_for(&probe, "我的 Mac", 47813).expect("合法探测应回包");
        let server = parse_reply(&reply, IpAddr::V4(Ipv4Addr::LOCALHOST)).expect("回包应可解析");
        assert_eq!(server.name, "我的 Mac");
        assert_eq!(server.port, 47813);
        assert_eq!(server.ip, "127.0.0.1");

        assert!(reply_for("{}", "我的 Mac", 47810).is_none());
        assert!(reply_for("not json", "我的 Mac", 47810).is_none());
    }

    #[test]
    fn service_ports_are_unique_and_high() {
        for (index, port) in SERVICE_PORTS.iter().enumerate() {
            assert!(
                (1024..49152).contains(port),
                "候选端口 {port} 应在 1024..49152 之间（避开系统端口与临时端口段）"
            );
            assert!(
                !SERVICE_PORTS[..index].contains(port),
                "候选端口 {port} 重复"
            );
        }
        assert!(
            (1024..49152).contains(&DISCOVERY_PORT),
            "发现端口 {DISCOVERY_PORT} 应在 1024..49152 之间"
        );
    }

    #[test]
    fn scan_once_discovers_responder_on_ephemeral_port() {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("测试运行时创建失败");

        runtime.block_on(async {
            // 起一个真实的 UDP 响应器（同一套编解码逻辑），绑随机端口
            let responder = tokio::net::UdpSocket::bind(("127.0.0.1", 0))
                .await
                .expect("响应器绑定失败");
            let port = responder.local_addr().expect("取本地地址失败").port();
            let responder_task = tokio::spawn(async move {
                let mut buffer = [0u8; 2048];
                loop {
                    let Ok((len, peer)) = responder.recv_from(&mut buffer).await else {
                        break;
                    };
                    let text = String::from_utf8_lossy(&buffer[..len]);
                    if let Some(reply) = reply_for(&text, "测试电脑", port) {
                        let _ = responder.send_to(reply.as_bytes(), peer).await;
                    }
                }
            });

            let target = SocketAddr::from(([127, 0, 0, 1], port));
            let started = std::time::Instant::now();
            let found = tokio::task::spawn_blocking(move || scan_once(target, SCAN_TIMEOUT))
                .await
                .expect("扫描线程崩溃");
            let elapsed = started.elapsed();
            responder_task.abort();

            assert_eq!(found.len(), 1, "应发现一台电脑: {found:?}");
            assert_eq!(found[0].name, "测试电脑");
            assert_eq!(found[0].ip, "127.0.0.1");
            assert_eq!(found[0].port, port);
            assert_eq!(found[0].addr, format!("127.0.0.1:{port}"));
            assert!(
                elapsed < Duration::from_millis(3000),
                "扫描应在 1.5s 窗口内结束，实际 {elapsed:?}"
            );
        });
    }
}
