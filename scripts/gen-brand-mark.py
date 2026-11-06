#!/usr/bin/env python3
"""小跟班品牌标记「随身卡」的几何源：一组点派生全部产物。

产出：
  brand/logo-mark.svg            1024 满幅富质感版（与位图母版同源）
  brand/logo-mark-flat.svg       扁平版（小尺寸不糊）
  app/public/favicon.svg         浏览器标签页图标
  app/public/logo-icon.svg       App 内 22px 侧栏标记
  app/src-tauri/icons/tray.png   36x36 单色模板图（macOS 菜单栏自动反色）

改形状只改下面的常量，重跑本文件；App 图标母版是位图 brand/appicon.png，
换母版后另跑 `cd app && pnpm tauri icon ../brand/appicon.png`。
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
PUBLIC = ROOT / "app/public"
TRAY = ROOT / "app/src-tauri/icons/tray.png"

# ---- 几何（1024 画布，满幅无圆角；圆角遮罩交给系统）----
CX = CY = 512.0
CARD_W, CARD_H = 660.0, 700.0
RAD = 110.0          # 三个圆角
NOTCH = 170.0        # 左上斜切边长（SIM 卡 / 录音卡的机械感）
ROT = 3.5            # 卡的倾角：正的像证件，歪的像随身物
SLOT_W, SLOT_H = 330.0, 104.0   # 贴顶边的穿透挂孔 = 工卡
SLOT_X, SLOT_Y = 395.0, 248.0
DOT = (700.0, 690.0, 58.0)      # 一颗会亮的灯 = REC / 待命
GLOW_R = 168.0
EDGE_OFF = (12.0, 16.0)         # 卡身厚度偏移

# ---- 配色 ----
FIELD_TOP, FIELD_BOT, FIELD_FLAT = "#124046", "#0B2F32", "#0F3A3E"
CARD_TOP, CARD_BOT, CARD_EDGE = "#F7ECD8", "#EEDFBE", "#D8C4A0"
CARD_FLAT, SLOT_INNER, LAMP = "#F5EFE3", "#0A2E31", "#F2AA3C"

SEG = 14  # 每个圆角采样段数


def _arc(cx, cy, r, a0, a1):
    return [(cx + r * math.cos(t), cy + r * math.sin(t))
            for t in (a0 + (a1 - a0) * i / SEG for i in range(SEG + 1))]


def _rot(p):
    a = math.radians(ROT)
    x, y = p[0] - CX, p[1] - CY
    return (CX + x * math.cos(a) - y * math.sin(a), CY + x * math.sin(a) + y * math.cos(a))


def card_points(off=(0.0, 0.0)):
    """卡的外形：左上斜切，其余三个角圆角。"""
    dx, dy = off
    x0, y0 = CX - CARD_W / 2 + dx, CY - CARD_H / 2 + dy
    x1, y1 = x0 + CARD_W, y0 + CARD_H
    r = RAD
    pts = [(x0 + NOTCH, y0)]
    pts += [(x, y) for x, y in _line(x0 + NOTCH, y0, x1 - r, y0)]
    pts += _arc(x1 - r, y0 + r, r, -math.pi / 2, 0)
    pts += _line(x1, y0 + r, x1, y1 - r)
    pts += _arc(x1 - r, y1 - r, r, 0, math.pi / 2)
    pts += _line(x1 - r, y1, x0 + r, y1)
    pts += _arc(x0 + r, y1 - r, r, math.pi / 2, math.pi)
    pts += _line(x0, y1 - r, x0, y0 + NOTCH)
    return [_rot(p) for p in pts]


def _line(x0, y0, x1, y1):
    return [(x0, y0), (x1, y1)]


def slot_points():
    """挂孔：胶囊形。"""
    r = SLOT_H / 2
    x, y = SLOT_X, SLOT_Y
    pts = _line(x + r, y, x + SLOT_W - r, y)
    pts += _arc(x + SLOT_W - r, y + r, r, -math.pi / 2, math.pi / 2)
    pts += _line(x + SLOT_W - r, y + SLOT_H, x + r, y + SLOT_H)
    pts += _arc(x + r, y + r, r, math.pi / 2, math.pi * 1.5)
    return [_rot(p) for p in pts]


def circle_points(cx, cy, r):
    return [_rot((cx + r * math.cos(t), cy + r * math.sin(t)))
            for t in (2 * math.pi * i / 48 for i in range(49))]


def path(pts):
    return " ".join(f"{'M' if i == 0 else 'L'} {x:.1f} {y:.1f}" for i, (x, y) in enumerate(pts)) + " Z"


def mark(rich=True, rx=0):
    """拼一份 SVG。rich=False 时纯色、无厚度无光晕，16px 也不糊。
    rx>0 时自带圆角：浏览器不会给 favicon 加遮罩，得自己圆。"""
    if rich:
        defs = f"""
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{FIELD_TOP}"/><stop offset="1" stop-color="{FIELD_BOT}"/>
    </linearGradient>
    <linearGradient id="c" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0" stop-color="{CARD_TOP}"/><stop offset="1" stop-color="{CARD_BOT}"/>
    </linearGradient>
    <radialGradient id="l" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="{LAMP}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="{LAMP}" stop-opacity="0"/>
    </radialGradient>
  </defs>"""
        field, card = "url(#f)", "url(#c)"
        extra = (f'  <path d="{path(card_points(EDGE_OFF))}" fill="{CARD_EDGE}"/>\n'
                 f'  <circle cx="{DOT[0]:.1f}" cy="{DOT[1]:.1f}" r="{GLOW_R}" fill="url(#l)"/>\n')
    else:
        defs, field, card, extra = "", FIELD_FLAT, CARD_FLAT, ""

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" role="img" aria-labelledby="t d">{defs}
  <title id="t">小跟班 Sidekick</title>
  <desc id="d">一张随身卡：贴顶的挂孔、斜切的一角、一颗会亮的灯。</desc>
  <rect width="1024" height="1024" rx="{rx}" fill="{field}"/>
{extra}  <path d="{path(card_points())}" fill="{card}"/>
  <path d="{path(slot_points())}" fill="{SLOT_INNER}"/>
  <circle cx="{DOT[0]:.1f}" cy="{DOT[1]:.1f}" r="{DOT[2]}" fill="{LAMP}"/>
</svg>
"""


