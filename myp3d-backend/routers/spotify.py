from typing import Optional

from fastapi import APIRouter, Query

from models.spotify import SpotifyResolveRequest, SpotifyResolveResult, SpotifyTrackMatch
from services import spotify_service

router = APIRouter(prefix="/spotify", tags=["Spotify"])


@router.post("/resolve", response_model=SpotifyResolveResult)
def resolve_spotify(payload: SpotifyResolveRequest):
    return spotify_service.resolve(payload.text)


@router.get("/tracks/{track_id}", response_model=SpotifyTrackMatch)
def match_spotify_track(track_id: str, album: Optional[str] = Query(None, max_length=500)):
    return spotify_service.match_track(track_id, album)
