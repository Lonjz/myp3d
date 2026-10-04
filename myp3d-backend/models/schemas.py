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
    start_time: Optional[float] = None
    end_time: Optional[float] = None


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
    has_cover: bool = False
    file_size: int = 0
    duration: Optional[float] = None
    date_added: Optional[datetime] = None


class PaginationMeta(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    returned: int


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


class ArtistStat(BaseModel):
    name: str
    track_count: int


class AlbumStat(BaseModel):
    album_key: str
    album_name: str
    track_count: int
    total_size: int
    has_cover: bool = False


class MonthBucket(BaseModel):
    month: str
    track_count: int
    total_size: int


class DurationBucket(BaseModel):
    label: str
    track_count: int


class LibraryHealth(BaseModel):
    missing_title: int
    missing_artist: int
    missing_album: int
    missing_cover: int


class LibraryStats(BaseModel):
    total_tracks: int
    total_albums: int
    total_artists: int
    total_size: int
    total_duration: float
    average_size: float
    average_duration: float
    tracks_with_cover: int
    health: LibraryHealth
    top_artists: list[ArtistStat]
    top_albums: list[AlbumStat]
    additions_by_month: list[MonthBucket]
    duration_histogram: list[DurationBucket]
    recent_tracks: list[MP3Info]

class SyncDevice(BaseModel):
    id: str
    name: str


class SyncPeer(SyncDevice):
    host: str


class SyncStartRequest(BaseModel):
    port: int = Field(ge=1024, le=65535)


class SyncStatus(BaseModel):
    device: SyncDevice
    port: Optional[int] = None

