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

## 故障排查

| 现象 | 可能原因 / 处理 |
| --- | --- |
| App 打开全黑 | 常见是 CSS 把 `body` 设成 `display:none`（见 AGENTS.md 第 8 节）；用 CDP 检查 `getComputedStyle(document.body).display` 与元素尺寸 |
| 手机连不上电脑 | 是否同一 Wi-Fi；macOS 防火墙是否允许传入（TCP 服务端口 + UDP 47820）；服务端口是否监听；电脑 IP 是否变化 |
| 手机找不到电脑（自动发现失败） | 路由器是否禁止广播/开启 AP 隔离；macOS 是否允许 Sidekick 传入连接；`pnpm tauri dev` 日志是否有 `[discovery]`；可改用「手动输入地址」并填桌面窗口显示的地址 |
| 服务端口被占用 | 日志会显示候选端口依次失败、最终监听的真实端口；桌面窗口显示的地址即为真实端口，无需手改 |
| `adb pair` 报 `protocol fault` | 配对端口/码已失效；重开配对弹窗，用弹窗里的端口与最新码 |
| `more than one device/emulator` | 断开 mDNS transport：`adb disconnect <服务名>` |
| Gradle 报缺少 android-37 / build-tools | `sdkmanager "platforms;android-37.0" "build-tools;37.0.0"` |
| APK 很大 | debug 版正常（含调试符号）；release 需签名，体积预计 10–20MB |
| 首次构建很慢 | Gradle 首次下载依赖；`~/.gradle` 缓存后会明显加快 |

## 百炼云端识别（模型页）/ 自动粘贴 / 剪贴板

- 语音识别只走百炼云端：在阿里云百炼控制台创建 **API Key**（`sk-...`）；Key 存本机 `asr.json`（0600），不写日志、不上传；安全性低于系统钥匙串。
- 服务地址：北京 `wss://dashscope.aliyuncs.com/api-ws/v1/inference`；新加坡 `wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference`。业务空间直接填完整 URL（把 `{WorkspaceId}` 换成真实 ID 后粘贴），没有单独的业务空间 ID 字段。
- 桌面主导航「模型」（AI 联动之后）：填完整服务地址/API Key/模型（默认 `qwen-audio-3.1-asr-flash-streaming`），按需调语言/场景/静音断句/热词；勾选隐私同意 →「测试连接」→「保存」。不再需要钥匙串授权。
- Key 保存到 `asr.json`（0600）；旧版本钥匙串里的 Key 需重新粘贴一次，之后不再弹密码。
- 用量统计：`~/Library/Application Support/Sidekick/asr_usage.json`（`0600`），按本机日期汇总；模型页用区间切换看今天/近 7 天/近 1 个月/近 1 年金额/Token（今天无明细，1 年按月）；「清空统计」只重置该文件，不影响配置/Key。
- 旧本机模型目录 `~/Library/Application Support/Sidekick/models/` 可能仍在磁盘上，但已不参与运行，可手动删除；`whisper-rs`/cmake/libclang 不再是构建前提。
- 自动粘贴需要在「系统设置 → 隐私与安全性 → 辅助功能」勾选当前 `desktop`（开发）或 `Sidekick.app`（正式）。设置页可请求权限、打开系统设置、在 Finder 中定位、重新检测。重新编译开发二进制后可能需要重新勾选。
- 剪贴板历史在 `~/Library/Application Support/Sidekick/clipboard.json`，权限 `600`；可在桌面「剪贴板」页暂停/清空。

## Release（待办）

- 生成 keystore，在 `gen/android` 中配置 `signingConfigs`；
- `pnpm tauri android build --apk` 产出正式包；
- 桌面端 `pnpm tauri build` 打包 .app/.dmg。
