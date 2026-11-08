import base64
import binascii
import threading
from collections import OrderedDict
from io import BytesIO
from pathlib import Path
from typing import Literal, Optional

import eyed3
from eyed3.id3 import frames as id3_frames
from PIL import Image, ImageOps


CoverSize = Literal["thumb", "medium", "full"]

COVER_SIZE = (500, 500)

COVER_VARIANTS: dict[str, tuple[int, int]] = {
    "thumb": (96, 80),
    "medium": (320, 82),
    "full": (500, 85),
}
WEBP_MIME_TYPE = "image/webp"
_MAX_CACHE_ENTRIES = 2000

_cache: "OrderedDict[tuple[str, int, str], bytes]" = OrderedDict()
_cache_lock = threading.Lock()


def clear_cover_cache() -> None:
    with _cache_lock:
        _cache.clear()


def _render_variant(image_data: bytes, size: CoverSize) -> bytes:
    edge, quality = COVER_VARIANTS[size]
    with Image.open(BytesIO(image_data)) as source:
        image = source.convert("RGB")
    target = min(edge, image.width, image.height)
    resized = ImageOps.fit(image, (target, target), method=Image.Resampling.LANCZOS)
    output = BytesIO()
    resized.save(output, format="WEBP", quality=quality, method=4)
    return output.getvalue()


def _cached_variant(key: tuple[str, int, str]) -> Optional[bytes]:
    with _cache_lock:
        cached = _cache.get(key)
        if cached is not None:
            _cache.move_to_end(key)
        return cached


def _remember_variant(key: tuple[str, int, str], variant: bytes) -> None:
    with _cache_lock:
        _cache[key] = variant
        _cache.move_to_end(key)
        while len(_cache) > _MAX_CACHE_ENTRIES:
            _cache.popitem(last=False)


def get_cover_variant(filepaths: list[Path], size: CoverSize) -> Optional[tuple[bytes, str]]:
    for filepath in filepaths:
        try:
            modified = filepath.stat().st_mtime_ns
        except OSError:
            continue

        key = (str(filepath), modified, size)
        cached = _cached_variant(key)
        if cached is not None:
            return cached, WEBP_MIME_TYPE

        cover = get_album_cover([filepath])
        if cover is None:
            continue

        try:
            variant = _render_variant(cover[0], size)
        except (OSError, ValueError, Image.DecompressionBombError):
            continue
        _remember_variant(key, variant)
        return variant, WEBP_MIME_TYPE

    return None


def get_image_variant(cache_key: str, image_data: bytes, size: CoverSize) -> tuple[bytes, str]:
    key = (cache_key, 0, size)
    cached = _cached_variant(key)
    if cached is not None:
        return cached, WEBP_MIME_TYPE
    variant = _render_variant(image_data, size)
    _remember_variant(key, variant)
    return variant, WEBP_MIME_TYPE


def get_album_cover(filepaths: list[Path]) -> Optional[tuple[bytes, str]]:
    for filepath in filepaths:
        tag = eyed3.id3.Tag()
        if not tag.parse(str(filepath)) or not tag.images:
            continue
        image = tag.images[0]
        return image.image_data, image.mime_type or "image/jpeg"
    return None


def _decode_base64_image(image_base64: str) -> bytes:
    if not image_base64:
        raise ValueError("Cover image data is empty")

    payload = image_base64
    if image_base64.startswith("data:"):
        parts = image_base64.split(",", 1)
        if len(parts) != 2:
            raise ValueError("Invalid cover image data URL")
        payload = parts[1]

    try:
        return base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid base64 cover image data") from exc


def make_square_cover(image_data: bytes) -> tuple[bytes, str]:
    try:
        with Image.open(BytesIO(image_data)) as image:
            square = ImageOps.fit(image.convert("RGB"), COVER_SIZE, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    except (OSError, ValueError, Image.DecompressionBombError) as exc:
        raise ValueError("Uploaded cover is not a valid image") from exc
    output = BytesIO()
    square.save(output, format="JPEG", quality=92)
    return output.getvalue(), "image/jpeg"


def square_cover_from_base64(image_base64: str) -> tuple[bytes, str]:
    return make_square_cover(_decode_base64_image(image_base64))


def set_cover_images(tag: eyed3.id3.tag.Tag, image_data: bytes, mime_type: str) -> None:
    existing_descriptions = [img.description for img in list(tag.images)]
    for description in existing_descriptions:
        while tag.images.remove(description) is not None:
            pass

    tag.images.set(id3_frames.ImageFrame.OTHER, image_data, mime_type, description="")
