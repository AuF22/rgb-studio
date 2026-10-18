"""Download the OpenRGB engine and the PawnIO driver installer into ./openrgb.

    py tools/fetch_engine.py

Binaries are not stored in git; run this once before building or running from source.
"""
import hashlib
import io
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "openrgb"

OPENRGB_VERSION = "1.1"
OPENRGB_URL = ("https://codeberg.org/OpenRGB/OpenRGB/releases/download/release_1.1/"
               "OpenRGB_1.1_Windows_64_8e16de2.zip")
OPENRGB_SHA256 = "63291726c6fc84eb479ef2ee752e97e1187f6ce9c49fd27eee40ded588a8172a"

PAWNIO_URL = "https://github.com/namazso/PawnIO.Setup/releases/download/2.2.0/PawnIO_setup.exe"
PAWNIO_SHA256 = "1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032"

NOTICE = f"""OpenRGB {OPENRGB_VERSION} — https://openrgb.org
License: GNU General Public License v2.0
Source code: https://codeberg.org/OpenRGB/OpenRGB/src/tag/release_{OPENRGB_VERSION}

RGB Studio runs this unmodified OpenRGB build as a separate process and talks to it
over the OpenRGB SDK network protocol.

PawnIO — https://pawnio.eu (driver used by OpenRGB for SMBus access to RAM / motherboards).
"""


def download(url, expected_sha):
    print(f"Загрузка {url}")
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    digest = hashlib.sha256(data).hexdigest()
    print(f"  {len(data) / 1e6:.1f} MB, sha256 {digest}")
    if expected_sha and digest != expected_sha:
        sys.exit(f"Контрольная сумма не совпала для {url}")
    return data


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    data = download(OPENRGB_URL, OPENRGB_SHA256)
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir()
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        exe = next(n for n in zf.namelist() if n.lower().endswith("openrgb.exe"))
        prefix = exe[: -len("OpenRGB.exe")]
        for info in zf.infolist():
            if info.is_dir() or not info.filename.startswith(prefix):
                continue
            rel = info.filename[len(prefix):]
            target = (DEST / rel).resolve()
            if DEST.resolve() not in target.parents:
                continue  # skip paths that would escape the folder
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(info))

    (DEST / "PawnIO_setup.exe").write_bytes(download(PAWNIO_URL, PAWNIO_SHA256))
    (DEST / "THIRD_PARTY_NOTICE.txt").write_text(NOTICE, encoding="utf-8")
    print(f"Готово: {DEST}")


if __name__ == "__main__":
    main()
