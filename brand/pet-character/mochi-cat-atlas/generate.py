#!/usr/bin/env python3
"""麻薯猫猫 · OpenPets schema 2 图集生成器。

用参数化的分层 SVG 画出 4 状态 × 16 帧，拼成 4096×1024 的 HTML 网格，
再用 headless Chrome 截图得到透明 PNG 图集（同 deepseek-openpet 的格式）。

用法：
  python3 generate.py            # 生成 atlas.html / pet.json / gif / contact sheet
  # 然后（Chrome 截图透明图集）：
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --window-size=4096,1024 \
    --screenshot=spritesheet.png "file://$PWD/atlas.html"
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CELL = 256
COLS = 16
STATES = ["idle", "working", "attention", "done"]

# 调色板（和 a-mochi-cat.svg 一致）
BODY = "#F3D6B3"
SHADE = "#DFB78C"
BELLY = "#FFF4E6"
EAR = "#FFC3AB"
INK = "#3A2E3F"
ACCENT = "#FF7A59"
MINT = "#7FE0C3"
AMBER = "#F5B53F"


def shadow(dy=0.0, sx=1.0, op=0.10):
    return (
        f'<g transform="translate(0,{dy:.2f})">'
        f'<ellipse cx="160" cy="292" rx="{86*sx:.2f}" ry="13" fill="#000" opacity="{op}"/>'
        f"</g>"
    )


def tail(deg=0.0):
    return (
        f'<g transform="rotate({deg:.2f} 220 250)">'
        f'<path d="M 212 250 C 256 258 284 232 272 200" fill="none" '
        f'stroke="{SHADE}" stroke-width="16" stroke-linecap="round"/></g>'
    )


def legs(dy=0.0):
    return (
        f'<g transform="translate(0,{dy:.2f})">'
        f'<ellipse cx="132" cy="282" rx="25" ry="13" fill="{SHADE}"/>'
        f'<ellipse cx="188" cy="282" rx="25" ry="13" fill="{SHADE}"/></g>'
    )


def body(dy=0.0, sx=1.0, sy=1.0):
    return (
        f'<g transform="translate(0,{dy:.2f}) translate(160,284) scale({sx:.4f},{sy:.4f}) translate(-160,-284)">'
        f'<ellipse cx="160" cy="228" rx="64" ry="56" fill="{BODY}"/>'
        f'<ellipse cx="160" cy="240" rx="40" ry="32" fill="{BELLY}"/></g>'
    )


def keyboard():
    keys = []
    for row, y in enumerate((260, 268)):
        for i in range(8):
            x = 124 + i * 9
            keys.append(
                f'<rect x="{x}" y="{y}" width="6" height="4" rx="1.4" fill="#8A86A0"/>'
            )
    return (
        '<g><rect x="114" y="254" width="92" height="22" rx="7" fill="#2E2440"/>'
        + "".join(keys)
        + "</g>"
    )


def arm(side, lift=0.0, swing=0.0):
    if side == "left":
        cx, rot = 100, -14
    else:
        cx, rot = 220, 14
    extra = f" translate(0,{lift:.2f}) rotate({swing:.2f} {cx} 226)"
    return (
        f'<ellipse cx="{cx}" cy="226" rx="14" ry="20" fill="{BODY}" '
        f'transform="rotate({rot} {cx} 226){extra}"/>'
    )


def arms(lift_l=0.0, lift_r=0.0, swing_l=0.0, swing_r=0.0):
    return f"<g>{arm('left', lift_l, swing_l)}{arm('right', lift_r, swing_r)}</g>"


def ear(side, deg=0.0):
    if side == "left":
        pivot, outer, inner = (140, 66), "M 106 24 L 146 66 L 96 72 Z", "M 108 36 L 130 60 L 104 64 Z"
    else:
        pivot, outer, inner = (180, 66), "M 214 24 L 174 66 L 224 72 Z", "M 212 36 L 190 60 L 216 64 Z"
    return (
        f'<g transform="rotate({deg:.2f} {pivot[0]} {pivot[1]})">'
        f'<path d="{outer}" fill="{BODY}" stroke="{BODY}" stroke-width="18" stroke-linejoin="round"/>'
        f'<path d="{inner}" fill="{EAR}" stroke="{EAR}" stroke-width="8" stroke-linejoin="round"/></g>'
    )


def face(kind):
    cheeks = (
        f'<ellipse cx="112" cy="150" rx="11" ry="6" fill="{ACCENT}" opacity=".32"/>'
        f'<ellipse cx="208" cy="150" rx="11" ry="6" fill="{ACCENT}" opacity=".32"/>'
    )
    if kind == "blink":
        return (
            f'<path d="M 126 132 Q 134 137 142 132" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'
            f'<path d="M 178 132 Q 186 137 194 132" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'
            f'<path d="M 152 158 Q 156 162 160 158 Q 164 162 168 158" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
            + cheeks
        )
    if kind == "focus":
        return (
            f'<ellipse cx="134" cy="134" rx="8" ry="6" fill="{INK}"/>'
            f'<ellipse cx="186" cy="134" rx="8" ry="6" fill="{INK}"/>'
            f'<circle cx="136.5" cy="132" r="2.4" fill="#fff" opacity=".85"/>'
            f'<circle cx="188.5" cy="132" r="2.4" fill="#fff" opacity=".85"/>'
            f'<path d="M 124 120 L 142 124" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
            f'<path d="M 196 120 L 178 124" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
            f'<path d="M 155 160 Q 160 164 165 160" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
            + cheeks
        )
    if kind == "wide":
        return (
            f'<ellipse cx="134" cy="130" rx="9" ry="12" fill="{INK}"/>'
            f'<ellipse cx="186" cy="130" rx="9" ry="12" fill="{INK}"/>'
            f'<circle cx="137" cy="125" r="3.4" fill="#fff" opacity=".95"/>'
            f'<circle cx="189" cy="125" r="3.4" fill="#fff" opacity=".95"/>'
            f'<ellipse cx="160" cy="160" rx="4.5" ry="5.5" fill="{INK}"/>'
            f'<path d="M 120 112 Q 134 106 146 112" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
            f'<path d="M 200 112 Q 186 106 174 112" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
            + cheeks
        )
    if kind == "happy":
        return (
            f'<path d="M 126 134 Q 134 122 142 134" fill="none" stroke="{INK}" stroke-width="4.5" stroke-linecap="round"/>'
            f'<path d="M 178 134 Q 186 122 194 134" fill="none" stroke="{INK}" stroke-width="4.5" stroke-linecap="round"/>'
            f'<path d="M 148 156 Q 160 172 172 156 Z" fill="{INK}"/>'
            f'<path d="M 156 162 Q 160 168 164 162 Z" fill="{ACCENT}"/>'
            + cheeks
        )
    # normal
    return (
        f'<ellipse cx="134" cy="130" rx="8" ry="10" fill="{INK}"/>'
        f'<ellipse cx="186" cy="130" rx="8" ry="10" fill="{INK}"/>'
        f'<circle cx="137" cy="126" r="3" fill="#fff" opacity=".9"/>'
        f'<circle cx="189" cy="126" r="3" fill="#fff" opacity=".9"/>'
        f'<path d="M 156 146 Q 160 150 164 146 Q 162 153 160 153 Q 158 153 156 146 Z" fill="{ACCENT}"/>'
        f'<path d="M 152 158 Q 156 162 160 158 Q 164 162 168 158" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
        + cheeks
    )


def head(dx=0.0, dy=0.0, rot=0.0, ear_l=0.0, ear_r=0.0, face_kind="normal"):
    return (
        f'<g transform="translate({dx:.2f},{dy:.2f}) rotate({rot:.2f} 160 204)">'
        + ear("left", ear_l)
        + ear("right", ear_r)
        + f'<ellipse cx="160" cy="128" rx="80" ry="72" fill="{BODY}"/>'
        + face(face_kind)
        + "</g>"
    )


def sweat(op):
    if op <= 0:
        return ""
    return (
        f'<path d="M 248 120 C 253 130 256 136 256 141 C 256 147 252 151 248 151 '
        f'C 244 151 240 147 240 141 C 240 136 243 130 248 120 Z" fill="#7FC7E8" opacity="{op:.2f}"/>'
    )


def speed_lines(op):
    if op <= 0:
        return ""
    lines = [(96, 120, 74, 112), (94, 170, 72, 178), (226, 120, 248, 112), (228, 170, 250, 178)]
    out = "".join(
        f'<path d="M {x1} {y1} L {x2} {y2}" stroke="{SHADE}" stroke-width="4" stroke-linecap="round" opacity="{op:.2f}"/>'
        for x1, y1, x2, y2 in lines
    )
    return f"<g>{out}</g>"


def exclaim(bob=0.0):
    return (
        f'<g transform="translate(246,{14+bob:.2f}) rotate(-10 0 0)">'
        f'<rect x="-7" y="0" width="14" height="32" rx="7" fill="{ACCENT}"/>'
        f'<circle cx="0" cy="46" r="7.5" fill="{ACCENT}"/></g>'
    )


PARTICLES = [
    (84, 0.05, ACCENT),
    (118, 0.30, MINT),
    (150, 0.55, AMBER),
    (182, 0.15, "#FFFFFF"),
    (214, 0.40, ACCENT),
    (244, 0.65, MINT),
    (104, 0.75, AMBER),
    (206, 0.85, "#FFFFFF"),
]


def confetti(f):
    out = []
    for px, phase, color in PARTICLES:
        y = 20 + ((f * 26 + phase * 240) % 260)
        if y > 268:
            continue
        x = px + 10 * math.sin(f / 2.2 + phase * 6.0)
        rot = f * 22 + phase * 180
        out.append(
            f'<rect x="-5" y="-2.5" width="10" height="5" rx="1.5" fill="{color}" '
            f'transform="translate({x:.1f},{y:.1f}) rotate({rot:.0f})"/>'
        )
    return "<g>" + "".join(out) + "</g>"


def character(state, f, face_kind, char_dy=0.0, body_sx=1.0, body_sy=1.0,
              body_dy=0.0, head_dx=0.0, head_dy=0.0, head_rot=0.0,
              ear_l=0.0, ear_r=0.0, tail_deg=0.0,
              lift_l=0.0, lift_r=0.0, swing_l=0.0, swing_r=0.0,
              shadow_sx=1.0, prop="", prop_back=""):
    parts = [prop_back, shadow(0, shadow_sx), tail(tail_deg)]
    if state == "working":
        parts.append(legs(0))
        parts.append(body(body_dy, body_sx, body_sy))
        parts.append(keyboard())
        parts.append(arms(lift_l, lift_r, swing_l, swing_r))
    else:
        parts.append(legs(char_dy))
        parts.append(body(body_dy, body_sx, body_sy))
        parts.append(arms(lift_l, lift_r, swing_l, swing_r))
    parts.append(head(head_dx, head_dy, head_rot, ear_l, ear_r, face_kind))
    parts.append(prop)
    inner = "".join(parts)
    # 整体左移 18，让尾巴带来的重心偏移在 256 格子里居中
    return f'<g transform="translate(-18,{char_dy:.2f})">{inner}</g>'


def frame_svg(state, f):
    t = 2 * math.pi * f / 16
    if state == "idle":
        b = math.sin(t)
        body_sy = 1 + 0.014 * b
        body_sx = 1 - 0.010 * b
        head_dy = -2.5 * b
        head_rot = 1.4 * math.sin(t + 0.6)
        tail_deg = 7 * math.sin(t + 0.8)
        face_kind = "blink" if f in (7, 8) else "normal"
        return character("idle", f, face_kind, body_sx=body_sx, body_sy=body_sy,
                         head_dy=head_dy, head_rot=head_rot, tail_deg=tail_deg,
                         lift_l=1.5 * b, lift_r=1.5 * b,
                         shadow_sx=1 - 0.012 * b)
    if state == "working":
        bounce = abs(math.sin(math.pi * f / 8))
        body_dy = -2.5 * bounce
        body_sy = 1 + 0.010 * bounce
        body_sx = 1 - 0.008 * bounce
        head_rot = 3.5
        head_dy = 2.0
        typing = math.sin(t * 2)
        tail_deg = 4 * math.sin(t)
        prop = speed_lines(0.32 if f % 4 < 2 else 0.0) + sweat(0.9 if 4 <= f <= 11 else 0.0)
        return character("working", f, "focus", body_dy=body_dy,
                         body_sx=body_sx, body_sy=body_sy,
                         head_dy=head_dy, head_rot=head_rot, tail_deg=tail_deg,
                         lift_l=-2 + 3 * typing, lift_r=-2 - 3 * typing,
                         swing_l=6 * typing, swing_r=-6 * typing,
                         shadow_sx=1 - 0.008 * bounce, prop=prop)
    if state == "attention":
        bob = math.sin(t)
        body_dy = -4 + 1.5 * bob
        head_rot = -2 + 2 * bob
        tail_deg = 14 * math.sin(t * 2)
        prop = exclaim(bob * 3)
        return character("attention", f, "wide", body_dy=body_dy,
                         head_rot=head_rot, tail_deg=tail_deg,
                         lift_l=-4, lift_r=-24, swing_l=0, swing_r=-34,
                         shadow_sx=1 - 0.02 * abs(bob), prop=prop)
    # done
    if f <= 7:
        jump = -12 * math.sin(math.pi * f / 8)
        char_dy = jump
        shadow_sx = 0.86 + 0.10 * (f / 8)
        face_kind = "happy"
        arms_up = True
        body_sx, body_sy = 1.0, 1.0 + 0.02
        settle = 0.0
    elif f == 8:
        char_dy = 3
        shadow_sx = 1.05
        face_kind = "happy"
        arms_up = False
        body_sx, body_sy = 1.12, 0.86
        settle = 0.0
    else:
        k = f - 8
        char_dy = 3 - 4 * math.exp(-k / 2.4) * math.cos(k * 1.2)
        shadow_sx = 1.0
        face_kind = "happy"
        arms_up = k < 2
        body_sx, body_sy = 1.0, 1.0
        settle = 0.0
    return character("done", f, face_kind, char_dy=char_dy,
                     body_sx=body_sx, body_sy=body_sy,
                     head_rot=0 if f <= 7 else 2 * math.sin(f),
                     tail_deg=8 * math.sin(t) if f <= 7 else 0,
                     lift_l=-14 if arms_up else -4,
                     lift_r=-14 if arms_up else -4,
                     shadow_sx=shadow_sx) + confetti(f)


def build():
    cells = []
    for state in STATES:
        for f in range(16):
            inner = frame_svg(state, f)
            cells.append(
                f'<div class="cell"><svg width="{CELL}" height="{CELL}" viewBox="0 0 320 320" '
                f'xmlns="http://www.w3.org/2000/svg">{inner}</svg></div>'
            )
    html = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'><style>"
        "html,body{margin:0;padding:0;background:transparent;}"
        f"#atlas{{display:grid;grid-template-columns:repeat({COLS},{CELL}px);"
        f"grid-auto-rows:{CELL}px;width:{COLS*CELL}px;height:{4*CELL}px;}}"
        "svg{display:block}"
        "</style></head><body><div id='atlas'>"
        + "".join(cells)
        + "</div></body></html>"
    )
    open(os.path.join(HERE, "atlas.html"), "w").write(html)

    frames = [{"col": i, "duration": 100} for i in range(16)]
    working_frames = [{"col": i, "duration": 80} for i in range(16)]
    done_frames = [{"col": i, "duration": 100} for i in range(15)] + [{"col": 15, "duration": 1500}]
    pet = {
        "schema": 2,
        "id": "mochi-cat",
        "label": "麻薯猫猫",
        "image": "spritesheet.png",
        "width": CELL,
        "height": CELL,
        "grid": {"cell": CELL, "cols": COLS},
        "defaultState": "idle",
        "states": {
            "idle": {"row": 0, "frames": frames},
            "working": {"row": 1, "frames": working_frames},
            "attention": {"row": 2, "frames": frames},
            "done": {"row": 3, "frames": done_frames, "loop": {"mode": "once"}},
        },
        "transitions": [
            {"from": "*", "on": "task:start", "to": "working"},
            {"from": "*", "on": "task:need-approval", "to": "attention"},
            {"from": "attention", "on": "task:approved", "to": "working"},
            {"from": "*", "on": "task:completed", "to": "done"},
            {"from": "done", "on": "$finish", "to": "idle"},
            {"from": "*", "on": "$reset", "to": "idle"},
        ],
    }
    json.dump(pet, open(os.path.join(HERE, "pet.json"), "w"), ensure_ascii=False, indent=2)
    print("wrote atlas.html + pet.json")


if __name__ == "__main__":
    build()
