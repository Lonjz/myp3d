from typing import Literal, Optional

from pydantic import BaseModel, Field

from models.library import BulkFailure, MP3Info

MusicSyncStatus = Literal["syncing", "done", "failed"]
MusicChange = Literal["title", "artist", "album", "art", "audio", "favorite", "unfavorite", "favorite_music", "unfavorite_music"]
MusicPlaylistAction = Literal["import", "export", "pull", "push", "link", "delete_local", "delete_music", "in_sync"]


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
    album_artist: Optional[str] = None


class MusicAlbumIssue(BaseModel):
    key: str
    album: Optional[str] = None
    album_artists: list[str]
    artists: list[str]
    track_count: int


class MusicAlbumFixRequest(BaseModel):
    keys: list[str] = Field(min_length=1)


class MusicPair(BaseModel):
    track: MP3Info
    music: MusicTrack
    changes: list[MusicChange] = Field(default_factory=list)


class MusicDiff(BaseModel):
    only_in_music: list[MusicTrack]
    both: list[MusicPair]
    only_in_library: list[MP3Info]


class MusicSyncInfo(BaseModel):
    status: MusicSyncStatus
    total: int = 0
    added: int = 0
    updated: int = 0
    failed: list[BulkFailure] = Field(default_factory=list)
    without_art: list[BulkFailure] = Field(default_factory=list)
    error: Optional[str] = None


class MusicPlaylistEntry(BaseModel):
    key: str
    name: str
    action: MusicPlaylistAction
    track_count: int = 0
    left_out: int = 0
    playlist_id: Optional[str] = None
    has_cover: bool = False
    updated_at: Optional[str] = None


class MusicPlaylistDiff(BaseModel):
    songs_pending: int = 0
    only_in_music: list[MusicPlaylistEntry]
    in_sync: list[MusicPlaylistEntry]
    to_sync: list[MusicPlaylistEntry]


class MusicPlaylistSyncInfo(BaseModel):
    status: MusicSyncStatus
    total: int = 0
    created: int = 0
    updated: int = 0
    deleted: int = 0
    failed: list[BulkFailure] = Field(default_factory=list)
    without_art: list[BulkFailure] = Field(default_factory=list)
    error: Optional[str] = None
