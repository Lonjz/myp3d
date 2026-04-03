import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Configuration
USE_SYSTEM_FFMPEG = os.getenv("USE_SYSTEM_FFMPEG", "false").lower() == "true"
DEFAULT_NORMALIZE_TARGET_PEAK_DB = float(os.getenv("DEFAULT_NORMALIZE_TARGET_PEAK_DB", "-0.4"))
BASE_DIR = Path(__file__).parent.parent
OUTPUT_DIR = BASE_DIR / "downloads"
OUTPUT_DIR.mkdir(exist_ok=True)


def get_ffmpeg_path() -> str | None:
    """Get ffmpeg path based on OS configuration."""
    if USE_SYSTEM_FFMPEG:
        return None  # Use system ffmpeg from PATH
    return str(BASE_DIR / "ffmpeg.exe")
