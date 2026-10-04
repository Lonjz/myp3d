import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Configuration
USE_SYSTEM_FFMPEG = os.getenv("USE_SYSTEM_FFMPEG", "false").lower() == "true"
BASE_DIR = Path(__file__).parent.parent
OUTPUT_DIR = Path(os.getenv("MYP3D_LIBRARY_DIR") or BASE_DIR / "downloads")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
API_PORT = int(os.getenv("API_PORT", "8000"))

YTDLP_COOKIES_BROWSER = os.getenv("YTDLP_COOKIES_BROWSER", "firefox").strip()
YTDLP_COOKIES_PROFILE = os.getenv("YTDLP_COOKIES_PROFILE", "").strip() or None
YTDLP_PLAYER_CLIENTS = os.getenv("YTDLP_PLAYER_CLIENTS", "default,tv,ios").strip()


def get_ffmpeg_path() -> str | None:
    """Get ffmpeg path based on OS configuration."""
    if USE_SYSTEM_FFMPEG:
        return None  # Use system ffmpeg from PATH
    return str(BASE_DIR / "ffmpeg.exe")


def get_cookies_from_browser() -> tuple | None:
    """Get the yt-dlp cookiesfrombrowser spec, or None if disabled."""
    if not YTDLP_COOKIES_BROWSER:
        return None
    return (YTDLP_COOKIES_BROWSER, YTDLP_COOKIES_PROFILE, None, None)


def get_player_client_args() -> dict | None:
    """Get yt-dlp extractor_args pinning the YouTube player clients, or None if unset."""
    clients = [c.strip() for c in YTDLP_PLAYER_CLIENTS.split(",") if c.strip()]
    if not clients:
        return None
    return {"youtube": {"player_client": clients}}
