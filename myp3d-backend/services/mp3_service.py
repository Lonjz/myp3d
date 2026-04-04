import os
import base64
import binascii
import importlib
from pathlib import Path
from io import BytesIO
from typing import Optional

import eyed3
from yt_dlp import YoutubeDL

from models.schemas import MP3Info
from services.config import OUTPUT_DIR, get_ffmpeg_path


COVER_SIZE = (500, 500)


def _decode_base64_image(image_base64: str) -> bytes:
    """Decode either raw base64 or a data URL into image bytes."""
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
    """Center-crop and resize an image to a 500x500 JPEG cover."""
    try:
        image_module = importlib.import_module("PIL.Image")
        image_ops_module = importlib.import_module("PIL.ImageOps")
    except ModuleNotFoundError as exc:
        raise ValueError("Pillow is required for cover image processing. Install dependencies and try again.") from exc

    unidentified_image_error = getattr(image_module, "UnidentifiedImageError", Exception)

    try:
        with image_module.open(BytesIO(image_data)) as image:
            image = image.convert("RGB")
            resampling_enum = getattr(image_module, "Resampling", None)
            if resampling_enum is not None:
                resampling = resampling_enum.LANCZOS
            else:
                # Older Pillow versions expose filters at module level.
                resampling = getattr(image_module, "LANCZOS", getattr(image_module, "BICUBIC", 3))
            square = image_ops_module.fit(image, COVER_SIZE, method=resampling, centering=(0.5, 0.5))
            output = BytesIO()
            square.save(output, format="JPEG", quality=92)
            return output.getvalue(), "image/jpeg"
    except unidentified_image_error as exc:
        raise ValueError("Uploaded cover is not a valid image") from exc


def get_mp3_info(filepath: Path) -> MP3Info:
    """Extract MP3 metadata."""
    audio = eyed3.load(str(filepath))
    info = MP3Info(
        filename=filepath.name,
        file_size=filepath.stat().st_size
    )
    if audio and audio.tag:
        info.title = audio.tag.title
        info.artist = audio.tag.artist
        info.album = audio.tag.album
        info.has_cover = bool(audio.tag.images)
    return info


def download_as_mp3(url: str, metadata: Optional[dict] = None, custom_name: Optional[str] = None) -> str:
    """Download YouTube video as MP3."""
    ffmpeg_path = get_ffmpeg_path()
    
    # Output template
    if custom_name:
        outtmpl = str(OUTPUT_DIR / f"{custom_name}.%(ext)s")
    else:
        outtmpl = str(OUTPUT_DIR / "%(title)s.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "js_runtimes": {
            "node": {},
        },
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "320",
            }
        ],
        "quiet": True,
        "noplaylist": True,
    }
    
    if ffmpeg_path:
        ydl_opts["ffmpeg_location"] = ffmpeg_path

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)
        mp3_file = os.path.splitext(filename)[0] + ".mp3"
        if custom_name:
            mp3_file = str(OUTPUT_DIR / f"{custom_name}.mp3")

    # Apply metadata if provided
    if metadata and any(metadata.values()):
        audio = eyed3.load(mp3_file)
        if audio.tag is None:
            audio.initTag()
        if metadata.get("title"):
            audio.tag.title = metadata["title"]
        if metadata.get("artist"):
            audio.tag.artist = metadata["artist"]
        if metadata.get("album"):
            audio.tag.album = metadata["album"]
        if metadata.get("cover_image_base64"):
            cover_image_data = _decode_base64_image(metadata["cover_image_base64"])
            processed_cover, mime_type = make_square_cover(cover_image_data)
            audio.tag.images.set(3, processed_cover, mime_type)
        audio.tag.save(version=(2, 3, 0))

    return os.path.basename(mp3_file)
