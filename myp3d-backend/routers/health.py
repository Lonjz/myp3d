from typing import Optional

from fastapi import APIRouter, HTTPException

from models.schemas import BulkResult, SilenceScanInfo, TrimRequest
from services import health_service
from services.health_service import HealthError

router = APIRouter(prefix="/health", tags=["Health"])


def _raise(exc: HealthError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/silence", response_model=Optional[SilenceScanInfo])
def get_silence_scan():
    return health_service.get_scan()


@router.post("/silence/scan", response_model=SilenceScanInfo)
def start_silence_scan():
    try:
        return health_service.start_scan()
    except HealthError as exc:
        _raise(exc)


@router.post("/silence/trim", response_model=BulkResult)
def trim_silence(payload: TrimRequest):
    try:
        return health_service.trim(payload.filenames)
    except HealthError as exc:
        _raise(exc)
