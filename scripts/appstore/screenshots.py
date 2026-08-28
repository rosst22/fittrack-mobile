#!/usr/bin/env python3
"""Turn raw iPhone screenshots into App Store listing images.

Three jobs:

1. Redraw the status bar. Raw captures carry whatever the phone happened to be
   showing — a 10% battery in red, a sleep-focus icon, a real clock. Every
   shipping app replaces this with the canonical 9:41 / full bars / full
   battery. It is cosmetic chrome, not app content, so editing it is fine;
   editing anything *inside* the app would misrepresent the product and is not
   done here.

2. Drop the system alert that covered the top of the dashboard capture.

3. Composite onto a branded canvas with a caption, which is what the top of a
   Health & Fitness search result looks like.

Input:  the raw 1290x2796 captures in <dir>/raw/
Output: finished images written next to them in <dir>/

Usage: python3 scripts/appstore/screenshots.py [dir]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1290, 2796
BG_DARK = (7, 7, 7)
BG_TINT = (13, 20, 16)
APP_BG = (10, 10, 10)
ACCENT = (34, 197, 94)
WHITE = (255, 255, 255)

BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

# Caption per file, and how far down to paint over the original's top chrome.
# 03 needs a deeper cover because a "10% Battery" alert sat below the status bar.
PLATES = [
    ("01.png", "Point your camera", "at any meal", 185),
    ("02.png", "Macros filled in", "automatically", 185),
    # The alert's red glow ring bleeds down to row 315; the nav bar starts at
    # ~352, so 332 clears the glow without eating any app chrome.
    ("03.png", "Your whole day,", "one screen", 332),
    ("04.png", "Two weeks of", "real trends", 185),
    ("05.png", "Every session,", "logged", 185),
]


def status_bar(img: Image.Image, cover_to: int) -> None:
    """Paint out the top chrome and draw a clean status bar in its place."""
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, cover_to], fill=APP_BG)

    cy = 124  # vertical centre of the status bar row
    d.text((118, cy), "9:41", font=ImageFont.truetype(BOLD, 46), fill=WHITE, anchor="lm")

    # Cellular — four ascending bars, bottom-aligned.
    x, base = 995, 139
    for i, h in enumerate((13, 19, 25, 31)):
        d.rounded_rectangle([x + i * 14, base - h, x + i * 14 + 9, base], radius=3, fill=WHITE)

    # Wi-Fi — three nested arcs over a dot.
    wx, wy = 1082, 141
    for r, wdt in ((34, 8), (22, 8), (10, 8)):
        d.arc([wx - r, wy - r, wx + r, wy + r], start=213, end=327, fill=WHITE, width=wdt)

    # Battery — full, white, with the little terminal nub.
    d.rounded_rectangle([1112, 106, 1176, 141], radius=11, outline=WHITE, width=4)
    d.rounded_rectangle([1119, 113, 1169, 134], radius=6, fill=WHITE)
    d.rounded_rectangle([1181, 117, 1187, 130], radius=3, fill=WHITE)


def backdrop() -> Image.Image:
    """Vertical tint plus an additive green bloom up top."""
    grad = Image.new("RGB", (1, H))
    gd = ImageDraw.Draw(grad)
    for y in range(H):
        t = y / H
        gd.point((0, y), fill=tuple(round(BG_TINT[i] * (1 - t) + BG_DARK[i] * t) for i in range(3)))
    base = grad.resize((W, H))

    glow = Image.new("RGB", (W, H), (0, 0, 0))
    ImageDraw.Draw(glow).ellipse([W // 2 - 640, -460, W // 2 + 640, 760], fill=(10, 54, 29))
    glow = glow.filter(ImageFilter.GaussianBlur(200))

    px, gx = base.load(), glow.load()
    for y in range(0, 1400):  # bloom only reaches the upper half
        for x in range(W):
            r, g, b = px[x, y]
            gr, gg, gb = gx[x, y]
            px[x, y] = (min(255, r + gr), min(255, g + gg), min(255, b + gb))
    return base


def round_corners(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1],
                                          radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def caption(img: Image.Image, line1: str, line2: str) -> None:
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(BOLD, 82)
    d.text((W // 2, 250), line1, font=f, fill=WHITE, anchor="mm")
    d.text((W // 2, 360), line2, font=f, fill=ACCENT, anchor="mm")


def build(src_dir: Path, out_dir: Path) -> None:
    bg = backdrop()
    screen_w = 980
    screen_x = (W - screen_w) // 2
    screen_y = 545
    radius = 58

    for name, l1, l2, cover in PLATES:
        raw = Image.open(src_dir / name).convert("RGB")
        if raw.size != (W, H):
            raw = raw.resize((W, H), Image.LANCZOS)
        status_bar(raw, cover)

        h = round(screen_w * H / W)
        shot = round_corners(raw.resize((screen_w, h), Image.LANCZOS), radius)

        plate = bg.copy()

        # Soft drop shadow so the phone lifts off the background.
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle(
            [screen_x + 10, screen_y + 22, screen_x + screen_w - 10, screen_y + h],
            radius=radius, fill=(0, 0, 0, 190))
        plate = Image.alpha_composite(
            plate.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(38)))

        plate.paste(shot, (screen_x, screen_y), shot)

        # Hairline edge, the same trick the app itself uses on cards.
        ImageDraw.Draw(plate).rounded_rectangle(
            [screen_x, screen_y, screen_x + screen_w - 1, screen_y + h - 1],
            radius=radius, outline=(44, 44, 46, 255), width=3)

        plate = plate.convert("RGB")
        caption(plate, l1, l2)
        plate.save(out_dir / name, "PNG", optimize=True)
        print(f"  ✓ {name}  {l1} {l2}")


if __name__ == "__main__":
    d = Path(sys.argv[1] if len(sys.argv) > 1 else
             Path.home() / "Desktop" / "fittrackai-appstore")
    raw = d / "raw"
    if not raw.exists():
        sys.exit(f"Expected raw captures in {raw}")
    build(raw, d)
    print(f"\nWrote {len(PLATES)} images to {d}")
