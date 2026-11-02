# 麻薯猫猫 · OpenPets schema 2 图集

A 路线产物：把 [a-mochi-cat.svg](../a-mochi-cat.svg) 参数化成 **4 状态 × 16 帧 = 64 帧**，输出成和 `deepseek-openpet.zip` **完全同款**的格式（schema 2 / 16 列 × 4 行 / 256px / 透明底 / pet.json 状态机）。

## 文件

| 文件 | 说明 |
| --- | --- |
| `spritesheet.png` | 4096×1024 RGBA 图集，445 KB |
| `spritesheet.webp` | 无损 WebP，177 KB（正式上线用这个） |
| `pet.json` | schema 2 元数据：grid / states / transitions，字段与 zip 内一致 |
| `generate.py` | 参数化生成器：改动作幅度、配色、表情后重跑即可出新图集 |
| `atlas.html` | 64 帧的 4096×1024 网格（截图源） |
| `preview.html` | 自包含预览页：暗色舞台上四态真实播放（JS 按 pet.json 驱动） |
| `preview.png` | 预览页截图 |
| `contact-sheet.png` | 64 帧缩略总览（4×16） |
| `idle.gif` / `working.gif` / `attention.gif` / `done.gif` | 四段还原动画 |

## 帧表

| 状态 | 行 | 帧数 | 帧时长 | 行为 |
| --- | --- | --- | --- | --- |
| idle | 0 | 16 | 100ms | 呼吸 + 眨眼（第 7/8 帧）+ 尾巴轻摆 |
| working | 1 | 16 | 80ms | 前倾、敲键盘、交替抬手、冒汗 + 速度线 |
| attention | 2 | 16 | 100ms | 起身、举右爪、瞪眼、头顶感叹号、尾巴快摇 |
| done | 3 | 16 | 100ms ×15 + 1500ms 定格 | 起跳、落地挤压、双臂上举、彩纸；末帧定格 |

状态机 transitions 与 zip 一致：`task:start → working`、`task:need-approval → attention`、`task:completed → done`（once）、`$finish/$reset → idle`。

## 已验证

- 图集 4096×1024 RGBA，背景 alpha=0；64 格全部非空。
- 无裁切：内容包围盒 行0 `y 9–243`、行1 `11–243`、行2 `8–243`、行3 `2–247`（均在 0–255 内）。
- 动画真实：相邻帧差异 idle 455–1275、working 137–731、attention 1069–2050、done 1919–13694 像素。
- 体积：PNG 445 KB / WebP 177 KB（对比鲸鱼版 4.0 MB）。

## 复现

```bash
# 1) 生成 atlas.html + pet.json
python3 generate.py

# 2) 截透明图集（macOS Chrome）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --default-background-color=00000000 --window-size=4096,1024 \
  --screenshot=spritesheet.png "file://$PWD/atlas.html"

# 3) GIF / contact sheet 见 git 历史里的 Pillow 脚本；WebP 导出：
python3 -c "from PIL import Image; Image.open('spritesheet.png').save('spritesheet.webp', lossless=True, method=6)"
```

## 接进宠物页

- `aiState` → `idle/working/asking/completed` 映射到 `idle/working/attention/done`。
- 播放器按 `pet.json` 的帧时长推进 `background-position`（和 `preview.html` 里同一套逻辑）。
- 减少动效：定格首帧；后台/录音：暂停 rAF；图集加载失败：回退现有内联 SVG 猫。
- 真机注意（见 `docs/standards/visual.md` §9）：dpr 上限 2，避免大面积 blur/shadow 动画。

## 已知局限

- 动作是**程序化关键帧**（平移/旋转/缩放参数）而不是逐帧手绘，细微晃动比专业动画略机械；要更自然需要增加帧间插值参数或后期手工修帧。
- 目前只做了 A 方向（麻薯猫猫），B/C 方向可以复用同一套生成器换部件。
