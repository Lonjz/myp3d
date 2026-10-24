from collections import Counter
from datetime import datetime, timezone

from models.schemas import (
    AlbumStat,
    ArtistStat,
    DayBucket,
    DurationBucket,
    LibraryHealth,
    LibraryStats,
    MonthBucket,
)
from services import favorite_service, playlist_service
from services.mp3_service import (
    DURATION_RANGES,
    NO_ALBUM_LABEL,
    build_album_groups,
    duplicate_filenames,
    list_mp3_infos,
)


TOP_ARTIST_LIMIT = 8
TOP_ALBUM_LIMIT = 10
RECENT_TRACK_LIMIT = 7
FAVORITE_TRACK_LIMIT = 7
MONTHS_OF_HISTORY = 12

DURATION_LABELS: dict[str, str] = {
    "under-2": "< 2m",
    "2-3": "2–3m",
    "3-4": "3–4m",
    "4-5": "4–5m",
    "5-7": "5–7m",
    "over-7": "7m+",
}


def _is_blank(value: str | None) -> bool:
    return not (value or "").strip()


def _month_keys(now: datetime, count: int) -> list[str]:
    year, month = now.year, now.month
    keys: list[str] = []
    for _ in range(count):
        keys.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(keys))


def compute_library_stats() -> LibraryStats:
    tracks = list_mp3_infos()
    album_groups = build_album_groups()

    total_tracks = len(tracks)
    total_size = sum(track.file_size for track in tracks)
    durations = [track.duration for track in tracks if track.duration]
    total_duration = float(sum(durations))

    artist_counts: Counter[str] = Counter()
    artist_display: dict[str, str] = {}
    for track in tracks:
        if _is_blank(track.artist):
            continue
        name = track.artist.strip()
        key = name.casefold()
        artist_counts[key] += 1
        artist_display.setdefault(key, name)

    real_albums = [group for group in album_groups.values() if group.album_name != NO_ALBUM_LABEL]
    top_albums = sorted(real_albums, key=lambda group: (-len(group.tracks), group.album_name.lower()))

    month_keys = _month_keys(datetime.now(timezone.utc), MONTHS_OF_HISTORY)
    month_counts = {key: [0, 0] for key in month_keys}
    for track in tracks:
        if track.date_added is None:
            continue
        key = track.date_added.strftime("%Y-%m")
        if key in month_counts:
            month_counts[key][0] += 1
            month_counts[key][1] += track.file_size

    day_counts: Counter[str] = Counter(
        track.date_added.astimezone().date().isoformat() for track in tracks if track.date_added is not None
    )

    while len(month_keys) > 1 and month_counts[month_keys[0]][0] == 0:
        del month_counts[month_keys.pop(0)]

    duration_counts = {key: 0 for key in DURATION_RANGES}
    for duration in durations:
        for key, (lower, upper) in DURATION_RANGES.items():
            if lower <= duration < upper:
                duration_counts[key] += 1
                break

    listed = playlist_service.listed_filenames()
    tracks_by_name = {track.filename: track for track in tracks}
    favorite_names = [name for name in favorite_service.list_ordered() if name in tracks_by_name]

    oldest = datetime.min.replace(tzinfo=timezone.utc)
    recent_tracks = sorted(tracks, key=lambda track: track.date_added or oldest, reverse=True)

    return LibraryStats(
        total_tracks=total_tracks,
        total_albums=len(real_albums),
        total_artists=len(artist_counts),
        total_size=total_size,
        total_duration=total_duration,
        total_favorites=len(favorite_names),
        average_size=total_size / total_tracks if total_tracks else 0.0,
        average_duration=total_duration / len(durations) if durations else 0.0,
        tracks_with_cover=sum(1 for track in tracks if track.has_cover),
        health=LibraryHealth(
            missing_title=sum(1 for track in tracks if _is_blank(track.title)),
            missing_artist=sum(1 for track in tracks if _is_blank(track.artist)),
            missing_album=sum(1 for track in tracks if _is_blank(track.album)),
            missing_cover=sum(1 for track in tracks if not track.has_cover),
            duplicates=len(duplicate_filenames(tracks)),
            unlisted=sum(1 for track in tracks if track.filename not in listed),
        ),
        top_artists=[
            ArtistStat(name=artist_display[key], track_count=count)
            for key, count in artist_counts.most_common(TOP_ARTIST_LIMIT)
        ],
        top_albums=[
            AlbumStat(
                album_key=group.album_key,
                album_name=group.album_name,
                track_count=len(group.tracks),
                total_size=group.total_size,
                has_cover=group.has_cover,
            )
            for group in top_albums[:TOP_ALBUM_LIMIT]
        ],
        additions_by_month=[
            MonthBucket(month=key, track_count=count, total_size=size)
            for key, (count, size) in month_counts.items()
        ],
        additions_by_day=[DayBucket(date=day, track_count=count) for day, count in sorted(day_counts.items())],
        duration_histogram=[
            DurationBucket(key=key, label=DURATION_LABELS[key], track_count=count)
            for key, count in duration_counts.items()
        ],
        recent_tracks=recent_tracks[:RECENT_TRACK_LIMIT],
        favorite_tracks=[tracks_by_name[name] for name in reversed(favorite_names[-FAVORITE_TRACK_LIMIT:])],
    )
