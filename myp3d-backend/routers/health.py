from typing import Optional

from fastapi import APIRouter

from models.health import ArtistFixRequest, ArtistTrack, NamingTrack, RenameRequest, SilenceScanInfo, TrimRequest
from models.library import BulkResult
from services import health_service

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("/silence", response_model=Optional[SilenceScanInfo])
def get_silence_scan():
    return health_service.get_scan()


@router.post("/silence/scan", response_model=SilenceScanInfo)
def start_silence_scan():
    return health_service.start_scan()


@router.post("/silence/trim", response_model=BulkResult)
def trim_silence(payload: TrimRequest):
    return health_service.trim(payload.filenames)


@router.get("/naming", response_model=list[NamingTrack])
def get_naming_issues():
    return health_service.naming_issues()


@router.post("/naming/fix", response_model=BulkResult)
def fix_naming(payload: RenameRequest):
    return health_service.rename(payload.items)


@router.get("/artists", response_model=list[ArtistTrack])
def get_artist_issues():
    return health_service.artist_issues()


@router.post("/artists/fix", response_model=BulkResult)
def fix_artists(payload: ArtistFixRequest):
    return health_service.fix_artists(payload.items)
