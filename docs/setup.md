# 开发环境与操作手册（macOS arm64）

## 已安装工具链（2026-10-31）

| 组件 | 版本 / 位置 |
| --- | --- |
| Rust | 1.93.1（brew `rust`，含 rustup） |
| Node | v24.13.0 |
| pnpm | 11.22（`app/package.json` 的 `packageManager` 已锁定） |
| JDK | OpenJDK 21（brew `openjdk@21`） |
| Android cmdline-tools | brew cask `android-commandlinetools`；`sdkmanager` 已在 PATH |
| Android SDK | `~/Library/Android/sdk` |
| SDK packages | `platform-tools`；`platforms;android-35` / `android-36` / `android-37.0`；`build-tools;35.0.1` / `36.0.0` / `37.0.0` |
| NDK | `27.2.12479018` |
| Rust 安卓目标 | `aarch64-linux-android`、`armv7-linux-androideabi`、`i686-linux-android`、`x86_64-linux-android`（`tauri android init` 自动安装） |
| cargo-ndk | `cargo install cargo-ndk`（安装在 `~/.cargo/bin`） |

重装参考：

```sh
brew install rust openjdk@21
brew install --cask android-commandlinetools
sdkmanager --sdk_root="$HOME/Library/Android/sdk" \
  "platform-tools" "platforms;android-35" "platforms;android-36" "platforms;android-37.0" \
  "build-tools;35.0.1" "build-tools;36.0.0" "build-tools;37.0.0" "ndk;27.2.12479018"
cargo install cargo-ndk
```

## 环境变量（安卓构建 / 安装）

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
export NDK_HOME=$ANDROID_HOME/ndk/27.2.12479018
export ANDROID_NDK_HOME=$NDK_HOME
export PATH="$HOME/.cargo/bin:$ANDROID_HOME/platform-tools:$PATH"
```

`scripts/build-android.sh` 已内置这些变量。

## 常用命令

```sh
# 桌面端开发（窗口出现即服务已启动）
cd app && pnpm install && pnpm tauri dev

# 生成安卓工程（克隆后 / gen 被清理后必须先执行）
pnpm tauri android init

# 构建 debug APK
scripts/build-android.sh
# 产物：app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

# 安装并启动
scripts/install-android.sh

