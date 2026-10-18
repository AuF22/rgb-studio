"""Render the app icon (same rainbow ring as the tray icon) to build/icon.ico."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
COLORS = [(255, 61, 127), (255, 229, 61), (61, 255, 138), (61, 213, 255), (124, 92, 255)]


def ring(size):
    img = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad, width = size * 4 // 10, size * 4 // 5
    for i, c in enumerate(COLORS):
        d.arc((pad, pad, size * 4 - pad, size * 4 - pad), i * 72 - 90, (i + 1) * 72 - 90, fill=c, width=width)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    out = ROOT / "build" / "icon.ico"
    out.parent.mkdir(exist_ok=True)
    ring(256).save(out, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(out)
