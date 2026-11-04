from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class SyncDevice(BaseModel):
    id: str = Field(max_length=64)
    name: str = Field(max_length=64)


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
    session_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    device: SyncDevice
    port: int = Field(ge=1, le=65535)
    version: str = "0"


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
    audio_fingerprint: Optional[str] = None
    tag_fingerprint: Optional[str] = None
    duration: Optional[float] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    has_cover: bool = False
    date_added: Optional[datetime] = None


class SyncDiffTrack(BaseModel):
    filename: str
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    has_cover: bool = False
    updates: bool = False
    audio: bool = False
    dated: bool = False


class SyncDiffRecord(BaseModel):
    kind: Literal["playlist", "download", "favorite"]
    key: str
    name: str
    deleted: bool = False
    replaces: bool = False


class SyncDiff(BaseModel):
    incoming: list[SyncDiffTrack]
    both: list[SyncDiffTrack]
    outgoing: list[SyncDiffTrack]
    incoming_records: list[SyncDiffRecord] = Field(default_factory=list)
    both_records: list[SyncDiffRecord] = Field(default_factory=list)
    outgoing_records: list[SyncDiffRecord] = Field(default_factory=list)


class SyncRecordTimes(BaseModel):
    created_at: str
    updated_at: str
    deleted_at: Optional[str] = None

    @field_validator("created_at", "updated_at", "deleted_at")
    @classmethod
    def _check_time(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            datetime.fromisoformat(value)
        return value


class SyncPlaylistRecord(SyncRecordTimes):
    id: str = Field(pattern=r"^[0-9a-f]{32}$")
    name: str = Field(min_length=1)
    description: str = ""
    filenames: list[str] = Field(default_factory=list)
    cover_hash: Optional[str] = None
    is_favorites: bool = False


class SyncQueueRecord(SyncRecordTimes):
    uid: str = Field(pattern=r"^[0-9a-f]{32}$")
    url: str = Field(min_length=1)
    custom_filename: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    cover_hash: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    overwrite: bool = False
    status: Literal["pending", "failed", "done"]
    error: Optional[str] = None
    filename: Optional[str] = None
    finished_at: Optional[str] = None


class SyncFavoriteRecord(SyncRecordTimes):
    filename: str = Field(pattern=r"^[^/\\]+\.[mM][pP]3$")


class SyncDatabase(BaseModel):
    playlists: list[SyncPlaylistRecord] = Field(default_factory=list)
    downloads: list[SyncQueueRecord] = Field(default_factory=list)
    favorites: list[SyncFavoriteRecord] = Field(default_factory=list)
