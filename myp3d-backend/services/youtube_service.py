import os
import threading
from pathlib import Path
from typing import Callable, Optional

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadCancelled, download_range_func

from services.config import OUTPUT_DIR, get_cookies_from_browser, get_ffmpeg_path, get_player_client_args
from services.cover_service import set_cover_images, square_cover_from_base64
from services.filenames import clean_custom_name
from services.mp3_service import edit_tags, invalidate_library_cache


def extract_info(opts: dict, url: str, download: bool) -> dict:
    try:
        with YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=download)
    except DownloadCancelled:
        raise
    except Exception as error:
        cookies_from_browser = get_cookies_from_browser()
        if not cookies_from_browser:
            raise
        try:
            with YoutubeDL({**opts, "cookiesfrombrowser": cookies_from_browser}) as ydl:
                return ydl.extract_info(url, download=download)
        except Exception:
            raise error from None


def search_youtube(query: str, limit: int = 12) -> list[dict]:
    normalized_query = query.strip()
    if not normalized_query:
        raise ValueError("Search query cannot be empty")

    safe_limit = max(1, min(limit, 30))
    search_term = f"ytsearch{safe_limit}:{normalized_query}"
    ydl_opts = {
        "quiet": True,
        "skip_download": True,
        "extract_flat": True,
        "noplaylist": True,
        "ignoreerrors": True,
    }

    info = extract_info(ydl_opts, search_term, download=False)
    entries = info.get("entries") if isinstance(info, dict) else None
    if not entries:
        return []

    results: list[dict] = []
    for entry in entries:
        if not entry:
            continue

        video_id = str(entry.get("id") or "")
        webpage_url = entry.get("webpage_url")
        if not webpage_url and video_id:
            webpage_url = f"https://www.youtube.com/watch?v={video_id}"

        thumbnails = entry.get("thumbnails") or []
        thumbnail_url = None
        if thumbnails:
            thumbnail_url = thumbnails[-1].get("url")
        if not thumbnail_url and video_id:
            thumbnail_url = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

        duration = entry.get("duration")
        duration_seconds = int(duration) if isinstance(duration, (int, float)) else None

        if not webpage_url:
            continue

        results.append(
            {
                "video_id": video_id,
                "url": str(webpage_url),
                "title": str(entry.get("title") or "Untitled"),
                "artist": entry.get("uploader") or entry.get("channel"),
                "album": entry.get("album"),
                "thumbnail_url": thumbnail_url,
                "duration": duration_seconds,
            }
        )

    return results


_download_locks: dict[str, threading.Lock] = {}
_download_locks_guard = threading.Lock()


def _download_lock(key: str) -> threading.Lock:
    with _download_locks_guard:
        lock = _download_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _download_locks[key] = lock
        return lock


def validate_trim_range(start_time: Optional[float], end_time: Optional[float]) -> None:
    if (start_time is None) ^ (end_time is None):
        raise ValueError("Both start and end times are required for trimming")
    if start_time is not None:
        if start_time < 0:
            raise ValueError("Trim start must be 0 or greater")
        if end_time is None or end_time <= start_time:
            raise ValueError("Trim end must be greater than start")


def audio_opts(outtmpl: str) -> dict:
    opts: dict = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "js_runtimes": {
            "node": {},
        },
        "quiet": True,
        "noplaylist": True,
    }
    player_client_args = get_player_client_args()
    if player_client_args:
        opts["extractor_args"] = player_client_args
    ffmpeg_path = get_ffmpeg_path()
    if ffmpeg_path:
        opts["ffmpeg_location"] = ffmpeg_path
    return opts


def download_as_mp3(
    url: str,
    metadata: Optional[dict] = None,
    custom_name: Optional[str] = None,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
    progress_hook: Optional[Callable[[dict], None]] = None,
    overwrite: bool = False,
) -> str:
    custom_name = clean_custom_name(custom_name)
    with _download_lock(custom_name or url):
        if custom_name and not overwrite and (OUTPUT_DIR / f"{custom_name}.mp3").exists():
            raise ValueError("Already in library")
        return _download_as_mp3(url, metadata, custom_name, start_time, end_time, progress_hook)


def _download_as_mp3(
    url: str,
    metadata: Optional[dict],
    custom_name: Optional[str],
    start_time: Optional[float],
    end_time: Optional[float],
    progress_hook: Optional[Callable[[dict], None]],
) -> str:
    if custom_name:
        outtmpl = str(OUTPUT_DIR / f"{custom_name.replace('%', '%%')}.%(ext)s")
    else:
        outtmpl = str(OUTPUT_DIR / "%(title)s.%(ext)s")

    ydl_opts = {
        **audio_opts(outtmpl),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "320",
            }
        ],
    }

    if start_time is not None and end_time is not None:
        ydl_opts["download_ranges"] = download_range_func(None, [(start_time, end_time)])
        ydl_opts["force_keyframes_at_cuts"] = True

    if progress_hook:
        ydl_opts["progress_hooks"] = [progress_hook]

    info = extract_info(ydl_opts, url, download=True)

    with YoutubeDL(ydl_opts) as ydl:
        filename = ydl.prepare_filename(info)
        mp3_file = os.path.splitext(filename)[0] + ".mp3"
        if custom_name:
            mp3_file = str(OUTPUT_DIR / f"{custom_name}.mp3")

    if metadata and any(metadata.values()):
        with edit_tags(Path(mp3_file)) as tag:
            if metadata.get("title"):
                tag.title = metadata["title"]
            if metadata.get("artist"):
                tag.artist = metadata["artist"]
            if metadata.get("album"):
                tag.album = metadata["album"]
            if metadata.get("cover_image_base64"):
                processed_cover, mime_type = square_cover_from_base64(metadata["cover_image_base64"])
                set_cover_images(tag, processed_cover, mime_type)
            elif metadata.get("cover_image"):
                set_cover_images(tag, metadata["cover_image"], "image/jpeg")

    invalidate_library_cache()
    return os.path.basename(mp3_file)
