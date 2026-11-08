---
doc: engineering/release
title: 发版 runbook（打包 / 签名 / 发布 / 回滚）
status: active
updated: 2026-11-08
load: on-demand
owner: engineering
---

# 发版 runbook

> 这篇回答：怎么从源码打出一个可分发版本、怎么上传 GitHub Releases、怎么验证、出错怎么补。
> 不包含：签名证书的选购与公证（未做，见 §8）、构建环境安装（见 [setup.md](../setup.md)）、发布历史（见 [history.md](../history.md)）。
> 决策依据：D125（安装包改 GitHub Releases 分发，撤销 D63 的提交入库）。

## 1. 一句话流程

```bash
cd app && pnpm install          # 首次
scripts/package-release.sh      # 先安卓后桌面 → release/ 两个固定文件名
scripts/publish-release.sh      # 上传 GitHub Releases（tag 默认 vYYYY.MM.DD）
```

发一次版 = 两条命令；顺序不能反（§3.1）。

## 2. 前提

| 项 | 要求 | 检查 |
| --- | --- | --- |
| Rust / Node 24 / pnpm 11 / JDK 21 / Android SDK 37 + NDK 27.2 | 见 [setup.md](../setup.md) | `cargo --version`、`java -version` |
| `gh` 已登录且有 `repo` scope | 上传 release 用 | `gh auth status` |
| 安卓签名密钥 | 首次打包自动生成 `~/.sidekick/android-release.jks` + `android-signing.properties`（0600） | 备份，不要提交；丢了新包无法覆盖升级 |
| 桌面签名身份「Sidekick Dev」 | 可选但强烈建议：`scripts/setup-dev-signing.sh` 建 | `security find-identity -v -p codesigning` |
| `release/` 目录 | 只放本地产物（不入库，D125）；`release/README.md` 入库 | 两个包 gitignore |

桌面端 `build.rs` 会把 `release/Sidekick-Android.apk` **编译期嵌进二进制**，供 `/download/apk` 离线下发——所以「没有 APK 就只打桌面」会产出不带安装包的 DMG。

## 3. 打包

### 3.1 顺序（唯一硬规则）

```text
package-android.sh  →  release/Sidekick-Android.apk
        ↓（build.rs 读它，嵌进桌面二进制）
package-desktop.sh  →  release/Sidekick-macOS.dmg
```

`package-release.sh` 已按此顺序串好。反着打会让 DMG 里带的还是上一次的 APK（2026-11-06 踩过）。

### 3.2 各脚本

| 脚本 | 做什么 | 产物 |
| --- | --- | --- |
| `scripts/package-android.sh` | release 构建（aarch64）→ `zipalign` → `apksigner`；首次自动建 keystore；退出时 `restore-desktop-features.mjs` 补回被剥掉的 `macos-private-api` | `release/Sidekick-Android.apk` |
| `scripts/package-desktop.sh` | `pnpm tauri build` → 复制 dmg；用「Sidekick Dev」签名（找不到则 ad-hoc 并告警）；嵌入当下磁盘上的 APK | `release/Sidekick-macOS.dmg` |
| `scripts/package-release.sh` | 上面两个串联，末尾提示下一步 | 两个文件 |
| `scripts/publish-release.sh` | 校验 + 上传 GitHub Releases | release 页面 |

- 文件名固定、每次覆盖，**不建版本号目录**；版本靠 Release tag 区分。
- 自定义 keystore：`SIDEKICK_ANDROID_KEYSTORE` / `SIDEKICK_ANDROID_SIGNING_PROPS`；自定义桌面签名身份：`SIDEKICK_SIGN_IDENTITY`。
- 只打桌面时脚本会提示「将嵌入哪个 APK（大小 + 时间）」；看到「不会嵌入安装包」就是漏了先打 APK。

## 4. 版本与 tag

- 默认 tag：`vYYYY.MM.DD`（`publish-release.sh` 按当天生成），标题 `Sidekick vYYYY.MM.DD`。
- 同日多次发布：用**同一个 tag** 重跑 `publish-release.sh`（脚本走 `gh release upload --clobber` 覆盖两个 asset），不要造 `-2` 后缀。
- 需要语义化 tag：`scripts/publish-release.sh --tag v0.1.0`。
- tag 是唯一版本号；`app/src-tauri/tauri.conf.json` 的 `version` 目前固定 `0.1.0`，未参与发布流程。
- **只有二进制/功能有变化才发版**：纯文档、纯重构、纯 CI 调整不发 Release（它们进 git 历史与 [history.md](../history.md)）。

## 5. 发布

```bash
scripts/publish-release.sh --dry-run   # 只打印说明与将上传的文件，不创建 release
scripts/publish-release.sh             # 正式发布
```

脚本做的事：

