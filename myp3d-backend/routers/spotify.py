from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from models.schemas import SpotifyResolveRequest, SpotifyResolveResult, SpotifyTrackMatch
from services import spotify_service
from services.spotify_service import SpotifyError

router = APIRouter(prefix="/spotify", tags=["Spotify"])


def _raise(exc: SpotifyError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/resolve", response_model=SpotifyResolveResult)
def resolve_spotify(payload: SpotifyResolveRequest):
    try:
        return spotify_service.resolve(payload.text)
    except SpotifyError as exc:
        _raise(exc)


@router.get("/tracks/{track_id}", response_model=SpotifyTrackMatch)
def match_spotify_track(track_id: str, album: Optional[str] = Query(None, max_length=500)):
    try:
        return spotify_service.match_track(track_id, album)
    except SpotifyError as exc:
        _raise(exc)
