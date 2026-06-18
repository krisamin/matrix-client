#!/usr/bin/env python3
"""Generate PWA app icons for matrix-client.

Minimal dark-theme chat bubble + typing dots, rendered crisp via 4x supersampling.
Outputs: icon-512.png, icon-192.png, apple-touch-icon.png (180), icon-maskable-512.png
"""
import os
from PIL import Image, ImageDraw

BG = (12, 12, 14, 255)        # #0c0c0e
FG = (228, 228, 231, 255)     # #e4e4e7
DOT = (12, 12, 14, 255)       # dots punched out of bubble -> bg color

SS = 4  # supersample factor
OUT = os.path.join(os.path.dirname(__file__), "..", "public")


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_icon(size, pad_ratio=0.0, bg_round=True):
    """Render an icon at `size` px. pad_ratio shrinks artwork for maskable safe area."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # background (rounded square; macOS masks it but having our own keeps maskable clean)
    if bg_round:
        r = int(S * 0.225)  # iOS-ish squircle radius
        rounded_rect(d, [0, 0, S - 1, S - 1], r, BG)
    else:
        d.rectangle([0, 0, S, S], fill=BG)

    # safe-area inset for the bubble artwork
    inset = S * (0.20 + pad_ratio)
    bx0, by0 = inset, inset
    bx1, by1 = S - inset, S - inset * 1.05
    bw = bx1 - bx0
    bh = by1 - by0

    # chat bubble body
    br = bh * 0.32
    rounded_rect(d, [bx0, by0, bx1, by1], br, FG)

    # bubble tail (bottom-left), a small triangle
    tail_w = bw * 0.16
    tail_h = bh * 0.20
    tx = bx0 + bw * 0.22
    ty = by1
    d.polygon(
        [(tx, ty - 2), (tx + tail_w, ty - 2), (tx, ty + tail_h)],
        fill=FG,
    )

    # three typing dots punched out of the bubble
    cy = by0 + bh * 0.48
    dot_r = bh * 0.085
    gap = bw * 0.22
    cx_mid = bx0 + bw * 0.5
    for dx in (-gap, 0, gap):
        cx = cx_mid + dx
        d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=DOT)

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)

    draw_icon(512).save(os.path.join(OUT, "icon-512.png"))
    draw_icon(192).save(os.path.join(OUT, "icon-192.png"))
    draw_icon(180).save(os.path.join(OUT, "apple-touch-icon.png"))
    # maskable: extra padding so safe zone (40%) isn't clipped by circular masks
    draw_icon(512, pad_ratio=0.06).save(os.path.join(OUT, "icon-maskable-512.png"))

    print("icons written to", os.path.abspath(OUT))
    for f in ("icon-512.png", "icon-192.png", "apple-touch-icon.png", "icon-maskable-512.png"):
        p = os.path.join(OUT, f)
        print(" ", f, os.path.getsize(p), "bytes")


if __name__ == "__main__":
    main()
