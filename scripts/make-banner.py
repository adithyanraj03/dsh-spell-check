"""
Generate the README banners.

Deliberately scripted rather than image-generated: a banner is a logo, a
wordmark, a tagline and the real screenshots, and a diffusion model renders text
and UI chrome badly. Pillow gives crisp type and exact colours.

    python scripts/make-banner.py                     # the default variant, both themes
    python scripts/make-banner.py --variant A         # one variant, both themes
    python scripts/make-banner.py --variant B --theme dark --suffix=-B

The variants differ only in how the screenshots are arranged:

    A  stacked   — two cards, one above the other, with a clear gap
    B  hero      — one large card, the whole right half
    C  layered   — two cards offset and overlapping, like the sibling repos

Nothing is rotated: a tilted screenshot reads as a mock-up, and the point of
putting a screenshot in the banner is that it is the real thing.
"""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICON = ROOT / "assets" / "icon.png"
MENU = ROOT / "assets" / "menu.png"
STRIP = ROOT / "assets" / "strip.png"
OUT = ROOT / "assets"

W, H = 1400, 460

LIGHT = {
    "bg": (247, 246, 250),
    "glow": (232, 229, 242),
    "title": (26, 22, 36),
    "tag": (92, 86, 108),
    "accent": (232, 72, 77),
    "edge": (0, 0, 0, 30),
    "shadow": (24, 20, 36, 64),
}
DARK = {
    "bg": (18, 18, 22),
    "glow": (32, 30, 42),
    "title": (245, 244, 248),
    "tag": (152, 148, 168),
    "accent": (255, 106, 110),
    "edge": (255, 255, 255, 32),
    "shadow": (0, 0, 0, 140),
}

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\SegoeUI.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
]
MONO_CANDIDATES = [
    r"C:\Windows\Fonts\consola.ttf",
    r"C:\Windows\Fonts\cour.ttf",
]

# Tighter than the raw stills: the interesting part of each capture is the popup
# plus the line it belongs to, and cropping to that makes a card twice as tall at
# the same width — which is the whole point of the banner.
CROPS = {
    "menu": (400, 0, 1350, 314),   # 950 x 314
    "strip": (150, 0, 1150, 260),  # 1000 x 260
}

LAYOUTS = {
    # name: (width, x, y). Top-left of each card; every right edge stays inside
    # 1400 with a margin, and no card is ever clipped by the canvas.
    "A": {"menu": (690, 690, 10), "strip": (700, 690, 248)},
    "B": {"strip": (900, 470, 126)},
    "C": {"menu": (700, 676, 16), "strip": (700, 700, 234)},
}

DEFAULT_VARIANT = "A"


def font(candidates, size):
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def rounded_glow(size, colour):
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    for step in range(size // 2, 0, -2):
        alpha = int(26 * (1 - step / (size / 2)))
        draw.ellipse(
            (size // 2 - step, size // 2 - step, size // 2 + step, size // 2 + step),
            fill=colour + (alpha,),
        )
    return glow


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def pad_top(image, amount):
    """
    Give a crop headroom above its content.

    The strip still was captured tight to the popup's rounded top, so pasting it
    straight into a card clipped those corners and the popup read as flush with
    the card edge rather than floating over the composer. The filler is the
    crop's own corner colour, which is the page background behind the composer.
    """
    if amount <= 0:
        return image
    filler = image.getpixel((0, 0))
    padded = Image.new("RGBA", (image.width, image.height + amount), filler)
    padded.paste(image, (0, amount))
    return padded


def card(path, crop, width, theme, radius=18, headroom=0):
    """A screenshot as a rounded card with its own hairline edge."""
    source = Image.open(path).convert("RGBA").crop(crop)
    source = pad_top(source, headroom)
    height = round(source.height * width / source.width)
    image = source.resize((width, height), Image.LANCZOS)

    mask = rounded_mask((width, height), radius)
    image.putalpha(mask)
    ImageDraw.Draw(image).rounded_rectangle(
        (0, 0, width - 1, height - 1), radius=radius, outline=theme["edge"], width=1
    )
    return image


def place(canvas, art, x, y, theme):
    """Composite a card with a soft shadow behind it."""
    silhouette = Image.new("RGBA", art.size, (0, 0, 0, 0))
    silhouette.paste(Image.new("RGBA", art.size, theme["shadow"]), (0, 0), art.split()[3])
    silhouette = silhouette.filter(ImageFilter.GaussianBlur(18))
    canvas.alpha_composite(silhouette, (x + 2, y + 12))
    canvas.alpha_composite(art, (x, y))


def build(theme, name, variant):
    layout = LAYOUTS[variant]
    canvas = Image.new("RGB", (W, H), theme["bg"]).convert("RGBA")
    canvas.alpha_composite(rounded_glow(460, theme["glow"]), (40, -30))

    # Screenshots before the wordmark, so no card can ever cover the text.
    for key, path in (("menu", MENU), ("strip", STRIP)):
        if key not in layout:
            continue  # a single-card layout simply omits the other
        width, x, y = layout[key]
        headroom = 26 if key == "strip" else 0
        place(canvas, card(path, CROPS[key], width, theme, headroom=headroom), x, y, theme)

    icon = Image.open(ICON).convert("RGBA")
    icon.thumbnail((168, 168), Image.LANCZOS)
    canvas.alpha_composite(icon, (46, (H - icon.height) // 2 - 4))

    draw = ImageDraw.Draw(canvas)

    title_font = font(FONT_CANDIDATES, 74)
    draw.text((232, 156), "spell check", font=title_font, fill=theme["title"])
    caret_x = 232 + draw.textlength("spell check", font=title_font) + 10
    draw.rectangle((caret_x, 168, caret_x + 6, 232), fill=theme["accent"])

    tag_font = font(MONO_CANDIDATES, 21)
    for index, line in enumerate(["Tab accepts the fix.", "Right-click for every option.", "100% local."]):
        draw.text((236, 258 + index * 29), line, font=tag_font, fill=theme["tag"])

    path = OUT / name
    canvas.convert("RGB").save(path, "PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")


parser = argparse.ArgumentParser()
parser.add_argument("--variant", default=DEFAULT_VARIANT, choices=sorted(LAYOUTS))
parser.add_argument("--theme", default="both", choices=["both", "light", "dark"])
parser.add_argument("--suffix", default="", help="appended to the filename, for comparisons")
args = parser.parse_args()

if args.theme in ("both", "dark"):
    build(DARK, f"banner-dark{args.suffix}.png", args.variant)
if args.theme in ("both", "light"):
    build(LIGHT, f"banner-light{args.suffix}.png", args.variant)
