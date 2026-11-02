//! 百炼 API Key 的安全存储。
//!
//! 只存 macOS 登录钥匙串；配置文件里不出现明文。开发版每次重新编译后，
//! 系统可能因为二进制签名变化重新询问一次授权，这是 macOS 的预期行为。

pub const KEYCHAIN_SERVICE: &str = "dev.sidekick.app.asr.bailian";
pub const KEYCHAIN_ACCOUNT: &str = "default";

#[cfg(target_os = "macos")]
mod imp {
    use security_framework::base::Error as SecurityError;
    use security_framework::passwords::{
        delete_generic_password, get_generic_password, set_generic_password,
    };

    const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

    pub fn set_key(key: &str) -> Result<(), String> {
        let key = key.trim();
        if key.is_empty() {
            return Err("API Key 不能为空".to_string());
        }
        set_generic_password(
            super::KEYCHAIN_SERVICE,
            super::KEYCHAIN_ACCOUNT,
            key.as_bytes(),
        )
        .map_err(|error| format!("写入系统钥匙串失败：{error}"))
    }

    pub fn get_key() -> Result<Option<String>, String> {
        match get_generic_password(super::KEYCHAIN_SERVICE, super::KEYCHAIN_ACCOUNT) {
            Ok(bytes) => String::from_utf8(bytes)
                .map(|key| Some(key.trim().to_string()).filter(|key| !key.is_empty()))
                .map_err(|_| "系统钥匙串里的 API Key 不是有效文本".to_string()),
            Err(error) if is_not_found(&error) => Ok(None),
            Err(error) => Err(format!("读取系统钥匙串失败：{error}")),
        }
    }

    pub fn delete_key() -> Result<(), String> {
        match delete_generic_password(super::KEYCHAIN_SERVICE, super::KEYCHAIN_ACCOUNT) {
            Ok(()) => Ok(()),
            Err(error) if is_not_found(&error) => Ok(()),
            Err(error) => Err(format!("删除系统钥匙串条目失败：{error}")),
        }
    }

    fn is_not_found(error: &SecurityError) -> bool {
        error.code() == ERR_SEC_ITEM_NOT_FOUND
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn set_key(_key: &str) -> Result<(), String> {
        Err("当前平台暂不支持安全保存 API Key".to_string())
    }

    pub fn get_key() -> Result<Option<String>, String> {
        Ok(None)
    }

    pub fn delete_key() -> Result<(), String> {
        Ok(())
    }
}

pub use imp::{delete_key, get_key, set_key};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn service_name_is_stable() {
        assert_eq!(KEYCHAIN_SERVICE, "dev.sidekick.app.asr.bailian");
        assert_eq!(KEYCHAIN_ACCOUNT, "default");
    }
}
