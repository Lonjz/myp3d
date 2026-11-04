from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class MetadataUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    new_filename: Optional[str] = None


class BulkTracksRequest(BaseModel):
    filenames: list[str] = Field(min_length=1)


class BulkMetadataUpdate(BulkTracksRequest):
    artist: Optional[str] = None
    album: Optional[str] = None


class BulkFailure(BaseModel):
    filename: str
    detail: str


class BulkResult(BaseModel):
    success: bool
    updated: list[str]
    failed: list[BulkFailure]


class MP3Info(BaseModel):
    filename: str
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    album_key: str = ""
    has_cover: bool = False
    file_size: int = 0
    duration: Optional[float] = None
    date_added: Optional[datetime] = None


class LibraryNames(BaseModel):
    artists: list[str]
    albums: list[str]


class TagSuggestion(BaseModel):
    title: str
    artist: Optional[str] = None
    album: Optional[str] = None


class PaginationMeta(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    returned: int

    @classmethod
    def of(cls, total: int, page: int, limit: int, returned: int) -> "PaginationMeta":
        return cls(total=total, page=page, limit=limit, total_pages=max(1, (total + limit - 1) // limit), returned=returned)


class AlbumInfo(BaseModel):
    album_key: str
    album_name: str
    track_count: int
    total_size: int
    artists: list[str] = Field(default_factory=list)
    has_cover: bool = False
    cover_filename: Optional[str] = None
    date_added: Optional[datetime] = None


class AlbumDetail(BaseModel):
    album: AlbumInfo
    tracks: list[MP3Info]


class SearchResults(BaseModel):
    tracks: list[MP3Info]
    albums: list[AlbumInfo]


class PaginatedMP3Response(BaseModel):
    items: list[MP3Info]
    meta: PaginationMeta


class PaginatedAlbumResponse(BaseModel):
    items: list[AlbumInfo]
    meta: PaginationMeta


class AlbumUpdate(BaseModel):
    album_name: str
    artist: Optional[str] = None


class AlbumUpdateResponse(BaseModel):
    success: bool
    album_key: str
    album_name: str
    updated_tracks: int
    message: str
