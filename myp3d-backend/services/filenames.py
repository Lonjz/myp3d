from pathlib import Path
from typing import Any, Optional

UNSAFE_PATH_CHARS = set('/:\\*?"<>|')
MAX_PATH_PART_LENGTH = 120


def is_track_name(name: Any) -> bool:
    return isinstance(name, str) and Path(name).name == name and not name.startswith(".") and name.lower().endswith(".mp3")


def safe_path_part(value: Optional[str], fallback: str) -> str:
    cleaned = "".join("_" if char in UNSAFE_PATH_CHARS or ord(char) < 32 else char for char in value or "")
    cleaned = cleaned.strip().strip(".").strip()[:MAX_PATH_PART_LENGTH].strip()
    return cleaned or fallback


def clean_custom_name(custom_name: Optional[str]) -> Optional[str]:
    name = (custom_name or "").strip().lower()
    if not name:
        return None
    if name.startswith(".") or any(char in UNSAFE_PATH_CHARS or ord(char) < 32 for char in name):
        raise ValueError("Invalid file name")
    return name
