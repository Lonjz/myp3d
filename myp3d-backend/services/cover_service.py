import threading
from collections import OrderedDict
from io import BytesIO
from pathlib import Path
from typing import Literal, Optional

from PIL import Image, ImageOps

from services.mp3_service import get_album_cover

CoverSize = Literal["thumb", "medium", "full"]

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


def get_cover_variant(filepaths: list[Path], size: CoverSize) -> Optional[tuple[bytes, str]]:
    for filepath in filepaths:
        try:
            modified = filepath.stat().st_mtime_ns
        except OSError:
            continue

        key = (str(filepath), modified, size)
        with _cache_lock:
            cached = _cache.get(key)
            if cached is not None:
                _cache.move_to_end(key)
                return cached, WEBP_MIME_TYPE

        cover = get_album_cover([filepath])
        if cover is None:
            continue

        variant = _render_variant(cover[0], size)
        with _cache_lock:
            _cache[key] = variant
            _cache.move_to_end(key)
            while len(_cache) > _MAX_CACHE_ENTRIES:
                _cache.popitem(last=False)
        return variant, WEBP_MIME_TYPE

    return None
