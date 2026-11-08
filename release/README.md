# release/ — 本地构建产物（不入库）

这个目录只放**当前这次构建**的可安装成品，文件名固定、每次打包覆盖，不建版本号子目录。

> **不入库（D125，撤销 D63）**：`/release/*.dmg` 与 `/release/*.apk` 已 gitignore。
> 分发入口是 GitHub Releases：<https://github.com/fouriyeo/sidekick/releases>（公开仓库，任意人可下载）。
> **完整发版流程（打包顺序 / 签名 / tag / 验证 / 故障 / 回滚）见 [docs/engineering/release.md](../docs/engineering/release.md)**，本页只记目录约定。

| 文件 | 平台 | 说明 |
| --- | --- | --- |
| `Sidekick-macOS.dmg` | macOS（Apple Silicon） | 桌面端 `.app` 打成 dmg；未签名/未公证，首次打开需右键 → 打开 |
| `Sidekick-Android.apk` | Android（arm64） | release 构建，本地 keystore 签名；`adb install -r` 或拷到手机 |

```bash
scripts/package-release.sh    # 安卓 + 桌面（先安卓，顺序不能反）
scripts/publish-release.sh    # 上传 GitHub Releases（tag 默认 vYYYY.MM.DD）
```

## 约定

- **两个包随时可删**：这里只是本地产物；恢复方式 `gh release download <tag> -D release` 或重跑打包。本页（README）要保留，它是入库文件。
- **顺序不能反**：桌面 `build.rs` 把 `release/Sidekick-Android.apk` 编译期嵌进二进制（`/download/apk` 靠它）；先打安卓再打桌面，否则 DMG 里是旧包/没有包。
- **不加版本号**：文件名固定，版本用 Release tag 区分。
- **不放 debug 包**：debug APK 120–314MB，只用于本地安装。
- **从 debug 包换过来要先卸载**：release 包用 `~/.sidekick` 的 keystore 签名，覆盖安装会报签名不一致；先 `adb uninstall dev.sidekick.app`（App 数据会清空）。
- **签名密钥**：`~/.sidekick/android-release.jks` 与 `android-signing.properties`（0600），备份且不要提交；丢了新包无法覆盖升级。
- **不要 `git add -f` 这两个包**：Git 会为每份二进制保留历史副本，2026-11-08 已因此重写过一次历史（`.git` 285MB → 23MB）。
