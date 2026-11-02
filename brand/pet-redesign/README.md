# 宠物形象再设计 · 第一轮（logo-generator skill）

用刚安装的 [logo-generator](https://skills.sh/op7418/logo-generator-skill/logo-generator) skill 跑的第一轮探索：把「手机里的 AI 宠物」提炼成 6 个可缩到 16px 的**符号方向**，给后续的角色细化/动画定方向。

## 文件

| 文件 | 说明 |
| --- | --- |
| `showcase.html` | 交互展示页（自包含，双击即开）：6 个方向 + 尺寸阶梯 + 真实界面 + 自查清单 |
| `v1-peek.svg` | 01 探头：猫从程序坞后面探出头 |
| `v2-follow.svg` | 02 跟随：空心圆（用户）+ 实心点（宠物）+ 尾巴 |
| `v3-ear-heart.svg` | 03 猫心：心形 + 猫耳 |
| `v4-gaze.svg` | 04 屏幕宠物：手机屏幕当猫脸 |
| `v5-paw-heart.svg` | 05 爪印心：肉垫换成品牌珊瑚心 |
| `v6-tail-s.svg` | 06 尾巴 S：首字母 + 状态灯 |
| `showcase-preview.png` | 展示页截图（1280 宽，方便预览/贴文档） |

所有 SVG 都是 `viewBox="0 0 100 100"`、`fill/stroke="currentColor"`，可以直接内联进 React 组件用 CSS 换色，也能 `pnpm tauri icon` 生成全平台图标。

## 用到的 skill 流程

1. **Phase 1 信息收集**：品牌小跟班 Sidekick、品类 AI 桌面/手机工具、核心概念「跟随 · 陪伴 · 顺手」、色彩沿用现有 `brand/` 的靛蓝 `#5B5BD6` / 薄荷 `#34D399` / 珊瑚 `#FF7A59` / 午夜蓝 `#1E1B4B`。
2. **Phase 2 出 6 个方向**：按 skill 的几何/负空间/单焦点原则生成，每版 2–5 个形状，眼睛用 `<mask>` 挖空。
3. **Phase 3（待你反馈）**：选 1–2 个方向，再细化比例、表情、docked/handheld 姿态。
4. **Phase 4（可选）**：skill 自带 Nano Banana 展示图（12 种背景），需要 `GEMINI_API_KEY` + `pip install -r ~/.agents/skills/logo-generator/requirements.txt`，方向定了再跑。

## 复现 / 迭代

```bash
# skill 安装位置
~/.agents/skills/logo-generator

# 重新出展示页截图（需要本机 Chrome）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1280,3400 --screenshot=showcase-preview.png \
  "file://$PWD/showcase.html"
```

## 备注

- 这轮只做「符号/标记」层，不是完整角色设定（表情、三视图、动效）。需要角色设定的话，下一步建议配合 `ip-character-sheet` 那类 skill，或直接在这套几何规则上派生表情。
- 16px 测试：`v1` 的眼睛在小尺寸会糊成一条缝，`v5` 品类辨识度偏低，`v6` 单独出现时更像字母 S；`v3` / `v4` 在 16px 最稳。
