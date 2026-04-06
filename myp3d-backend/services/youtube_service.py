from yt_dlp import YoutubeDL


def search_youtube(query: str, limit: int = 12) -> list[dict]:
    """Search YouTube videos through yt-dlp and return lightweight metadata."""
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

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(search_term, download=False)

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
