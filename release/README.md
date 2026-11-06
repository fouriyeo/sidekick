# release/ — 打包好的安装包

这个目录只放**可直接安装/分发的成品**，文件名固定，每次打包覆盖旧文件，不建版本号子目录、不堆积历史包。

| 文件 | 平台 | 说明 |
| --- | --- | --- |
| `Sidekick-macOS.dmg` | macOS（Apple Silicon） | 桌面端 `.app` 打成 dmg；暂未签名，首次打开需右键 → 打开 |
| `Sidekick-Android.apk` | Android（arm64） | release 构建，本地 keystore 签名；`adb install -r` 或拷到手机安装 |

## 重新打包（覆盖同名文件）

```bash
scripts/package-release.sh    # 安卓 + 桌面（顺序已固定，见下）
scripts/package-desktop.sh    # 只打桌面端
scripts/package-android.sh    # 只打安卓端（release + 自动签名）
```

> **顺序要求**：桌面端 `build.rs` 会把 `release/Sidekick-Android.apk` 编译期嵌进二进制，DMG 里的安装包取决于**编译时磁盘上的那份**。所以必须**先打安卓、再打桌面**（`package-release.sh` 已按此顺序）；单独跑 `package-desktop.sh` 前先确认 APK 是最新的，否则手机扫码下载到的还是旧包（2026-11-06 踩过）。

## 约定

- **不加版本号**：文件名固定，避免每次多一个 20MB 的新文件；要区分版本看 git 提交记录。
- **不放 debug APK**：debug 包约 250MB，超过 GitHub 单文件 100MB 上限；这里只放 release 包。
- **从 debug 包换过来要先卸载**：这个 APK 用 `~/.sidekick` 的 release 密钥签名，和之前 `scripts/build-android.sh` 的 debug 签名不同，覆盖安装会报签名不一致；先 `adb uninstall dev.sidekick.app` 或手动卸载（App 内数据会清空），之后同一密钥的包可以正常覆盖升级。
- **Android 签名密钥**：`~/.sidekick/android-release.jks` 与 `~/.sidekick/android-signing.properties`（0600，首次运行脚本自动生成），**不要提交或分享**；密钥丢失后新包无法覆盖安装升级（需要先卸载旧版）。
- **macOS 未签名/未公证**：正式签名待做；Gatekeeper 拦截时右键 → 打开。
- **Git 说明**：这两个文件提交在 `main`。Git 对每次提交的二进制都会保留历史副本，固定文件名只保证工作区里只有一份，**推一次仓库历史大约 +27MB**（dmg ≈16MB + apk ≈11MB）；仓库明显变大时，改走 GitHub Release 或独立 release 分支。
