from typing import Literal, Optional

from pydantic import BaseModel, Field

from models.library import MP3Info


class SilentTrack(MP3Info):
    silence: float


class SilenceScanInfo(BaseModel):
    status: Literal["scanning", "done", "failed"]
    total: int = 0
    done: int = 0
    tracks: list[SilentTrack] = Field(default_factory=list)
    error: Optional[str] = None


class TrimRequest(BaseModel):
    filenames: list[str] = Field(min_length=1)


class SilenceBoundsRequest(BaseModel):
    url: str = Field(min_length=1)


class TrimRange(BaseModel):
    start: float
    end: float
    duration: float


class NamingTrack(MP3Info):
    suggested: Optional[str] = None


class ArtistTrack(MP3Info):
    artists: list[str]
    titles: list[str]


class RenameItem(BaseModel):
    filename: str
    new_name: str


class RenameRequest(BaseModel):
    items: list[RenameItem] = Field(min_length=1)


class ArtistFixItem(BaseModel):
    filename: str
    artist: str


class ArtistFixRequest(BaseModel):
    items: list[ArtistFixItem] = Field(min_length=1)
