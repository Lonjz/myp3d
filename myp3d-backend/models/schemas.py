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


class SyncRequestCreate(BaseModel):
    peer_id: str


class SyncIncomingRequest(BaseModel):
    session_id: str
    device: SyncDevice
    port: int = Field(ge=1, le=65535)


class SyncProgress(BaseModel):
    total: int = 0
    done: int = 0
    failed: int = 0
    finished: bool = False


class SyncSessionInfo(BaseModel):
    id: str
    peer: SyncPeer
    direction: Literal["outgoing", "incoming"]
    status: Literal["requested", "incoming", "paired", "syncing", "done", "declined", "failed", "cancelled"]
    local: SyncProgress
    remote: SyncProgress
    error: Optional[str] = None


class SyncManifestEntry(BaseModel):
    filename: str
    size: int
    fingerprint: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    has_cover: bool = False


class SyncDiffTrack(BaseModel):
    filename: str
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    has_cover: bool = False
    replaces: bool = False


class SyncDiff(BaseModel):
    incoming: list[SyncDiffTrack]
    both: list[SyncDiffTrack]
    outgoing: list[SyncDiffTrack]


class MusicStatus(BaseModel):
    available: bool
    detected_folder: Optional[str] = None


class MusicFolderRequest(BaseModel):
    folder: str = Field(min_length=1)


class MusicTrack(BaseModel):
    persistent_id: str
    name: str
    artist: Optional[str] = None
    album: Optional[str] = None


class MusicPair(BaseModel):
    track: MP3Info
    music: MusicTrack
    changes: list[Literal["title", "artist", "album", "art"]] = Field(default_factory=list)


class MusicDiff(BaseModel):
    only_in_music: list[MusicTrack]
    both: list[MusicPair]
    only_in_library: list[MP3Info]


class MusicSyncRequest(BulkTracksRequest):
    folder: str = Field(min_length=1)


class MusicSyncInfo(BaseModel):
    status: Literal["syncing", "done", "failed"]
    total: int = 0
    added: int = 0
    updated: int = 0
    failed: list[BulkFailure] = Field(default_factory=list)
    without_art: list[BulkFailure] = Field(default_factory=list)
    error: Optional[str] = None


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


class PlaylistInfo(BaseModel):
    id: str
    name: str
    description: str = ""
    track_count: int = 0
    has_cover: bool = False
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
