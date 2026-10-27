#!/usr/bin/env python3
"""Uygulama ikonlarını (PWA + Android legacy/adaptive) üretir."""

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZE = 1024
TEAL = (13, 148, 136)
SKY = (14, 165, 233)
WHITE = (255, 255, 255)
DARK = (15, 23, 42)
DENSITIES = (("mdpi", 48, 108), ("hdpi", 72, 162), ("xhdpi", 96, 216),
             ("xxhdpi", 144, 324), ("xxxhdpi", 192, 432))


def gradient(size, top, bottom):
    img = Image.new("RGB", (size, size), top)
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (size, y)], fill=color)
    return img


def rounded_icon(size=SIZE):
    base = gradient(size, TEAL, SKY).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.225, fill=255)
    base.putalpha(mask)
    return base


def circle_icon(size=SIZE):
    base = gradient(size, TEAL, SKY).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    base.putalpha(mask)
    return base


def bus_layer(size=SIZE):
    scale = size / 1024.0
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def box(values):
        return [int(round(v * scale)) for v in values]

    def radius(value):
        return max(1, int(round(value * scale)))

    body = box([212, 300, 812, 724])
    d.rounded_rectangle(body, radius=radius(70), fill=WHITE)
    windshield = box([268, 366, 756, 520])
    d.rounded_rectangle(windshield, radius=radius(34), fill=(11, 116, 132))
    d.rounded_rectangle(box([268, 556, 470, 630]), radius=radius(26), fill=(11, 116, 132))
    d.rounded_rectangle(box([554, 556, 756, 630]), radius=radius(26), fill=(11, 116, 132))
    d.rounded_rectangle(box([444, 540, 580, 650]), radius=radius(18), fill=(226, 241, 243))

    d.ellipse(box([300, 650, 420, 770]), fill=DARK)
    d.ellipse(box([604, 650, 724, 770]), fill=DARK)
    d.ellipse(box([332, 682, 388, 738]), fill=(203, 213, 225))
    d.ellipse(box([636, 682, 692, 738]), fill=(203, 213, 225))

    d.ellipse(box([468, 214, 556, 302]), fill=WHITE)
    d.ellipse(box([488, 234, 536, 282]), fill=SKY)
    return layer


def foreground(size=SIZE, layer=None):
    layer = layer or bus_layer()
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(round(size * 0.62))
    scaled = layer.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.alpha_composite(scaled, (offset, offset))
    return canvas


def main():
    layer = bus_layer()
    composite = Image.alpha_composite(rounded_icon(), layer)

    pwa = os.path.join(ROOT, "www", "icons")
    os.makedirs(pwa, exist_ok=True)
    for size in (192, 512):
        composite.resize((size, size), Image.LANCZOS).save(os.path.join(pwa, "icon-%d.png" % size))

    android = os.path.join(ROOT, "android", "app", "src", "main", "res")
    round_composite = Image.alpha_composite(circle_icon(), layer)
    for folder, legacy, adaptive in DENSITIES:
        out = os.path.join(android, "mipmap-" + folder)
        os.makedirs(out, exist_ok=True)
        composite.resize((legacy, legacy), Image.LANCZOS).save(os.path.join(out, "ic_launcher.png"))
        round_composite.resize((legacy, legacy), Image.LANCZOS).save(os.path.join(out, "ic_launcher_round.png"))
        foreground().resize((adaptive, adaptive), Image.LANCZOS).save(
            os.path.join(out, "ic_launcher_foreground.png"))

    anydpi = os.path.join(android, "mipmap-anydpi-v26")
    os.makedirs(anydpi, exist_ok=True)
    adaptive_xml = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
"""
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(os.path.join(anydpi, name), "w", encoding="utf-8") as fh:
            fh.write(adaptive_xml)
    print("icons written")


if __name__ == "__main__":
    main()
