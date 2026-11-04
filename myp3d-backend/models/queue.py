from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class DownloadRequest(BaseModel):
    url: str
    custom_filename: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    cover_image_base64: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    overwrite: bool = False


class DownloadResponse(BaseModel):
    success: bool
    filename: str
    message: str


QueueStatusName = Literal["pending", "queued", "running", "done", "failed"]


class QueueItemCreate(BaseModel):
    url: str = Field(min_length=1)
    custom_filename: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    cover_image_base64: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    overwrite: bool = False
    cover_url: Optional[str] = None


class QueueItemsCreate(BaseModel):
    items: list[QueueItemCreate] = Field(min_length=1)


class QueueItemUpdate(BaseModel):
    url: Optional[str] = None
    custom_filename: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    cover_image_base64: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
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


class YouTubeSearchResponse(BaseModel):
    query: str
    results: list[YouTubeSearchResult]
