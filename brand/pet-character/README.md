# 宠物 Q 版形象 · 第一轮（分层 SVG）

给手机端宠物页做的**角色形象**探索，不是品牌 logo。三个方向都是单独可编辑的分层 SVG，目标是能直接替换现有 `pet-fallback` 的艺术层。

## 文件

| 文件 | 说明 |
| --- | --- |
| `character-sheet.html` | 对照页（自包含，双击即开）：三方向 + 分层拆解 + 表情演示 + 选型建议 |
| `character-sheet-preview.png` | 对照页截图 |
| `a-mochi-cat.svg` | A · 麻薯猫猫：奶油色、大圆头、尖耳、卷尾巴 |
| `b-mochi-bean.svg` | B · 豆豆泥人：无物种圆豆子、头顶嫩芽、嫩芽尾巴 |
| `c-pocket-monster.svg` | C · 口袋小怪兽：薰衣草紫、薄荷小角、獠牙笑、铲形尾巴 |

三个文件都是 `viewBox="0 0 320 320"`、颜色走 CSS 变量（`--body` / `--shade` / `--belly` / `--ink` / `--accent`…），可以直接换主题色：

```html
<svg style="--body:#F3D6B3;--shade:#DFB78C;--belly:#FFF4E6;--ink:#3A2E3F">...</svg>
```

## 分层命名（三个方向一致）

| 组 | 用途 |
| --- | --- |
| `pet-shadow` | 地面投影：跳起缩小、落地放大 |
| `pet-tail` | 尾巴：甩尾 / 摇尾 |
| `pet-legs` | 双脚：走路 / 跳跃的落地感 |
| `pet-body` | 身体 + 肚皮：呼吸缩放、squash & stretch、前倾 |
| `pet-arms` | 双手：举爪 / 招手 / 抱东西 |
| `pet-head` | 头 + 耳朵/角：歪头、点头、耳朵下垂 |
| `pet-face` | 眼睛 / 嘴 / 腮红：**表情只换这一层** |

## 进代码的建议

1. 把选中的 SVG 内联进 React（不要 `<img>`，否则拿不到分组和 `currentColor`/CSS 变量）。
2. 用 `mood` / `aiState` 切 `pet-face` 里的 cicle/path；身体层保持不动，保证“还是同一只”。
3. 动效先用 CSS：`transform-origin` 分别设在脖子、尾巴根、脚底；呼吸用 `scaleY`，甩尾用 `rotate`。
4. 真机 60fps 有压力或需要骨骼动画时，再把同一套分层图导入 Rive，命名与 `docs/standards/visual.md` §6 的输入对齐。

## 复现截图

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1280,4200 --screenshot=character-sheet-preview.png \
  "file://$PWD/character-sheet.html"
```

## 备注

- 这轮是角色美术方向，不涉及 PRD 里的黏土风格约束；三个方向各自给了独立配色。
- 表情演示目前只做了 A 的 4 个脸（平静 / 开心 / 困 / 惊讶），定方向后再把整套表情和姿态补齐。
