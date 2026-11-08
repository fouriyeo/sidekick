# 第三方资产与例外清单（NOTICE）

本项目源码以 [MIT](./LICENSE) 许可发布。以下是**不适用 MIT** 的部分，以及随包第三方组件的声明。

## 1. 例外：宠物演示图集（不在 MIT 范围内）

| 项 | 说明 |
| --- | --- |
| 文件 | `app/src/mobile/features/pet/assets/openpet/{pet.json,spritesheet.webp,poster.webp}`、`brand/pet-character/openpet-review/pet.json` |
| 来源 | 社区流传的 DeepSeek 鲸鱼形象 OpenPets / Codex schema 2 图集（原始 zip `deepseek-openpet.zip` 内**没有 LICENSE**）；拆包记录见 [brand/pet-character/openpet-review](./brand/pet-character/openpet-review/README.md) |
| 权利状态 | 角色形象可能归 DeepSeek 所有；本项目**未取得明示授权**，随仓库提供仅作格式演示与本地体验用途 |
| 许可结论 | **不受 MIT 覆盖**；fork / 二次分发 / 商业使用前，请替换为自己的 OpenPets schema 2 图集，或先取得权利人许可 |
| 如何替换 | 图集放 `app/src/mobile/features/pet/assets/openpet/`，保留 `pet.json` 格式（一列一帧、单状态 ≤32 帧）；渲染器无需改动，缺行会回落 idle |

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
