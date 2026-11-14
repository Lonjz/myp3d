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


FLAT_OPTS = {
    "quiet": True,
    "skip_download": True,
    "extract_flat": True,
    "ignoreerrors": True,
}
UNAVAILABLE_TITLES = {"[Private video]", "[Deleted video]"}


def _entry_result(entry: dict) -> Optional[dict]:
    video_id = str(entry.get("id") or "")
    webpage_url = entry.get("webpage_url") or entry.get("url")
    if video_id and (not webpage_url or not str(webpage_url).startswith("http")):
        webpage_url = f"https://www.youtube.com/watch?v={video_id}"
    if not webpage_url:
        return None

    thumbnails = entry.get("thumbnails") or []
    thumbnail_url = thumbnails[-1].get("url") if thumbnails else None
    if not thumbnail_url and video_id:
        thumbnail_url = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

    duration = entry.get("duration")
    return {
        "video_id": video_id,
        "url": str(webpage_url),
        "title": str(entry.get("title") or "Untitled"),
        "artist": entry.get("uploader") or entry.get("channel"),
        "album": entry.get("album"),
        "thumbnail_url": thumbnail_url,
        "duration": int(duration) if isinstance(duration, (int, float)) else None,
    }


def playlist_entries(playlist_id: str) -> tuple[str, list[dict], int]:
    info = extract_info(FLAT_OPTS, f"https://www.youtube.com/playlist?list={playlist_id}", download=False)
    if not isinstance(info, dict):
        raise ValueError("Couldn't open that playlist")
    results: list[dict] = []
    unavailable = 0
    for entry in info.get("entries") or []:
        result = _entry_result(entry) if entry and entry.get("title") not in UNAVAILABLE_TITLES else None
        if result is None:
            unavailable += 1
            continue
        results.append(result)
    return str(info.get("title") or ""), results, unavailable


_download_locks: dict[str, threading.Lock] = {}
_download_locks_guard = threading.Lock()


def _download_lock(key: str) -> threading.Lock:
    with _download_locks_guard:
        return _download_locks.setdefault(key, threading.Lock())


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

    if custom_name:
        mp3_file = str(OUTPUT_DIR / f"{custom_name}.mp3")
    else:
        with YoutubeDL(ydl_opts) as ydl:
            mp3_file = os.path.splitext(ydl.prepare_filename(info))[0] + ".mp3"

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
