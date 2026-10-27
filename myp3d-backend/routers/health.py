from typing import Optional

from fastapi import APIRouter, HTTPException

from models.schemas import (
    ArtistFixRequest,
    ArtistTrack,
    BulkResult,
    NamingTrack,
    RenameRequest,
    SilenceScanInfo,
    TrimRequest,
)
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


@router.get("/naming", response_model=list[NamingTrack])
def get_naming_issues():
    return health_service.naming_issues()


@router.post("/naming/fix", response_model=BulkResult)
def fix_naming(payload: RenameRequest):
    try:
        return health_service.rename(payload.items)
    except HealthError as exc:
        _raise(exc)


@router.get("/artists", response_model=list[ArtistTrack])
def get_artist_issues():
    return health_service.artist_issues()


@router.post("/artists/fix", response_model=BulkResult)
def fix_artists(payload: ArtistFixRequest):
    try:
        return health_service.fix_artists(payload.items)
    except HealthError as exc:
        _raise(exc)
