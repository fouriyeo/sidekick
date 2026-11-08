# AGENTS.md — Sidekick 项目上下文

> 面向 AI 编码代理：读完这份就能接手。细节在 `docs/`（入口 `docs/INDEX.md`），协议在 `protocol/`。
> 最后更新：2026-11-08 ｜ 本文只放「必须一直知道」的事；状态、历史、踩坑各有唯一归属（见 §2.5）。

## 1. 项目是什么

- 名称：Sidekick（英文；「小跟班」只是手机宠物角色名，D114）。
- 一句话：把手机变成电脑的「外设 + AI 宠物」——电脑把 AI/任务状态推到手机；手机收状态、录音转文字、看用量、录音频备忘录。
- 仓库：https://github.com/fouriyeo/sidekick （MIT 开源，owner fouriyeo）。
- 平台：Android 优先（iOS 后续）；电脑端目前只 macOS。

## 2. 现在做到哪（快照）

- 局域网 MVP 已验证：桌面（Tauri）跑 HTTP/WS 服务，手机 App 主动连；UDP 自动发现 + 端口回退 + 断线重连（1s→30s 退避）。
- 电脑端「Liquid Glass · iOS 26」壳：6 个一级页 **概览 ⌘1 / 剪贴板 ⌘2 / 备忘录 ⌘3 / 用量 ⌘4 / 语音 ⌘5 / 设置 ⌘6** + 224 玻璃侧栏 + sticky 玻璃工具栏 + push 式设置二级页。
- 菜单栏常驻（关窗=隐藏窗口）+ 左键 Token 用量小看板（原生磨砂玻璃卡片）。
- 手机：宠物页（会话卡浮层 / 鲸鱼 / 麦克风）+ 设置二级页 + 聊天/连接/回答页 + 备忘录全屏页；竖屏单布局。
- 功能：语音输入（百炼云端 ASR，唯一）→ 写剪贴板 + 合成 Cmd+V；结果卡可手动「回车/清空」；Token 用量看板（双端）；语音备忘录（手机录音 + 分段转写 + LLM 归类 + 局域网只读镜像）；AI 联动（DSH hook，四态 + 会话列表 + 一键唤起 DSH）。
- 未做：手机回答 AI 提问、文本消息、Claude Code / Qoder hook、配对鉴权、正式签名/公证、BLE、iOS。
- 逐项状态与待验收项 → `docs/status.md`；变更历史 → `docs/history.md`。

## 2.5 文档怎么读（懒加载）

| 你要什么 | 读哪 |
| --- | --- |
| 唯一入口 / 按任务路由 | `docs/INDEX.md` |
| 现在什么状态、下一步、待验收 | `docs/status.md` |
| 为什么这么定（含被取代关系） | `docs/decisions.md` |
| 变更历史（谁在什么时候做了什么） | `docs/history.md` |
| 踩过的坑与硬约束 | `docs/engineering/pitfalls.md` |
| 产品原则 / 规范 / PRD / 技术方案 | `docs/product/`、`docs/standards/`、`docs/prd/`、`docs/engineering/` |
| 设计归档（只读结论） | `docs/design/ARCHIVE.md` |

规则：从 `docs/INDEX.md` 选 **1 个**分支，最多读 2 篇叶子；够用就停。新文档写 frontmatter 并在父索引登记，改完跑 `node scripts/check-docs.mjs`。项目子智能体与 Skill 在 `.agents/agents/`、`.agents/skills/`。

## 3. 技术栈与架构

- 单仓库、双产物：Tauri 2 桌面 + Tauri Android，共用 `app/`；Rust 用 `cfg(desktop/mobile)` 隔离，桌面服务代码不进手机包。
- 前端：React 19 + Tailwind v4 + shadcn/ui（Base UI `base-nova`）+ Motion；`src/{desktop,mobile,shared,protocol}`，**两个平台各自固定布局，不做跨端自适应、禁止跨平台 import**。
- 桌面：axum HTTP/WS（端口候选 **47810–47814、8848**，默认 47810，被占自动顺延）+ UDP 发现响应器（固定 **47820**）+ DSH hook 回环桥（**47815–47819**，只绑 127.0.0.1）。
- 手机：tokio-tungstenite 主动连电脑；前端只通过 Tauri 命令/事件通信（`shared/lib/tauri.ts`）。
- 协议：WebSocket 文本帧 JSON，服务端广播；定义见 `protocol/README.md`，音频协议见 `docs/engineering/protocol-audio.md`。
- 视觉按平台分作用域：桌面 `.desktop-ios`（`desktop/styles/ios.css`）、手机 `.mobile-clean`（`mobile/styles/clean.css`）；`tokens.css` 只是共享基础与宠物舞台色，不要当桌面色板。

## 4. 目录结构

