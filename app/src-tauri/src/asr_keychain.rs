//! 旧版 Keychain 条目的清理。
//!
//! API Key 现在存在本机 `asr.json`（0600），不再读写钥匙串；这里只保留
//! 「清除 Key 时顺手删除旧条目」的能力，避免升级后旧密钥继续留在系统里。
//!
//! 注意：不要为了「自动迁移」在这里加读取逻辑。开发版二进制每次重编译签名都会变，
//! 读旧条目会弹 macOS 授权/登录密码弹窗（2026-11-03 试过，用户明确拒绝）。
//! 旧 Key 唯一正确的恢复方式是在模型页重新粘贴一次。

pub const KEYCHAIN_SERVICE: &str = "dev.sidekick.app.asr.bailian";
pub const KEYCHAIN_ACCOUNT: &str = "default";

#[cfg(target_os = "macos")]
mod imp {
    use security_framework::base::Error as SecurityError;
    use security_framework::passwords::delete_generic_password;

    const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

    pub fn delete_key() -> Result<(), String> {
        match delete_generic_password(super::KEYCHAIN_SERVICE, super::KEYCHAIN_ACCOUNT) {
            Ok(()) => Ok(()),
            Err(error) if is_not_found(&error) => Ok(()),
            Err(error) => Err(format!("删除旧钥匙串条目失败：{error}")),
        }
    }

    fn is_not_found(error: &SecurityError) -> bool {
        error.code() == ERR_SEC_ITEM_NOT_FOUND
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn delete_key() -> Result<(), String> {
        Ok(())
    }
}

pub use imp::delete_key;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn service_name_is_stable() {
        assert_eq!(KEYCHAIN_SERVICE, "dev.sidekick.app.asr.bailian");
        assert_eq!(KEYCHAIN_ACCOUNT, "default");
    }
}