# 安卓日志
adb logcat | grep -iE "sidekick|AndroidRuntime|FATAL|tauri"
```

## 无线调试（真机）

1. 设置 → 关于手机 → 连点「版本号」7 次，开启开发者选项；
2. 开发者选项里打开「USB 调试」和「无线调试」；手机与 Mac 连同一 Wi-Fi；
3. 进入「无线调试」，记下页面上的**连接端口**；
4. 点「使用配对码配对设备」，弹窗里的 **IP:配对端口 + 6 位配对码** 用于配对（弹窗关闭即失效，配对码很短命）；
5. 在 Mac 上：

```sh
adb pair <手机IP>:<配对端口> <配对码>
adb connect <手机IP>:<连接端口>
adb devices -l
```

注意：

- **配对端口 ≠ 连接端口**，两个都来自不同位置；
- 同时出现 IP 与 mDNS 两条 transport 时会报 `more than one device/emulator`：`adb disconnect <mDNS服务名>`，只保留 IP 连接；
- 保持手机屏幕常亮，锁屏/离开配对弹窗会导致配对失败。

## WebView 远程调试（AI 无头验证常用）

```sh
PID=$(adb shell pidof dev.sidekick.app)
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
curl -s http://127.0.0.1:9222/json   # 查看 WebView 当前 URL / 标题
```

- Chrome DevTools 协议（CDP）可用 Node 22+ 自带 WebSocket 直连 `webSocketDebuggerUrl`；
- 可直接执行：

```js
window.__TAURI_INTERNALS__.invoke("connect_server", { addr: "<电脑IP>:<真实端口>" })
window.__TAURI_INTERNALS__.invoke("discover_servers")  // 无参，返回发现的电脑列表
window.__TAURI_INTERNALS__.invoke("send_chat", { text: "hello" })
```

- 截图确认界面：`adb exec-out screencap -p > /tmp/screen.png`
- 适合验证：连接状态、消息气泡方向、DOM 是否真的渲染（排查黑屏/白屏）。

## 重新生成安卓工程

`app/src-tauri/gen/` 已被 gitignore（约 600MB 构建产物）。克隆后：

```sh
cd app && pnpm install
pnpm tauri android init   # 会生成 gen/android 并补齐 Rust 安卓目标
```

生成的 Gradle 配置使用 `compileSdk = 37`，对应 SDK 包名 `platforms;android-37.0`。
生成后必须跑一次补丁脚本，写入麦克风/局域网/相机权限、请求局域网运行时授权、锁定竖屏：

```sh
node scripts/patch-android-manifest.mjs
```

`scripts/build-android.sh` 与 `scripts/package-android.sh` 已自动调用；直接跑 `pnpm tauri android build` 前别忘了。从 Android 16（API 36）起 App 访问局域网要 `ACCESS_LOCAL_NETWORK` 运行时授权，缺失时自动发现恒为 0 台、手动连接报超时（D72）。

## 故障排查

| 现象 | 可能原因 / 处理 |
| --- | --- |
| App 打开全黑 | 常见是 CSS 把 `body` 设成 `display:none`（见 AGENTS.md 第 8 节）；用 CDP 检查 `getComputedStyle(document.body).display` 与元素尺寸 |
| 手机连不上电脑 | 是否同一 Wi-Fi；macOS 防火墙是否允许传入（TCP 服务端口 + UDP 47820）；服务端口是否监听；电脑 IP 是否变化 |
| 手机找不到电脑（自动发现失败） | 先确认**电脑端 Sidekick 正在运行**（窗口关了 App 就退出、服务也停，手机日志会是 `发现 0 台电脑` + `Connection refused`）；再看手机与电脑是否同一 Wi-Fi/网段、路由器是否禁止广播/开启 AP 隔离；macOS 防火墙是否允许 Sidekick 传入（TCP 服务端口 + UDP 47820）。兜底：手机 App → 顶部连接状态 →「连接页」→「手动输入地址」填桌面窗口显示的 `IP:端口`（扫码也可用；自动发现失败时连接页空状态里也有入口）。 |
| 扫码下载不了 App | 二维码打开的是 `http://<电脑 IP>:<端口>/` 落地页，点「下载 App」才下载 `/download/apk`；手机要和电脑同一局域网。桌面端优先下发 `release/Sidekick-Android.apk`（release 签名约 7MB），没有时才回退嵌入副本/debug 包 |
| 服务端口被占用 | 日志会显示候选端口依次失败、最终监听的真实端口；桌面窗口显示的地址即为真实端口，无需手改 |
| `adb pair` 报 `protocol fault` | 配对端口/码已失效；重开配对弹窗，用弹窗里的端口与最新码 |
| `more than one device/emulator` | 断开 mDNS transport：`adb disconnect <服务名>` |
| Android 16+ 手机连不上 / 自动发现 0 台，但手机 shell 里 `curl` 能通 | 缺 `ACCESS_LOCAL_NETWORK` 运行时权限：`adb shell appops get dev.sidekick.app ACCESS_LOCAL_NETWORK` 若为 `Uid mode: ignore` 即被拒；重跑 `scripts/build-android.sh` 装新包，并在 App 首次启动的系统弹窗里允许本地网络。`adb reverse tcp:47810 tcp:47810` 后连 `127.0.0.1:47810` 能通，可反证是权限而非网络（D72） |
| 权限已允许、TCP 能连，但自动发现仍是 0 台 | 该网络只放行单播，广播和组播被丢弃（D73）。验证：`python3` 绑定 `0.0.0.0:47820` 并加入 `224.0.0.251` 后重启 App，收不到包；同时对比 `adb shell cat /proc/net/snmp` 里 `Udp OutDatagrams` 的差值——若差值等于探测次数（3）却没人收到，就是网络丢包。**mDNS 同样走组播，换成它也无效**。处置：手动输入电脑 `IP:端口`（App 会记住并自动重连）；要彻底解决需做扫码连接 |
| Gradle 报缺少 android-37 / build-tools | `sdkmanager "platforms;android-37.0" "build-tools;37.0.0"` |
| APK 很大 | debug 版正常（含调试符号）；release 需签名，体积预计 10–20MB |
| 首次构建很慢 | Gradle 首次下载依赖；`~/.gradle` 缓存后会明显加快 |

## 百炼云端识别（语音一级页：配置 / 关键词 / 语音用量）/ 自动粘贴 / 剪贴板 / 备忘录