def tray_png(size=36, scale=8):
    """单色模板图：卡身实心，挂孔与灯镂空（macOS 按菜单栏自动反色）。"""
    n = size * scale
    im = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(im)
    k = n / 1024
    poly = lambda pts: [(x * k, y * k) for x, y in pts]
    d.polygon(poly(card_points()), fill=255)
    d.polygon(poly(slot_points()), fill=0)
    d.polygon(poly(circle_points(*DOT)), fill=0)
    im = im.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(Image.new("RGBA", (size, size), (0, 0, 0, 255)), (0, 0), im)
    TRAY.parent.mkdir(parents=True, exist_ok=True)
    out.save(TRAY)


# ---- Android 自适应图标：背景层纯色 + 前景层只放主体并留安全区 ----
RES = ROOT / "app/src-tauri/gen/android/app/src/main/res"
DENSITIES = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
SAFE = 0.60  # 主体占前景层的比例；Android 建议内容落在中间 66dp / 108dp 内


def rgb(hex_str):
    return tuple(int(hex_str[i:i + 2], 16) for i in (1, 3, 5))


def foreground_layer(n):
    """前景层：卡身（挂孔镂空露出背景色）+ 琥珀灯，透明底，主体居中留安全区。"""
    im = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon(card_points(), fill=rgb(CARD_FLAT) + (255,))
    d.polygon(slot_points(), fill=(0, 0, 0, 0))
    cx, cy, r = DOT
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=rgb(LAMP) + (255,))
    im = im.crop(im.getbbox())
    s = n * SAFE / max(im.size)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    layer = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    layer.paste(im, ((n - im.width) // 2, (n - im.height) // 2), im)
    return layer


def android_adaptive():
    if not RES.exists():
        return "gen/android 不存在：先 `pnpm tauri android init` + `pnpm tauri icon`，再重跑本脚本"
    (RES / "values/ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        f'  <color name="ic_launcher_background">{FIELD_FLAT}</color>\n'
        '</resources>\n'
    )
    n = 0
    for name, size in DENSITIES.items():
        p = RES / f"mipmap-{name}" / "ic_launcher_foreground.png"
        if p.parent.exists():
            foreground_layer(size).save(p)
            n += 1
    return f"Android 自适应：{n} 层前景重写 + 背景色 {FIELD_FLAT}"


def main():
    BRAND.mkdir(exist_ok=True)
    flat = mark(rich=False, rx=176)
    (BRAND / "logo-mark.svg").write_text(mark())
    (BRAND / "logo-mark-flat.svg").write_text(flat)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (PUBLIC / "favicon.svg").write_text(flat)
    (PUBLIC / "logo-icon.svg").write_text(flat)
    tray_png()
    print("brand/logo-mark.svg, brand/logo-mark-flat.svg, app/public/{favicon,logo-icon}.svg, icons/tray.png")
    print(android_adaptive())


if __name__ == "__main__":
    main()