```text
sidekick/
├─ AGENTS.md  README.md
├─ .agents/{agents,skills}/     # 项目子智能体与 Skill
├─ app/                         # Tauri 项目（桌面 + 安卓）
│  ├─ src/{entries,desktop,mobile,shared,protocol,dev}/
│  ├─ src-tauri/src/            # lib.rs 分流 + tray/panel_glass/discovery/desktop_keys/asr_*/keep_awake…
│  └─ src-tauri/{capabilities,icons,mobile/}/
├─ brand/                       # appicon.png 母版 + 矢量标记（+ gen-brand-mark.py 派生）
├─ release/                     # 本地构建产物（不入库，D125）
├─ screenshots/                 # README 截图（scripts/qa-shots.mjs 生成）
├─ protocol/README.md           # 事件协议
├─ docs/                        # 文档树，入口 docs/INDEX.md
└─ scripts/                     # 构建/安装/打包/发布/QA/文档检查
```

## 5. 常用命令

```bash
cd app && pnpm install
pnpm tauri dev                 # 桌面开发（窗口出现即服务已启动）
scripts/build-android.sh       # 构建 debug APK（首次需 pnpm tauri android init）
scripts/install-android.sh     # adb install -r + 启动
scripts/package-release.sh     # 先安卓后桌面 → release/（覆盖同名文件）
scripts/publish-release.sh     # 上传 GitHub Releases（分发入口；流程见 docs/engineering/release.md）
pnpm typecheck && pnpm lint && pnpm test && pnpm build
node scripts/check-docs.mjs && node scripts/check-boundaries.mjs
node scripts/qa-desktop-ios.mjs   # 桌面全页截图（需先 pnpm dev）
node scripts/qa-memo.mjs          # 备忘录两端截图 + CDP 走查
```

环境（macOS arm64）：Rust 1.93、Node 24 + pnpm 11、JDK 21、Android SDK 37 / NDK 27.2，详见 `docs/setup.md`。

## 6. 改完怎么验（最短路径）

1. 前端：`pnpm typecheck / lint / test / build`（Biome + Vitest）。
2. 桌面 UI：`node scripts/qa-desktop-ios.mjs` 看溢出/console error，再 `pnpm tauri dev` 目检窗口（交通灯、拖动区、滚动玻璃、深浅主题、菜单栏看板）。
3. 手机：`scripts/build-android.sh && scripts/install-android.sh`，真机确认自动发现→连接→收发；UI 用 `scripts/qa-memo.mjs` 与浏览器 `?role=mobile`（320/390 × 浅深）。
4. 无头验证：`docs/setup.md`「WebView 远程调试」用 CDP 调命令 + `adb exec-out screencap -p` 截图。
5. 改协议：`protocol/README.md`、Rust、两端解析三处同步；改完跑文档与边界检查。

## 7. 最常踩的 10 个坑（详情见 `docs/engineering/pitfalls.md`）

1. 不要给 `<body>` 加平台状态类；桌面/手机是两个独立 entry（历史上这样整页黑屏）。
2. 主题：`index.html` 内联防闪脚本必须在最前；`data-theme` 与 `.dark` 必须双写（`shared/lib/theme.ts`）。
3. WebView 103 不支持 `oklch`/`dvh`/`color-mix`/CSS `translate` 属性——颜色用 hex，居中用 flex/`mx-auto`，不要 `-translate-x-1/2`。
4. 广播回显：发送后不要本地追加，等服务端广播，按 `from` 判 me/them。
5. 关窗 = 隐藏窗口（D88），唯一退出是菜单栏右键；关窗后 `Accessibility`/`Regular` 策略随窗口切换（D112）。
6. 打包顺序不能反：先 APK 后 DMG，桌面 `build.rs` 编译期把 APK 嵌进二进制。
7. `release/` 不入库（D125）；安装包走 GitHub Releases；debug APK 120–314MB，绝不入库。
8. Android 16+ 要 `ACCESS_LOCAL_NETWORK` 运行时权限，缺了表现为「发现 0 台 / 连接超时」，但 `curl` 能通（D72）；企业网可能只放行单播，mDNS 也救不了（D73）。
9. Android 返回键：新增全屏页面必须 `pushBackHandler`，否则按返回被根页面当成退出确认。
10. 桌面看板/玻璃/面板窗口的坑（CSS 权重、留白、`macos-private-api`、只铺卡片区）改动前先读 pitfalls §7。

## 8. 协作约定

- 用户中文母语：沟通用中文、直白、先结论；环境配置由 AI 代劳，**破坏性操作（删库、重置、卸载、force push）先问**。
- Git：提交信息中文（`type(scope): 中文摘要`）；push 前跑完 quality 命令；`force push`/改可见性先确认；规则见 `docs/standards/git.md`。
- 平台边界：`mobile` 不 import `desktop`，反之亦然，`shared` 不 import 两者；前端规范 `docs/frontend-architecture.md`，依赖准入 `docs/dependency-policy.md`。
- 重大取舍追加到 `docs/decisions.md`；新踩的坑写进 `docs/engineering/pitfalls.md`；不要往 AGENTS.md 里堆流水账。
- 不提交构建产物（`app/dist`、`node_modules`、`target`、`gen/`、APK/DMG）；`release/` 也不再入库。

## 9. 下一步

按 `docs/status.md §4` 排序执行：真机/目检回归（桌面窗口、手机 C 手势、备忘录配对同步）→ 手机回答 AI 提问 → 配对鉴权与正式签名 → BLE / iOS。路线变更先改 `docs/product/scope.md` 与 `docs/status.md`。
