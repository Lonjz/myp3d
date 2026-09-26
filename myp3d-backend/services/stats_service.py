from collections import Counter
from datetime import datetime, timezone

from models.schemas import (
    AlbumStat,
    ArtistStat,
    DurationBucket,
    LibraryHealth,
    LibraryStats,
    MonthBucket,
)
from services.mp3_service import NO_ALBUM_LABEL, build_album_groups, list_mp3_infos


TOP_ARTIST_LIMIT = 8
TOP_ALBUM_LIMIT = 6
RECENT_TRACK_LIMIT = 6
MONTHS_OF_HISTORY = 12

DURATION_BUCKETS: list[tuple[str, float]] = [
    ("< 2m", 120),
    ("2–3m", 180),
    ("3–4m", 240),
    ("4–5m", 300),
    ("5–7m", 420),
    ("7m+", float("inf")),
]


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

    while len(month_keys) > 1 and month_counts[month_keys[0]][0] == 0:
        del month_counts[month_keys.pop(0)]

    bucket_counts = [0] * len(DURATION_BUCKETS)
    for duration in durations:
        for index, (_, upper) in enumerate(DURATION_BUCKETS):
            if duration < upper:
                bucket_counts[index] += 1
                break

    oldest = datetime.min.replace(tzinfo=timezone.utc)
    recent_tracks = sorted(tracks, key=lambda track: track.date_added or oldest, reverse=True)

    return LibraryStats(
        total_tracks=total_tracks,
        total_albums=len(real_albums),
        total_artists=len(artist_counts),
        total_size=total_size,
        total_duration=total_duration,
        average_size=total_size / total_tracks if total_tracks else 0.0,
        average_duration=total_duration / len(durations) if durations else 0.0,
        tracks_with_cover=sum(1 for track in tracks if track.has_cover),
        health=LibraryHealth(
            missing_title=sum(1 for track in tracks if _is_blank(track.title)),
            missing_artist=sum(1 for track in tracks if _is_blank(track.artist)),
            missing_album=sum(1 for track in tracks if _is_blank(track.album)),
            missing_cover=sum(1 for track in tracks if not track.has_cover),
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
        duration_histogram=[
            DurationBucket(label=label, track_count=count)
            for (label, _), count in zip(DURATION_BUCKETS, bucket_counts)
        ],
        recent_tracks=recent_tracks[:RECENT_TRACK_LIMIT],
    )
