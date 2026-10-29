import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

VERSION = "1.0.0"

USE_SYSTEM_FFMPEG = os.getenv("USE_SYSTEM_FFMPEG", "false").lower() == "true"
BASE_DIR = Path(__file__).parent.parent
OUTPUT_DIR = Path(os.getenv("MYP3D_LIBRARY_DIR") or BASE_DIR / "downloads")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.getenv("MYP3D_DB_PATH") or BASE_DIR / "myp3d.db")
API_PORT = int(os.getenv("API_PORT", "8000"))
API_RELOAD = os.getenv("API_RELOAD", "false").lower() == "true"

YTDLP_COOKIES_BROWSER = os.getenv("YTDLP_COOKIES_BROWSER", "").strip()
YTDLP_COOKIES_PROFILE = os.getenv("YTDLP_COOKIES_PROFILE", "").strip() or None
YTDLP_PLAYER_CLIENTS = os.getenv("YTDLP_PLAYER_CLIENTS", "default,tv,ios").strip()


def get_ffmpeg_path() -> str | None:
    bundled = BASE_DIR / "ffmpeg.exe"
    if USE_SYSTEM_FFMPEG or not bundled.is_file():
        return None
    return str(bundled)


def get_cookies_from_browser() -> tuple | None:
    if not YTDLP_COOKIES_BROWSER:
        return None
    return (YTDLP_COOKIES_BROWSER, YTDLP_COOKIES_PROFILE, None, None)


def get_player_client_args() -> dict | None:
    clients = [c.strip() for c in YTDLP_PLAYER_CLIENTS.split(",") if c.strip()]
    if not clients:
        return None
    return {"youtube": {"player_client": clients}}
