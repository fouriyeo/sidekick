# deepseek-openpet.zip · 拆包检查

对 `~/Downloads/deepseek-openpet.zip` 的检查与预览产物。原始 zip 保持不动（4MB），这里只放拆包分析和可预览的轻量文件。

## 原始内容

```
deepseek/
├─ pet.json           5.3 KB   元数据 + 状态机
└─ spritesheet.png    4.0 MB   4096 × 1024 RGBA 图集
```

- 格式：**OpenPets / Codex schema 2**（`grid.cell=256`、`cols=16`、`states` 按行、`transitions` 用 `task:start` / `task:need-approval` / `task:completed` 事件驱动）。
- 角色 label：`大肥鱼`；从配色（蓝灰 `#6078A8` + 白 + 米色腮红）和轮廓看是 DeepSeek 的蓝色小鲸鱼形象，属于社区桌宠资产。
- 4 个状态 × 16 帧 = 64 帧，每帧 256×256，背景全透明：

| 状态 | 行 | 帧数 | 帧时长 | 循环 |
| --- | --- | --- | --- | --- |
| idle | 0 | 16 | 100ms | 循环 |
| working | 1 | 16 | 80ms | 循环 |
| attention | 2 | 16 | 100ms | 循环 |
| done | 3 | 16 | 100ms ×15 + 1500ms 定格 | 播一次 |

## 本目录文件

| 文件 | 说明 |
| --- | --- |
| `preview.html` | 检查报告页（自包含，双击即开）：四态 GIF、整张图集、技术评估、接入方案 |
| `preview.png` | 报告页截图 |
| `contact-sheet.png` | 64 帧缩略总览（4 行 × 16 列） |
| `idle.gif` / `working.gif` / `attention.gif` / `done.gif` | 按 pet.json 的帧序与时长还原的四段动画 |
| `pet.json` | 原文件副本，便于对照 |

## 结论速览

- **技术上可用**：动画是真的（相邻帧差异 2k–21k 像素），四态齐全，单帧 256px 对手机够用，10fps 的播放成本很低。
- **体积偏大**：4MB PNG → 解码约 16MB 内存；建议转 WebP（无损）并按状态拆 4 张懒加载。
- **品牌/授权要小心**：zip 内没有 LICENSE，角色是 DeepSeek 的鲸鱼 IP；可当占位或格式/美术参考，正式发版不建议直接使用。
- **对 Sidekick 最有价值的是格式本身**：`pet.json + 图集 + 四态 + 事件驱动` 和我们 AI 联动四态（静态 / 工作中 / 等你决定 / 完成）完全对得上，可以把这个 schema 作为我们自绘宠物的交付目标。

## 复现

```bash
# 拆包
unzip -q ~/Downloads/deepseek-openpet.zip -d /tmp/openpet

# 重新生成预览（Python + Pillow）
# 见本目录的生成脚本思路：cell=256, cols=16，按 pet.json 的 row 切行，
# contact-sheet 每格缩到 72px；GIF 用 PIL save_all + duration 列表。
```

## 相关

- [OpenPets Docs · Pets](https://docs.openpets.dev/pets/)
- 社区同类资产示例：[blue-whale-maid](https://github.com/YuSec2021/blue-whale-maid)、[deepseek-fat-fish-codex-pet](https://github.com/gmskywalker/deepseek-fat-fish-codex-pet)


## 已接入 App（2026-11-02）

这只鲸鱼已经作为手机宠物真正跑起来了，按包内 schema 2 协议驱动：

- 资产：`app/src/mobile/features/pet/assets/openpet/`（`spritesheet.webp` q85 764KB + `poster.webp` 14KB + `pet.json`，`image` 改为 webp）。
- 播放器：`sprite-pet.tsx`（rAF + ResizeObserver + 解码/尺寸校验 + poster 降级）；manifest 校验在 `sprite-manifest.ts`；状态候选链在 `sprite-state-map.ts`；帧推进纯函数在 `sprite-player.ts`。
- 四态映射：AI working → working、asking → attention、completed → done（播一次 + 末帧定格）；sleeping/listening/petting/celebrate 等为预留候选，当前资产没有对应行会自动回落 idle。
- 协议约束：一列一帧；单状态 1–32 帧、兼容 16；行号由 `states.*.row` 声明，行数可扩展、不要求连续。
- 浏览器验证截图：`app-sprite-states.png`（四态在 App 里的实际渲染；AI 状态用 dev mock `?ai=` 驱动）。
- 构建验证：图集与 poster 只进 mobile chunk（`pnpm build` 产物里 desktop chunk 不引用）；`pnpm typecheck/lint/test` 全绿（356 个测试）。

新增状态行：图集底部加一行 + `pet.json` 登记 `states.<name>`（可选调整 `sprite-state-map.ts` 候选链），渲染器不用改。