1. `gh auth status`、两个包是否存在；
2. 打印体积，>100MB 告警（debug 包混进来时能立刻发现）；
3. 有 JDK 时 `apksigner verify --print-certs` 自检（找不到 build-tools/JDK 则跳过，不阻塞）；
4. 说明文件 = 安装说明 + **自上个 tag 以来的 feat / fix / perf**（`--notes-file` 可手写覆盖）；
5. `gh release view <tag>` 存在则 `upload --clobber`，否则 `release create`；
6. 打印 release URL。

### 5.1 发布说明写什么

- 只写**用户能感知的变化**：`feat` / `fix` / `perf` 提交的摘要；`docs` / `chore` / `style` / `test` / `ci`，以及内部 scope（`release` / `docs` / `ci` / `build` / `deps`）**不进 release 页面**（文档瘦身、重打包、格式化不算发布内容）。
- 自动生成的说明会带一行指向 [history.md](../history.md) 与 [decisions.md](../decisions.md)，要细节的人自己去翻。
- 首个版本或改动很多时，建议手写：`scripts/publish-release.sh --notes-file /tmp/notes.md`（覆盖自动生成）。
- 同一 tag 覆盖重发时，基线是**该 tag 首次发布的提交**，说明里的人只看这次补了什么。
- `--dry-run` 只预览说明与将上传的文件，不校验 APK 签名（正式发布会强制 `apksigner`）。

## 6. 发布后验证

| 检查 | 命令/位置 | 通过标准 |
| --- | --- | --- |
| asset 齐、尺寸对 | `gh release view <tag> --json assets` | 两个 asset，APK ≈16MB / DMG ≈23MB |
| APK 签名 | `apksigner verify --print-certs release/Sidekick-Android.apk` | V3 Signer = `CN=Sidekick` |
| DMG 可挂载 | 双击或 `hdiutil attach` | 出现 `Sidekick.app` |
| 桌面内嵌包与本地一致 | `shasum -a 256 release/Sidekick-Android.apk`，再在桌面 `/download/apk` 下载同一份比对 | 哈希一致（说明 DMG 不是旧包） |
| 落地页 | 手机浏览器扫码打开桌面地址 | 能下载 APK；企业网见 [pitfalls §3](./pitfalls.md#3-android-真机与权限) |
| 覆盖安装 | `adb install -r release/Sidekick-Android.apk` | 与上一版同一 keystore 时直接升级成功 |

发版前的通用回归见 [quality.md](./quality.md) §8 与 §10 发布门；发版后把结果补进 [history.md](../history.md)。

## 7. 常见故障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| DMG 里没有安装包 / `/download/apk` 404 | 打桌面时 `release/` 里没有 APK | 先 `package-android.sh` 再 `package-desktop.sh` |
| `Unable to locate a Java Runtime` | `apksigner` 需要 JDK，脚本所在 shell 没带 `JAVA_HOME` | 脚本已自动探测 JDK 21；仍失败则 `export JAVA_HOME=$(/usr/libexec/java_home -v 21)` |
| 覆盖安装报签名不一致 | 旧包是 debug 签名 | `adb uninstall dev.sidekick.app` 后装 release 包（App 数据会清空） |
| 辅助功能授权每次重装失效 | 产物是 ad-hoc 签名（cdhash 变） | 装「Sidekick Dev」身份重打；或 `tccutil reset Accessibility dev.sidekick.app` 重授权 |
| 手机上 release 页面打不开 | 网络/DNS 被墙或企业网限制 | 直接打开 asset 链接重试；局域网内也可用桌面 `/download/apk`（DMG 内嵌离线可用） |
| `HTTP 401/403` | `gh` 未登录或 token 缺 `repo` | `gh auth login`，`gh auth status` 确认 |
| 本地 `release/` 被清空 | 只删了本地产物 | `gh release download <tag> -D release` 拉回，或重打 |
| 想删掉某个发布 | tag 已推错 | `gh release delete <tag> --yes --cleanup-tag`（会同时删远端 tag） |

## 8. 回滚与补丁重发

- **代码回滚**：`git revert` 新提交即可；Release 历史保留，不要改已发布的 tag。
- **补丁重发**：同一版本 tag 重跑 `package-release.sh` + `publish-release.sh`（asset 覆盖，tag 不动）；说明里会带最新提交。
- **撤回某版本**：`gh release delete <tag> --yes --cleanup-tag`；本地两个包不受影响。
- 未做：Apple Developer 签名与公证、自动更新、版本号自动递增。当前 macOS 包未签名/未公证，Gatekeeper 拦截时右键 → 打开；正式签名列入 P2。

## 9. `release/` 目录的边界

- 只放**本地构建产物**：`Sidekick-macOS.dmg`、`Sidekick-Android.apk`（均 gitignore）。
- `release/README.md` 入库，说明目录职责；不要用 `git add -f` 把包塞回仓库（历史会膨胀，2026-11-08 已用 `git filter-repo` 清理过一次）。
- 两个包随时可删：`gh release download <tag> -D release` 或重跑打包即可恢复。
- 与安装包相关的原则见 [pitfalls §10](./pitfalls.md#10-构建打包与发布)；分发策略变更见 [decisions.md](../decisions.md) D125。
