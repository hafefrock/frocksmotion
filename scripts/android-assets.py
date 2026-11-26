#!/usr/bin/env python3
"""Buat ikon dan layar pembuka FROCKSMOTION langsung dari kode, tanpa file gambar.

Pemakaian: python3 scripts/android-assets.py android/app/src/main/res
Dijalankan oleh workflow Build APK setelah folder android dibuat.
"""
import os
import sys

from PIL import Image, ImageDraw

BG = (32, 37, 47, 255)  # #20252f
WHITE = (238, 241, 246, 255)
PINK = (255, 79, 139, 255)
SS = 4  # gambar diperbesar dulu lalu dikecilkan supaya tepinya halus

DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}


def logo(size, background=None, scale=1.0, bg_ratio=1.0):
    """Gambar huruf F di kanvas size x size. background: None, 'round', atau 'squircle'."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if background == "round":
        d.ellipse([0, 0, s - 1, s - 1], fill=BG)
    elif background == "squircle":
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)
    elif background == "full":
        d.rectangle([0, 0, s, s], fill=BG)

    k = s / 100.0

    def tr(x, y):
        return ((50 + (x - 50) * scale) * k, (50 + (y - 50) * scale) * k)

    def block(x0, y0, x1, y1, fill):
        a = tr(x0, y0)
        b = tr(x1, y1)
        d.rounded_rectangle([a[0], a[1], b[0], b[1]], radius=2.5 * scale * k, fill=fill)

    block(35, 26, 48, 74, WHITE)  # batang F
    block(35, 26, 70, 39, WHITE)  # tutup atas
    block(35, 45, 62, 56, PINK)  # garis tengah (warna aksen)
    return img.resize((size, size), Image.LANCZOS)


def remove_same_stem(path):
    """Hapus berkas lain dengan nama sama tapi ekstensi beda (misalnya .webp) supaya tidak bentrok."""
    folder, name = os.path.split(path)
    stem = os.path.splitext(name)[0]
    if not os.path.isdir(folder):
        return
    for f in os.listdir(folder):
        if os.path.splitext(f)[0] == stem and f != name:
            os.remove(os.path.join(folder, f))


def save_png(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    remove_same_stem(path)
    img.save(path, "PNG")


def main(res):
    # Ikon aplikasi: versi lama (Android di bawah 8) dan adaptif (Android 8 ke atas)
    for dens, f in DENSITIES.items():
        folder = os.path.join(res, f"mipmap-{dens}")
        save_png(logo(round(48 * f), "squircle", 1.35), os.path.join(folder, "ic_launcher.png"))
        save_png(logo(round(48 * f), "round", 1.25), os.path.join(folder, "ic_launcher_round.png"))
        save_png(logo(round(108 * f)), os.path.join(folder, "frocks_icon_fg.png"))

    adaptive = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/frocks_icon_bg" />\n'
        '    <foreground android:drawable="@mipmap/frocks_icon_fg" />\n'
        "</adaptive-icon>\n"
    )
    anydpi = os.path.join(res, "mipmap-anydpi-v26")
    os.makedirs(anydpi, exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        remove_same_stem(os.path.join(anydpi, name))
        with open(os.path.join(anydpi, name), "w", encoding="utf-8") as fh:
            fh.write(adaptive)

    values = os.path.join(res, "values")
    os.makedirs(values, exist_ok=True)
    with open(os.path.join(values, "frocks_icon.xml"), "w", encoding="utf-8") as fh:
        fh.write(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            "<resources>\n"
            '    <color name="frocks_icon_bg">#20252F</color>\n'
            "</resources>\n"
        )

    # Layar pembuka: ganti semua splash.png yang sudah ada, dengan ukuran yang sama
    count = 0
    for root, _dirs, files in os.walk(res):
        if "splash.png" in files and os.path.basename(root).startswith("drawable"):
            path = os.path.join(root, "splash.png")
            w, h = Image.open(path).size
            canvas = Image.new("RGBA", (w, h), BG)
            side = max(1, round(min(w, h) * 0.3))
            mark = logo(side, "squircle", 1.35)
            canvas.paste(mark, ((w - side) // 2, (h - side) // 2), mark)
            canvas.convert("RGB").save(path, "PNG")
            count += 1
    print(f"Ikon dibuat. Layar pembuka diganti: {count} berkas.")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "android/app/src/main/res")
