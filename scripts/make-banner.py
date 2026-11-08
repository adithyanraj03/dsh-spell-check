"""
Generate the README banners from the plugin icon.

Deliberately scripted rather than image-generated: a banner is a logo, a
wordmark and a tagline, and a diffusion model renders text badly. Pillow gives
crisp type at any size and the exact colours the rest of the project uses.

    python scripts/make-banner.py

Writes assets/banner-light.png and assets/banner-dark.png at 1400x400, matching
the sibling dsh plugin repos.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICON = ROOT / "assets" / "icon.png"
OUT = ROOT / "assets"

W, H = 1400, 400

LIGHT = {
    "bg": (247, 246, 250),
    "glow": (232, 229, 242),
    "title": (26, 22, 36),
    "tag": (92, 86, 108),
    "accent": (232, 72, 77),
}
DARK = {
    "bg": (18, 18, 22),
    "glow": (32, 30, 42),
    "title": (245, 244, 248),
    "tag": (150, 146, 165),
    "accent": (255, 106, 110),
}

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\SegoeUI.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\arial.ttf",
]
MONO_CANDIDATES = [
    r"C:\Windows\Fonts\consola.ttf",
    r"C:\Windows\Fonts\cour.ttf",
]


def font(candidates, size):
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def rounded_glow(size, colour):
    """A soft radial patch behind the icon, so it does not float on flat paint."""
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


def paste_panel(canvas, source, xy, width, radius=14, edge=(255, 255, 255, 26)):
    """Paste a screenshot as a rounded card with a soft shadow behind it."""
    image = Image.open(source).convert("RGBA")
    height = round(image.height * width / image.width)
    image = image.resize((width, height), Image.LANCZOS)
    mask = rounded_mask((width, height), radius)

    # Shadow: the same silhouette, blurred and offset.
    shadow = Image.new("RGBA", (width + 60, height + 60), (0, 0, 0, 0))
    blob = Image.new("RGBA", (width, height), (0, 0, 0, 150))
    shadow.paste(blob, (30, 34), mask)
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    canvas.alpha_composite(shadow, (xy[0] - 30, xy[1] - 30))

    canvas.paste(image, xy, mask)
    # A hairline edge: without it a dark screenshot on a dark banner melts into
    # the background and stops reading as "a screenshot".
    ImageDraw.Draw(canvas).rounded_rectangle(
        (xy[0], xy[1], xy[0] + width - 1, xy[1] + height - 1), radius=radius, outline=edge, width=1
    )


def build(theme, name):
    canvas = Image.new("RGB", (W, H), theme["bg"]).convert("RGBA")

    glow = rounded_glow(420, theme["glow"])
    canvas.alpha_composite(glow, (60, -10))

    icon = Image.open(ICON).convert("RGBA")
    icon.thumbnail((150, 150), Image.LANCZOS)
    canvas.alpha_composite(icon, (96, (H - icon.height) // 2))

    # Two real screenshots, fanned on the right — the same idea as the sibling
    # plugin repos: show the thing, not a description of it.
    paste_panel(canvas, ROOT / "assets" / "menu.png", (776, 96), 536)
    paste_panel(canvas, ROOT / "assets" / "strip.png", (812, 226), 500)

    draw = ImageDraw.Draw(canvas)

    title_font = font(FONT_CANDIDATES, 66)
    draw.text((272, 150), "spell check", font=title_font, fill=theme["title"])

    caret_x = 272 + draw.textlength("spell check", font=title_font) + 12
    draw.rectangle((caret_x + 10, 158, caret_x + 15, 214), fill=theme["accent"])

    tag_font = font(MONO_CANDIDATES, 19)
    for index, line in enumerate(["Tab accepts the fix.", "Right-click for every option.", "100% local."]):
        draw.text((276, 236 + index * 26), line, font=tag_font, fill=theme["tag"])

    path = OUT / name
    canvas.convert("RGB").save(path, "PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")


OUT.mkdir(parents=True, exist_ok=True)
build(LIGHT, "banner-light.png")
build(DARK, "banner-dark.png")
