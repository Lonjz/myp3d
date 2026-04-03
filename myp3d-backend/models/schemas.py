from typing import Optional
from pydantic import BaseModel


class DownloadRequest(BaseModel):
    url: str
    custom_filename: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None


class DownloadResponse(BaseModel):
    success: bool
    filename: str
    message: str


class MetadataUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    new_filename: Optional[str] = None


class MP3Info(BaseModel):
    filename: str
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    has_cover: bool = False
    file_size: int = 0


class NormalizeAudioFileResult(BaseModel):
    filename: str
    status: str
    original_peak_db: Optional[float] = None
    applied_gain_db: Optional[float] = None
    message: Optional[str] = None


class NormalizeAudioResponse(BaseModel):
    success: bool
    processed: int
    normalized: int
    skipped: int
    failed: int
    target_peak_db: float
    results: list[NormalizeAudioFileResult]
