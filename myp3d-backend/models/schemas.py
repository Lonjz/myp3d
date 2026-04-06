from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class DownloadRequest(BaseModel):
    url: str
    custom_filename: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    cover_image_base64: Optional[str] = None


class DownloadResponse(BaseModel):
    success: bool
    filename: str
    message: str


class YouTubeSearchResult(BaseModel):
    video_id: str
    url: str
    title: str
    artist: Optional[str] = None
    album: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration: Optional[int] = None


class YouTubeSearchResponse(BaseModel):
    query: str
    results: list[YouTubeSearchResult]


class MetadataUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    new_filename: Optional[str] = None


class MP3Info(BaseModel):
    filename: str
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    has_cover: bool = False
    file_size: int = 0
    date_added: Optional[datetime] = None


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


class AlbumUpdate(BaseModel):
    album_name: str


class AlbumUpdateResponse(BaseModel):
    success: bool
    album_key: str
    album_name: str
    updated_tracks: int
    message: str
