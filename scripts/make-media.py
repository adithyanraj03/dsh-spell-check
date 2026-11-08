"""
Clean the recorded demo and build the README media.

The recording is made by the harness's own computer-use driver, which paints a
small blue cursor pill labelled "DSH" wherever it clicks. That pill lands on the
composer, exactly where the demo needs to be legible, so each frame is patched:
the pill is found by colour, and the rectangle is filled with the background
sampled just beside it. It sits on flat paint, so the repair is invisible.

    python scripts/make-media.py

Inputs  media/demo2.mp4            the raw recording
Outputs assets/strip.gif           typing -> suggestion strip -> Tab accepts
        assets/strip.png           still, for the README
        assets/menu.png            still, the right-click menu
"""

from pathlib import Path
import shutil
import subprocess

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "media"
ASSETS = ROOT / "assets"
FRAMES = MEDIA / "frames"

FFMPEG = shutil.which("ffmpeg") or (
    r"C:\Users\adith\AppData\Local\Microsoft\WinGet\Packages"
    r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-6.1-full_build\bin\ffmpeg.exe"
)

# Crop of the full recording: composer + the strip above it.
CROP = "crop=900:130:340:840"
START, DURATION, FPS = 9.6, 10.5, 10


def run(*args):
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def patch_pill(path):
    """Erase the blue cursor pill from one frame.

    The search window matters: the composer also contains a blue send button,
    and a whole-frame sweep merged the two into one enormous rectangle that
    painted over the entire row. The pill lives just right of the composer text
    and just above the control row, so the search is confined to that band.
    """
    image = Image.open(path).convert("RGB")
    pixels = image.load()
    width, height = image.size

    xs, ys = [], []
    for y in range(40, min(height, 100)):
        for x in range(240, min(width, 640)):
            r, g, b = pixels[x, y]
            if b > 140 and b - r > 60 and b - g > 40:
                xs.append(x)
                ys.append(y)
    if not xs:
        image.save(path)
        return

    left, right = min(xs) - 2, max(xs) + 2
    top, bottom = min(ys) - 2, max(ys) + 2
    # A cursor pill is small; anything larger is not the pill and is left alone.
    if right - left > 70 or bottom - top > 40:
        image.save(path)
        return

    for y in range(max(0, top), min(height, bottom + 1)):
        # Per-row sample of the flat composer paint, taken clear of the pill.
        fill = pixels[max(0, left - 10), y]
        for x in range(max(0, left), min(width, right + 1)):
            pixels[x, y] = fill
    image.save(path)


def main():
    if FRAMES.exists():
        shutil.rmtree(FRAMES)
    FRAMES.mkdir(parents=True)

    ASSETS.mkdir(parents=True, exist_ok=True)

    # 1. Frames, cropped to the composer.
    run(
        "-ss", str(START), "-t", str(DURATION), "-i", str(MEDIA / "demo2.mp4"),
        "-vf", f"{CROP},fps={FPS}",
        str(FRAMES / "f%03d.png"),
    )

    # 2. Repair every frame.
    frames = sorted(FRAMES.glob("f*.png"))
    for frame in frames:
        patch_pill(frame)
    print(f"patched {len(frames)} frames")

    # 3. Reassemble as an animated GIF with one shared palette.
    run(
        # The input framerate MUST be declared: without it ffmpeg assumes 25 fps
        # for an image sequence and a 10 fps capture comes back playing 2.5x fast.
        "-framerate", str(FPS), "-i", str(FRAMES / "f%03d.png"),
        "-vf", "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a",
        "-loop", "0",
        str(ASSETS / "strip.gif"),
    )

    # 4. A still for the README, taken mid-strip.
    still = Image.open(frames[min(len(frames) - 1, int(FPS * 3.4))]).convert("RGB")
    still = still.resize((still.width * 2, still.height * 2), Image.LANCZOS)
    still.save(ASSETS / "strip.png")

    size = (ASSETS / "strip.gif").stat().st_size // 1024
    print(f"wrote assets/strip.gif ({size} KB) and assets/strip.png")


main()
