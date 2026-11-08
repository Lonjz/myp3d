from datetime import date

from fastapi import APIRouter
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from models.system import SystemInfo
from services import system_service

router = APIRouter(prefix="/system", tags=["System"])


@router.get("/info", response_model=SystemInfo)
def get_info():
    return system_service.get_info()


@router.get("/backup.db")
def download_backup():
    path = system_service.create_backup()
    return FileResponse(
        path,
        media_type="application/vnd.sqlite3",
        filename=f"myp3d-backup-{date.today().isoformat()}.db",
        background=BackgroundTask(path.unlink, missing_ok=True),
    )
