#!/usr/bin/env python3
"""生成 macOS 菜单栏（状态栏）用的单色模板图标。

来源：`brand/logo-favicon.svg` 的猫头轮廓（耳朵 + 头 + 两只眼睛镂空）。
为什么不用彩色 logo 直接缩放：macOS 模板图标只用 alpha 通道着色，
彩色图会变成一块纯色方块；菜单栏高度只有 18pt，必须去掉圆角底色、
只留高对比剪影。

输出：`app/src-tauri/icons/tray.png`，36×36 RGBA（tray-icon 会把图标
缩放到 18pt 高，36px 正好是 @2x 分辨率），像素为黑色 + alpha，
Rust 侧用 `icon_as_template(true)` 让系统按明暗菜单栏自动反色。

重新生成：`python3 scripts/gen-tray-icon.py`（只依赖 Pillow）。
"""

from pathlib import Path

from PIL import Image, ImageDraw

# favicon 坐标系（viewBox 100 44 312 312）里的猫头几何。
EARS = (
    ((196.0, 166.0), (184.0, 92.0), (250.0, 132.0)),
    ((316.0, 166.0), (328.0, 92.0), (262.0, 132.0)),
)
EAR_STROKE = 30.0
HEAD_BBOX = (136.0, 128.0, 376.0, 314.0)
EYES = (((206.0, 218.0), 21.0), ((306.0, 218.0), 21.0))

# 剪影外框（含耳朵描边外扩）：x 136..376、y 77..314。
GLYPH_BBOX = (136.0, 77.0, 376.0, 314.0)

OUT_SIZE = 36  # px，18pt @2x
SUPERSAMPLE = 4

OUT = Path(__file__).resolve().parent.parent / "app/src-tauri/icons/tray.png"


def build_mask() -> Image.Image:
    """在放大 SUPERSAMPLE 倍的画布上画 alpha 掩膜，再缩回 OUT_SIZE。"""
    _, _, gw, gh = GLYPH_BBOX
    scale = (OUT_SIZE - 2.0) / max(gw, gh)  # 四周留 1px 呼吸位
    canvas = OUT_SIZE * SUPERSAMPLE
    s = scale * SUPERSAMPLE
    ox = (canvas - gw * s) / 2 - GLYPH_BBOX[0] * s
    oy = (canvas - gh * s) / 2 - GLYPH_BBOX[1] * s

    def pt(p):
        return (ox + p[0] * s, oy + p[1] * s)

    mask = Image.new("L", (canvas, canvas), 0)
    d = ImageDraw.Draw(mask)

    # 耳朵：三角形填充 + 圆角描边（等价 favicon 的 stroke-linejoin: round）。
    for tri in EARS:
        pts = [pt(p) for p in tri]
        d.polygon(pts, fill=255)
        d.line(pts + [pts[0]], fill=255, width=round(EAR_STROKE * s), joint="curve")

    # 头：椭圆。放在耳朵之后画，盖住耳朵下沿的毛边。
    x0, y0, x1, y1 = HEAD_BBOX
    d.ellipse([pt((x0, y0))[0], pt((x0, y0))[1], pt((x1, y1))[0], pt((x1, y1))[1]], fill=255)

    # 眼睛：镂空成透明洞，模板图标下就是两个缺口。
    for (cx, cy), r in EYES:
        x, y = pt((cx, cy))
        rr = r * s
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=0)

    return mask.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)


def main() -> None:
    mask = build_mask()
    icon = Image.new("RGBA", (OUT_SIZE, OUT_SIZE), (0, 0, 0, 0))
    icon.putalpha(mask)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    icon.save(OUT, optimize=True)

    alpha = mask.load()
    covered = sum(1 for y in range(OUT_SIZE) for x in range(OUT_SIZE) if alpha[x, y] > 8)
    if covered < OUT_SIZE * OUT_SIZE * 0.15:
        raise SystemExit(f"剪影覆盖率过低（{covered}px），生成结果可能有问题")
    print(f"wrote {OUT.relative_to(OUT.parents[3])} ({OUT_SIZE}x{OUT_SIZE}, {covered} lit px)")


if __name__ == "__main__":
    main()