- 语音识别只走百炼云端：在阿里云百炼控制台创建 **API Key**（`sk-...`）；Key 存本机 `asr.json`（0600），不写日志、不上传；安全性低于系统钥匙串。
- 服务地址：北京 `wss://dashscope.aliyuncs.com/api-ws/v1/inference`；新加坡 `wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference`。业务空间直接填完整 URL（把 `{WorkspaceId}` 换成真实 ID 后粘贴），没有单独的业务空间 ID 字段。
- 桌面左侧「语音 ⌘5」一级页的配置段：填完整服务地址/API Key/模型（默认 `qwen-audio-3.1-asr-flash-streaming`），按需调语言/场景/静音断句/保留方言；勾选隐私同意 →「测试连接」→「保存」。不再需要钥匙串授权。
- 关键词在同页「关键词」段管理：一行一个词，点「加一行」增加、点「保存」写入；最多 2000 个，录音时统一按权重 4 发送。
- Key 保存到 `asr.json`（0600）；旧版本钥匙串里的 Key 需重新粘贴一次，之后不再弹密码。
- 本机数据目录：`~/.sidekick/`（`asr.json` / `asr_usage.json` / `clipboard.json`，均 `0600`）。首次启动会把旧 `~/Library/Application Support/Sidekick/` 里的同名 JSON 复制一次过来（旧文件保留，不删除）。
- 用量统计：`~/.sidekick/asr_usage.json`（`0600`），按本机日期汇总；该页用区间切换看今天/近 7 天/近 1 个月/近 1 年金额/Token（今天无明细，1 年按月）；「清空统计」只重置该文件，不影响配置/Key。
- 旧本机模型目录 `~/Library/Application Support/Sidekick/models/` 不会迁移、不参与运行，可手动删除；`whisper-rs`/cmake/libclang 不再是构建前提。
- 自动粘贴需要在「系统设置 → 隐私与安全性 → 辅助功能」勾选当前 `desktop`（开发）或 `Sidekick.app`（正式）。设置页可请求权限、打开系统设置、在 Finder 中定位、重新检测。
- **开发二进制重编译就掉授权**：`cargo` 产物是 ad-hoc 链接器签名（无证书），cdhash 每次重新链接都变，TCC 只认旧身份——表现是系统设置里明明勾着、App 里「重新检测」仍显示未授权（macOS 26 更严格）。一次性解决：跑 `scripts/setup-dev-signing.sh` 建本机自签名证书「Sidekick Dev」（私钥/证书留底 `~/.sidekick/dev-signing/`，仅在「代码签名」策略上信任，不需要 sudo），之后 `scripts/run-desktop.sh` 构建完会自动调 `scripts/sign-desktop-dev.sh` 重签，设计需求固定为 `identifier "dev.sidekick.app" and certificate root = H"5d57…"`，重编译不变，授权一次长期有效。`pnpm tauri dev` 没有构建后钩子，重编译后要手动跑一次 `scripts/sign-desktop-dev.sh` 并重启 App；`--recreate` 可重建证书（重建后要在系统设置里重新授权一次）。本机已安装的 `/Applications/Sidekick.app` 也能用同一脚本重签（传 `.app` 路径时不覆盖 identifier，由 Info.plist 决定），签完两个产物的设计需求一致：`identifier "dev.sidekick.app" and certificate root = H"5d57…"`；但 `scripts/package-desktop.sh` 产出的 DMG 仍是 ad-hoc 链接器签名，重装/重新打包会换身份，要彻底固定得让 `pnpm tauri build` 用同一证书（`APPLE_SIGNING_IDENTITY`，自签名时不要开 `--timestamp`），或装完再补签一次。证书/私钥在 `~/.sidekick/dev-signing/`（`0600`），只在本机登录钥匙串里信任，不要提交或分享。
- 剪贴板历史在 `~/.sidekick/clipboard.json`，权限 `600`；可在桌面「剪贴板」页暂停/清空。

## Release 打包与发布（release/ 不入库）

```sh
scripts/package-release.sh    # 安卓 + 桌面，产物覆盖 release/ 下同名文件
scripts/package-desktop.sh    # 只打桌面
scripts/package-android.sh    # 只打安卓
scripts/publish-release.sh    # 上传 GitHub Releases（tag 默认 vYYYY.MM.DD）
```

- 桌面：`pnpm tauri build` → `release/Sidekick-macOS.dmg`（arm64）。`package-desktop.sh` 会带上 `APPLE_SIGNING_IDENTITY`，用本机自签名证书「Sidekick Dev」签（`scripts/setup-dev-signing.sh` 建的那张），**这样 TCC 辅助功能授权可以跨重装保留**；没建身份时回退 ad-hoc 链接器签名，每次重装都要重新授权。产物未公证，Gatekeeper 拦截时右键 → 打开。
- 安卓：release 构建（aarch64）→ `zipalign` + `apksigner` → `release/Sidekick-Android.apk`。
  - 首次运行自动在 `~/.sidekick/` 生成签名密钥 `android-release.jks` 与 `android-signing.properties`（0600）；**备份且不要提交**，密钥丢失后新包无法覆盖安装升级。
  - 想用已有 keystore：设置 `SIDEKICK_ANDROID_KEYSTORE` / `SIDEKICK_ANDROID_SIGNING_PROPS` 两个环境变量。
- 文件名固定、每次覆盖、不建版本号目录；**两个包都不提交**（D125，撤销 D63），分发走 `scripts/publish-release.sh` → GitHub Releases（私有仓库下载需登录）。
- 新克隆的仓库要先本地打一次 APK 再打桌面端：`build.rs` 会把 `release/Sidekick-Android.apk` 编译期嵌进 DMG 里的桌面二进制（`/download/apk` 靠它离线下发）。
- 后续：正式签名（Apple Developer 证书 + 公证）、开机自启。
