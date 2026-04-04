"""Inspect ID3 artwork frames (APIC/PIC) in MP3 files.

Usage:
    python utils/inspect_id3_artwork.py path/to/file.mp3
    python utils/inspect_id3_artwork.py path1.mp3 path2.mp3

This helps compare how iTunes-written files store embedded cover art.
"""

from __future__ import annotations

import argparse
import hashlib
from io import BytesIO
from pathlib import Path
from typing import Iterable

import eyed3
from eyed3.id3 import frames as id3_frames

try:
    from PIL import Image  # type: ignore
except ModuleNotFoundError:
    Image = None


def _to_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        try:
            return value.decode("latin-1")
        except Exception:
            return repr(value)
    return str(value)


def _image_dimensions(image_data: bytes) -> str:
    if not image_data:
        return "n/a"
    if Image is None:
        return "Pillow not installed"

    try:
        with Image.open(BytesIO(image_data)) as im:
            return f"{im.width}x{im.height} ({im.format or 'unknown'})"
    except Exception as exc:
        return f"unreadable ({exc})"


def _iter_image_frames(tag: eyed3.id3.tag.Tag) -> Iterable[object]:
    for image in tag.images:
        yield image


def inspect_file(path: Path) -> int:
    print("=" * 72)
    print(f"File: {path}")

    if not path.exists() or not path.is_file():
        print("Error: file does not exist")
        return 1

    audio = eyed3.load(str(path))
    if audio is None:
        print("Error: unable to read audio file")
        return 1

    if audio.tag is None:
        print("No ID3 tag found")
        return 0

    tag = audio.tag
    print(f"ID3 version: {tag.version}")

    image_frames = list(_iter_image_frames(tag))
    print(f"Artwork frame count: {len(image_frames)}")

    for idx, frame in enumerate(image_frames, start=1):
        pic_type_num = getattr(frame, "picture_type", None)
        try:
            pic_type_name = id3_frames.ImageFrame.picTypeToString(pic_type_num)
        except Exception:
            pic_type_name = "unknown"

        mime_type = _to_text(getattr(frame, "mime_type", ""))
        description = _to_text(getattr(frame, "description", ""))
        image_data = getattr(frame, "image_data", None) or b""
        image_url = _to_text(getattr(frame, "image_url", ""))
        sha1_short = hashlib.sha1(image_data).hexdigest()[:12] if image_data else "n/a"

        print(f"\n[{idx}] frame_id={getattr(frame, 'id', 'APIC')}")
        print(f"  picture_type: {pic_type_num} ({pic_type_name})")
        print(f"  description : {description!r}")
        print(f"  mime_type   : {mime_type!r}")
        print(f"  image_url   : {image_url!r}")
        print(f"  image_bytes : {len(image_data)}")
        print(f"  image_sha1  : {sha1_short}")
        print(f"  dimensions  : {_image_dimensions(image_data)}")

    frame_set = getattr(tag, "frame_set", None)
    if frame_set is not None:
        for image_fid in (b"APIC", b"PIC"):
            if image_fid in frame_set:
                print(f"\nRaw {_to_text(image_fid)} frame entries: {len(frame_set[image_fid])}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Inspect ID3 artwork frames in one or more MP3 files"
    )
    parser.add_argument("files", nargs="*", help="MP3 file path(s)")
    args = parser.parse_args()

    files = list(args.files)
    if not files:
        print("No file argument provided.")
        itunes_path = input("Enter path to an iTunes MP3 file: ").strip().strip('"')
        if not itunes_path:
            print("Error: no file path entered")
            return 1
        files.append(itunes_path)

        compare_path = input("Optional: enter path to your generated MP3 for comparison (or press Enter to skip): ").strip().strip('"')
        if compare_path:
            files.append(compare_path)

    exit_code = 0
    for file_arg in files:
        code = inspect_file(Path(file_arg))
        if code != 0:
            exit_code = code
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
