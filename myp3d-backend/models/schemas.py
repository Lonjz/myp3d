from typing import Optional
from pydantic import BaseModel


class DownloadRequest(BaseModel):
    url: str
    custom_filename: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    cover_image_base64: Optional[str] = None


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
