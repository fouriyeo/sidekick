# release/ — 本地构建产物

这个目录只放**当前这次构建**的可安装成品，文件名固定、每次打包覆盖，不建版本号子目录。

> **不入库（D125，撤销 D63）**：`/release/*.dmg` 与 `/release/*.apk` 已 gitignore。分发入口是 GitHub Releases：
> <https://github.com/fouriyeo/sidekick/releases/latest>（私有仓库，下载需登录 GitHub）。

| 文件 | 平台 | 说明 |
| --- | --- | --- |
| `Sidekick-macOS.dmg` | macOS（Apple Silicon） | 桌面端 `.app` 打成 dmg；暂未签名/公证，首次打开需右键 → 打开 |
| `Sidekick-Android.apk` | Android（arm64） | release 构建，本地 keystore 签名；`adb install -r` 或拷到手机安装 |

## 重新打包（覆盖同名文件）

```bash
scripts/package-release.sh    # 安卓 + 桌面（顺序已固定，见下）
scripts/package-desktop.sh    # 只打桌面端
scripts/package-android.sh    # 只打安卓端（release + 自动签名）
scripts/publish-release.sh    # 上传 GitHub Releases（tag 默认 vYYYY.MM.DD）
```

> **顺序要求**：桌面端 `build.rs` 会把 `release/Sidekick-Android.apk` 编译期嵌进二进制，DMG 里的安装包取决于**编译时磁盘上的那份**。所以必须**先打安卓、再打桌面**（`package-release.sh` 已按此顺序）；单独跑 `package-desktop.sh` 前先确认 APK 是最新的，否则手机扫码下载到的还是旧包（2026-11-06 踩过）。因此新克隆的仓库要先本地打一次 APK，DMG 里才有安装包。

## 约定

- **不加版本号**：文件名固定；版本用 GitHub Release 的 tag（`vYYYY.MM.DD`）区分。
- **不放 debug APK**：debug 包 120–314MB，只在本地产物目录；`release/` 里只放 release 包。
- **从 debug 包换过来要先卸载**：这个 APK 用 `~/.sidekick` 的 release 密钥签名，和 `scripts/build-android.sh` 的 debug 签名不同，覆盖安装会报签名不一致；先 `adb uninstall dev.sidekick.app`（App 内数据会清空），之后同一密钥的包可正常覆盖升级。
- **Android 签名密钥**：`~/.sidekick/android-release.jks` 与 `~/.sidekick/android-signing.properties`（0600，首次运行脚本自动生成），**不要提交或分享**；密钥丢失后新包无法覆盖安装升级。
- **macOS 未签名/未公证**：正式签名待做；Gatekeeper 拦截时右键 → 打开。
- **不要把这些文件 `git add -f`**：Git 为每个二进制版本保留历史副本，2026-11-08 因此把仓库历史重写了一次（`.git` 285MB → 干净体积）。
