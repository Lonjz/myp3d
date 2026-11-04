from typing import Optional

from pydantic import BaseModel, Field

from models.library import MP3Info


class PlaylistInfo(BaseModel):
    id: str
    name: str
    description: str = ""
    track_count: int = 0
    has_cover: bool = False
    is_favorites: bool = False
    updated_at: str


class PlaylistDetail(PlaylistInfo):
    tracks: list[MP3Info] = Field(default_factory=list)


class PlaylistCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    filenames: list[str] = Field(default_factory=list)


class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    filenames: Optional[list[str]] = None


class PlaylistTracksRequest(BaseModel):
    filenames: list[str] = Field(min_length=1)
