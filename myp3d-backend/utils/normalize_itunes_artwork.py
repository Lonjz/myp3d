"""Normalize embedded artwork for all MP3s in downloads/ to iTunes-style APIC.

What this script does per file with cover art:
1. Reads existing embedded cover image.
2. Center-crops/resizes it to 500x500 JPEG.
3. Rewrites artwork as a single APIC frame:
   - picture_type: OTHER (0)
   - description: ""
4. Saves tag as ID3v2.3.0.

Usage:
    python utils/normalize_itunes_artwork.py
    python utils/normalize_itunes_artwork.py --downloads-dir ./downloads
    python utils/normalize_itunes_artwork.py --skip-compatible
"""

from __future__ import annotations

import argparse
from io import BytesIO
from pathlib import Path

import eyed3
from eyed3.id3 import frames as id3_frames

try:
    from PIL import Image, ImageOps  # type: ignore
except ModuleNotFoundError as exc:
    raise SystemExit("Pillow is required. Install dependencies first.") from exc


COVER_SIZE = (500, 500)


def make_square_cover(image_data: bytes) -> tuple[bytes, str]:
    with Image.open(BytesIO(image_data)) as image:
        image = image.convert("RGB")
        resampling_enum = getattr(Image, "Resampling", None)
        if resampling_enum is not None:
            resampling = resampling_enum.LANCZOS
        else:
            resampling = getattr(Image, "LANCZOS", getattr(Image, "BICUBIC", 3))

        square = ImageOps.fit(image, COVER_SIZE, method=resampling, centering=(0.5, 0.5))
        out = BytesIO()
        square.save(out, format="JPEG", quality=92)
        return out.getvalue(), "image/jpeg"


def set_itunes_cover(tag: eyed3.id3.tag.Tag, image_data: bytes, mime_type: str) -> None:
    descriptions = [img.description for img in list(tag.images)]
    for description in descriptions:
        while tag.images.remove(description) is not None:
            pass

    tag.images.set(id3_frames.ImageFrame.OTHER, image_data, mime_type, description="")


def first_embedded_image(tag: eyed3.id3.tag.Tag) -> bytes | None:
    for image in tag.images:
        if getattr(image, "image_data", None):
            return image.image_data
    return None


def is_itunes_compatible(tag: eyed3.id3.tag.Tag) -> bool:
    images = list(tag.images)
    if len(images) != 1:
        return False

    image = images[0]
    return (
        image.picture_type == id3_frames.ImageFrame.OTHER
        and (image.description or "") == ""
        and (image.mime_type or b"").decode("latin-1", errors="ignore").lower() == "image/jpeg"
    )


def process_file(mp3_path: Path, skip_compatible: bool) -> str:
    audio = eyed3.load(str(mp3_path))
    if not audio or not audio.tag:
        return "skip:no_tag"

    if len(audio.tag.images) == 0:
        return "skip:no_cover"

    if skip_compatible and is_itunes_compatible(audio.tag):
        return "skip:already_compatible"

    source_image = first_embedded_image(audio.tag)
    if not source_image:
        return "skip:no_embedded_image_data"

    processed_cover, mime_type = make_square_cover(source_image)
    set_itunes_cover(audio.tag, processed_cover, mime_type)
    audio.tag.save(version=(2, 3, 0))
    return "updated"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize all downloads artwork for iTunes compatibility")
    parser.add_argument(
        "--downloads-dir",
        default=str(Path(__file__).resolve().parent.parent / "downloads"),
        help="Path to downloads directory (default: ../downloads)",
    )
    parser.add_argument(
        "--skip-compatible",
        action="store_true",
        help="Skip files that already look iTunes-compatible",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    downloads_dir = Path(args.downloads_dir).expanduser().resolve()

    if not downloads_dir.exists() or not downloads_dir.is_dir():
        print(f"Error: downloads directory not found: {downloads_dir}")
        return 1

    mp3_files = sorted(p for p in downloads_dir.iterdir() if p.is_file() and p.suffix.lower() == ".mp3")
    if not mp3_files:
        print(f"No MP3 files found in: {downloads_dir}")
        return 0

    counts: dict[str, int] = {
        "updated": 0,
        "skip:no_tag": 0,
        "skip:no_cover": 0,
        "skip:no_embedded_image_data": 0,
        "skip:already_compatible": 0,
        "error": 0,
    }

    print(f"Processing {len(mp3_files)} MP3 file(s) in: {downloads_dir}")
    for mp3_path in mp3_files:
        try:
            result = process_file(mp3_path, args.skip_compatible)
            counts[result] = counts.get(result, 0) + 1
            print(f"[{result}] {mp3_path.name}")
        except Exception as exc:
            counts["error"] += 1
            print(f"[error] {mp3_path.name}: {exc}")

    print("\nSummary")
    print(f"  updated: {counts['updated']}")
    print(f"  skipped (no tag): {counts['skip:no_tag']}")
    print(f"  skipped (no cover): {counts['skip:no_cover']}")
    print(f"  skipped (no embedded image data): {counts['skip:no_embedded_image_data']}")
    print(f"  skipped (already compatible): {counts['skip:already_compatible']}")
    print(f"  errors: {counts['error']}")

    return 1 if counts["error"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
