import os
import sqlite3
import tempfile
from pathlib import Path

from models.system import SystemInfo
from services import db
from services.config import VERSION
from services.device_service import get_device_name
from services.errors import AppError


def get_info() -> SystemInfo:
    return SystemInfo(version=VERSION, device_name=get_device_name())


def create_backup() -> Path:
    handle, name = tempfile.mkstemp(prefix="myp3d-backup-", suffix=".db")
    os.close(handle)
    path = Path(name)
    try:
        with db.connect() as source:
            target = sqlite3.connect(path)
            try:
                source.backup(target)
            finally:
                target.close()
    except sqlite3.Error as exc:
        path.unlink(missing_ok=True)
        raise AppError(500, "Failed to back up the database") from exc
    return path
