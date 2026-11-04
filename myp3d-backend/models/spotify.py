from typing import Literal, Optional

from pydantic import BaseModel, Field


class SpotifyResolveRequest(BaseModel):
    text: str = Field(min_length=1)


class SpotifyTrackRef(BaseModel):
    id: str
    name: str
    subtitle: str = ""
    duration: Optional[float] = None
    explicit: bool = False
    album: Optional[str] = None
    cover_url: Optional[str] = None


class SpotifyResolveResult(BaseModel):
    tracks: list[SpotifyTrackRef]
    truncated: bool = False
    skipped: int = 0


class SpotifyTrack(BaseModel):
    id: str
    url: str
    name: str
    artists: list[str] = Field(default_factory=list)
    album: Optional[str] = None
    duration: Optional[float] = None
    explicit: bool = False
    cover_url: Optional[str] = None


class SpotifyCandidate(BaseModel):
    video_id: str
    url: str
    title: str
    artists: list[str] = Field(default_factory=list)
    album: Optional[str] = None
    duration: Optional[float] = None
    thumbnail_url: Optional[str] = None
    explicit: Optional[bool] = None
    kind: Literal["song", "video"]
    score: float


class SpotifyTrackMatch(BaseModel):
    track: SpotifyTrack
    title: str
    artist: Optional[str] = None
    filename: Optional[str] = None
    in_library: bool = False
    candidates: list[SpotifyCandidate]
