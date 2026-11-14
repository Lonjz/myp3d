from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class DownloadFields(BaseModel):
    custom_filename: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    cover_image_base64: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None


class DownloadRequest(DownloadFields):
    url: str
    overwrite: bool = False
    cover_url: Optional[str] = None


class DownloadResponse(BaseModel):
    success: bool
    filename: str
    message: str


QueueStatusName = Literal["pending", "queued", "running", "done", "failed"]


class QueueItemCreate(DownloadFields):
    url: str = Field(min_length=1)
    overwrite: bool = False
    cover_url: Optional[str] = None


class QueueItemsCreate(BaseModel):
    items: list[QueueItemCreate] = Field(min_length=1)


class QueueItemUpdate(DownloadFields):
    url: Optional[str] = None
    overwrite: Optional[bool] = None


class QueueStartRequest(BaseModel):
    ids: Optional[list[int]] = None


class QueueItem(BaseModel):
    id: int
    url: str
    custom_filename: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    has_cover: bool = False
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    overwrite: bool = False
    status: QueueStatusName
    progress: Optional[float] = None
    error: Optional[str] = None
    filename: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    finished_at: Optional[datetime] = None


class YouTubeSearchResult(BaseModel):
    video_id: str
    url: str
    title: str
    artist: Optional[str] = None
    album: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration: Optional[int] = None
    kind: Literal["song", "video"] = "video"
    explicit: Optional[bool] = None
    in_library: bool = False
    filename: Optional[str] = None
    cover_url: Optional[str] = None


class YouTubeSearchResponse(BaseModel):
    query: str
    results: list[YouTubeSearchResult]


class YouTubePlaylist(BaseModel):
    title: str = ""
    tracks: list[YouTubeSearchResult]
    unavailable: int = 0


class YouTubeRelease(BaseModel):
    browse_id: str
    title: str
    year: Optional[str] = None
    kind: Literal["album", "single", "ep"] = "album"
    thumbnail_url: Optional[str] = None
    in_library: bool = False


class YouTubeArtist(BaseModel):
    name: str
    songs: list[YouTubeSearchResult]
    releases: list[YouTubeRelease]
