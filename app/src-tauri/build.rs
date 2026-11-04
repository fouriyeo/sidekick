use std::path::PathBuf;

fn main() {
    // 手机安装包跟着桌面端一起分发：把 release/Sidekick-Android.apk 嵌进二进制，
    // 这样换一台电脑、源码目录被移动或清理后，手机扫码仍能下载到安装包。
    // 文件不存在（还没打过安卓包）时不嵌入，服务端运行时会回退到磁盘候选路径。
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let apk = manifest_dir.join("../../release/Sidekick-Android.apk");
    println!("cargo:rerun-if-changed={}", apk.display());

    let generated = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("embedded_apk.rs");
    let source = if apk.is_file() {
        format!(
            "/// 编译期嵌入的 Android 安装包（release 签名）。\npub static EMBEDDED_APK: Option<&[u8]> = Some(include_bytes!(r#\"{}\"#));\n",
            apk.display()
        )
    } else {
        "/// 编译时没有找到 release/Sidekick-Android.apk。\npub static EMBEDDED_APK: Option<&[u8]> = None;\n".to_string()
    };
    std::fs::write(&generated, source).expect("写入 embedded_apk.rs 失败");

    tauri_build::build()
}
