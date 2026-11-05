//! 共享 TLS provider 初始化。
//!
//! rustls 0.23 不再自动选择 CryptoProvider，必须在第一次 TLS 握手前显式安装。
//! ASR WebSocket（tokio-tungstenite）与模型价格抓取（reqwest）共用同一个
//! ring provider；这里集中安装一次，避免任何一方在未安装时握手 panic。

use std::sync::Once;

static CRYPTO_PROVIDER: Once = Once::new();

/// 安装 ring CryptoProvider；重复调用会静默跳过。
pub fn ensure_crypto_provider() {
    CRYPTO_PROVIDER.call_once(|| {
        if rustls::crypto::ring::default_provider()
            .install_default()
            .is_err()
        {
            eprintln!("[tls] rustls CryptoProvider 已安装，跳过 ring provider");
        }
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn installs_crypto_provider_once() {
        super::ensure_crypto_provider();
        super::ensure_crypto_provider();
        assert!(rustls::crypto::CryptoProvider::get_default().is_some());
    }
}
