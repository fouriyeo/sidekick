//! 旧版 Keychain 条目的清理。
//!
//! API Key 现在存在本机 `asr.json`（0600），不再读写钥匙串；这里只保留
//! 「清除 Key 时顺手删除旧条目」的能力，避免升级后旧密钥继续留在系统里。

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
