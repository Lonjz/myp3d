import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Literal, Optional, Union

from models.schemas import SyncDatabase, SyncDiffRecord, SyncFavoriteRecord, SyncPlaylistRecord, SyncQueueRecord
from services import favorite_service, playlist_service, queue_service

RecordKind = Literal["playlist", "download", "favorite"]
Record = Union[SyncPlaylistRecord, SyncQueueRecord, SyncFavoriteRecord]
RecordKey = tuple[RecordKind, str]


@dataclass
class RecordPull:
    kind: RecordKind
    record: Record
    replaces: bool

    @property
    def key(self) -> str:
        return _record_key(self.record)


def _record_key(record: Record) -> str:
    if isinstance(record, SyncPlaylistRecord):
        return record.id
    if isinstance(record, SyncFavoriteRecord):
        return record.filename
    return record.uid


def _keyed(database: SyncDatabase) -> dict[RecordKey, Record]:
    keyed: dict[RecordKey, Record] = {("playlist", record.id): record for record in database.playlists}
    keyed.update({("download", record.uid): record for record in database.downloads})
    keyed.update({("favorite", record.filename): record for record in database.favorites})
    return keyed


def _stamp(record: Record) -> datetime:
    stamp = datetime.fromisoformat(record.updated_at)
    return stamp if stamp.tzinfo is not None else stamp.replace(tzinfo=timezone.utc)


def local_database() -> SyncDatabase:
    return SyncDatabase(
        playlists=playlist_service.sync_records(),
        downloads=queue_service.sync_records(),
        favorites=favorite_service.sync_records(),
    )


def busy_downloads() -> set[str]:
    return queue_service.active_uids()


def plan_pulls(
    local: SyncDatabase,
    remote: SyncDatabase,
    prefer_remote: bool,
    busy: set[str] = frozenset(),
) -> list[RecordPull]:
    current = _keyed(local)
    pulls: list[RecordPull] = []
    for (kind, key), record in _keyed(remote).items():
        mine = current.get((kind, key))
        if mine is None:
            pulls.append(RecordPull(kind, record, False))
            continue
        if mine == record or (kind == "download" and key in busy):
            continue
        theirs, ours = _stamp(record), _stamp(mine)
        if theirs > ours or (theirs == ours and prefer_remote):
            pulls.append(RecordPull(kind, record, True))
    return pulls


def record_name(record: Record) -> str:
    if isinstance(record, SyncPlaylistRecord):
        return record.name
    if isinstance(record, SyncFavoriteRecord):
        return Path(record.filename).stem
    return record.title or record.custom_filename or record.url


def is_visible(pull: RecordPull) -> bool:
    return pull.replaces or pull.record.deleted_at is None


def diff_record(kind: RecordKind, record: Record, replaces: bool = False) -> SyncDiffRecord:
    return SyncDiffRecord(
        kind=kind,
        key=_record_key(record),
        name=record_name(record),
        deleted=record.deleted_at is not None,
        replaces=replaces,
    )


def shared_records(local: SyncDatabase, remote: SyncDatabase, moving: set[RecordKey]) -> list[SyncDiffRecord]:
    theirs = _keyed(remote)
    return [
        diff_record(kind, record)
        for (kind, key), record in _keyed(local).items()
        if (kind, key) in theirs and (kind, key) not in moving and record.deleted_at is None
    ]


def local_cover(kind: RecordKind, key: str) -> Optional[bytes]:
    return playlist_service.cover_by_id(key) if kind == "playlist" else queue_service.cover_by_uid(key)


def apply_pull(
    pull: RecordPull,
    local: SyncDatabase,
    fetch_cover: Callable[[RecordKind, str], bytes],
) -> bool:
    if isinstance(pull.record, SyncFavoriteRecord):
        favorite_service.apply_record(pull.record)
        return True
    wanted = pull.record.cover_hash
    cover: Optional[bytes] = None
    if wanted is not None:
        mine = _keyed(local).get((pull.kind, pull.key))
        cover = local_cover(pull.kind, pull.key) if mine is not None and mine.cover_hash == wanted else None
        if cover is None:
            cover = fetch_cover(pull.kind, pull.key)
        if hashlib.sha1(cover).hexdigest() != wanted:
            raise ValueError("The cover didn't arrive intact")
    if isinstance(pull.record, SyncPlaylistRecord):
        playlist_service.apply_record(pull.record, cover)
        return True
    return queue_service.apply_record(pull.record, cover)
