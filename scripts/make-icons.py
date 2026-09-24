"""Render the Rahat OS app icons (PNG) for the web manifest.

    python scripts/make-icons.py

Drawn with Pillow at 4x and downsampled, so edges are clean without an SVG
rasteriser dependency. Mirrors app/public/assets/favicon.svg: dark tile, thin
cyan-to-blue frame, "RH" monogram. The maskable variant keeps the mark inside
the 80% safe zone so Android's circular crop never clips it.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "app" / "public" / "assets" / "icons"
BG = (5, 7, 12, 255)
C1, C2 = (34, 211, 238), (75, 141, 255)


def grad(size):
    g = Image.new("RGBA", (size, size))
    px = g.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size - 2)
            px[x, y] = tuple(int(C1[i] + (C2[i] - C1[i]) * t) for i in range(3)) + (255,)
    return g


def font(px):
    for name in ("seguisb.ttf", "segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, px)
        except OSError:
            continue
    return ImageFont.load_default()


def icon(size, maskable=False):
    S = size * 4
    img = Image.new("RGBA", (S, S), BG if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = 0 if maskable else int(S * 0.02)
    radius = 0 if maskable else int(S * 0.22)
    d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=radius, fill=BG)

    g = grad(S)
    # frame (skipped on maskable — the platform supplies the shape)
    if not maskable:
        m = Image.new("L", (S, S), 0)
        md = ImageDraw.Draw(m)
        inset = int(S * 0.075)
        md.rounded_rectangle([inset, inset, S - inset, S - inset], radius=int(S * 0.17), outline=150, width=max(4, int(S * 0.028)))
        img.paste(g, (0, 0), m)

    # monogram
    scale = 0.36 if maskable else 0.44
    m = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(m)
    f = font(int(S * scale))
    box = md.textbbox((0, 0), "RH", font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    md.text(((S - w) / 2 - box[0], (S - h) / 2 - box[1]), "RH", font=f, fill=255)
    img.paste(g, (0, 0), m)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for s in (192, 512):
        icon(s).save(OUT / f"icon-{s}.png", optimize=True)
    icon(512, maskable=True).save(OUT / "maskable-512.png", optimize=True)
    icon(180, maskable=True).save(OUT / "apple-touch-icon.png", optimize=True)
    print("icons written to", OUT)
