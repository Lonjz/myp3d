from pydantic import BaseModel

from models.library import MP3Info


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


class DayBucket(BaseModel):
    date: str
    track_count: int


class DurationBucket(BaseModel):
    key: str
    label: str
    track_count: int


class LibraryHealth(BaseModel):
    missing_title: int
    missing_artist: int
    missing_album: int
    missing_cover: int
    duplicates: int
    unlisted: int


class LibraryStats(BaseModel):
    total_tracks: int
    total_albums: int
    total_artists: int
    total_size: int
    total_duration: float
    total_favorites: int
    average_size: float
    average_duration: float
    tracks_with_cover: int
    health: LibraryHealth
    top_artists: list[ArtistStat]
    top_albums: list[AlbumStat]
    additions_by_month: list[MonthBucket]
    additions_by_day: list[DayBucket]
    duration_histogram: list[DurationBucket]
    recent_tracks: list[MP3Info]
    favorite_tracks: list[MP3Info]
