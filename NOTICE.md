# 第三方资产与例外清单（NOTICE）

本项目源码以 [MIT](./LICENSE) 许可发布。以下是**不适用 MIT** 的部分，以及随包第三方组件的声明。

## 1. 宠物形象：BoopFace（代码 MIT，角色形象不随 MIT 转让）

| 项 | 说明 |
| --- | --- |
| 组件 | `boopface@0.8.0`（`app/package.json` 精确锁版本），原生 Web Component，零运行时依赖 |
| 来源 | [CX-ArtLab/BoopFace](https://github.com/CX-ArtLab/BoopFace)，MIT License，© CX ArtLab |
| 使用范围 | 只作为 App 内的手机宠物形象（皮肤 201）；不修改角色设计，不单独再分发角色素材 |
| 权利边界 | MIT 只覆盖**软件与源码**；项目方明确保留 BoopFace 的名称、角色身份与视觉形象，不授权把它们当作他方原创角色或独立品牌。本项目因此**不宣称**该角色为 Sidekick 原创，也不把它做成独立 IP/周边 |
| 如何替换 | 换皮肤只改 `app/src/mobile/features/pet/boop-pet.tsx` 的 `PET_SKIN`；换渲染器见 [decisions.md](./docs/decisions.md) D136 |
| 说明 | 2026-11-14 起，原「DeepSeek 鲸鱼 OpenPets 图集」（无 LICENSE）已从包内移除，历史记录见 [brand/pet-character/openpet-review](./brand/pet-character/openpet-review/README.md) |

`brand/logo-*`、`brand/appicon.png` 与本项目生成的品牌标记属于本项目，随 MIT 授权。

## 2. 随包字体：HarmonyOS Sans SC

- 文件：`app/src/mobile/assets/fonts/HarmonyOS_SansSC_Regular.ttf`（原始 TTF，未修改、未子集化）
- 版权：© 2021 Huawei Device Co., Ltd.，依据《HarmonyOS Sans Fonts License Agreement》授权
- 许可全文：[app/src/mobile/assets/fonts/LICENSE_Fonts](./app/src/mobile/assets/fonts/LICENSE_Fonts)
- 遵循的许可条件：App 内注明使用（手机「设置 › 数据与关于」）；不修改字体文件；不单独再分发或销售字体；保留版权声明与协议全文（本文件 + 上述链接）。
- 结论：字体**不属于 MIT 代码许可**，随 App 分发受其自身许可约束。

## 3. 开源依赖（简介）

代码依赖均采用宽松许可，具体版本与许可以 `app/pnpm-lock.yaml` / `app/src-tauri/Cargo.lock` 及各包 `LICENSE` 为准。

| 类别 | 主要组件 | 许可 |
| --- | --- | --- |
| 前端框架/样式 | React、Tailwind CSS、shadcn/ui（Base UI `base-nova`）、Motion、Zustand | MIT |
| 图标 | lucide-react | ISC |
| 扫码解码 | jsqr | Apache-2.0 |
| 桌面/移动框架 | Tauri 2、wry、tao | MIT / Apache-2.0 |
| Rust 服务 | axum、tokio、tokio-tungstenite、reqwest、serde | MIT / Apache-2.0 |
| 本机能力 | arboard、core-graphics、rusqlite、objc2 | MIT / Apache-2.0 |
| 测试 | Vitest、Testing Library、Biome | MIT |

若你新增依赖，按 [docs/dependency-policy.md](./docs/dependency-policy.md) 的准入规则同步更新本清单。

## 4. 名称说明

「Sidekick」是本项目的英文代号，「小跟班」是手机宠物角色名。项目与 GitHub 上其它同名产品（例如浏览器扩展 Sidekick 等）没有关联。
