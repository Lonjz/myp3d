import ipaddress
from contextlib import asynccontextmanager
from typing import Optional
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import albums, cache, download, export, favorites, mp3s, music, peer, playlists, queue, search, spotify, stats, sync, youtube
from services import favorite_playlist, favorite_service, music_playlist_service, playlist_service, queue_service
from services.config import API_PORT
from services.discovery_service import discovery

PEER_PREFIX = "/peer/"


def _is_loopback(host: Optional[str]) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host or "").is_loopback
    except ValueError:
        return False


@asynccontextmanager
async def lifespan(_: FastAPI):
    queue_service.init()
    playlist_service.init()
    favorite_service.init()
    music_playlist_service.init()
    favorite_playlist.ensure()
    yield
    discovery.stop()


app = FastAPI(
    title="MP3 Download API",
    description="YouTube to MP3 converter and metadata editor",
    lifespan=lifespan,
)

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def local_only(request: Request, call_next):
    if request.url.path.startswith(PEER_PREFIX):
        return await call_next(request)
    client = request.client.host if request.client else None
    host_header = urlsplit(f"//{request.headers.get('host', '')}").hostname
    if _is_loopback(client) and _is_loopback(host_header):
        return await call_next(request)
    return JSONResponse(status_code=403, content={"detail": "Only this device can use the app"})


# Include routers
app.include_router(download.router)
app.include_router(albums.router)
app.include_router(mp3s.router)
app.include_router(youtube.router)
app.include_router(stats.router)
app.include_router(search.router)
app.include_router(cache.router)
app.include_router(sync.router)
app.include_router(peer.router)
app.include_router(music.router)
app.include_router(queue.router)
app.include_router(spotify.router)
app.include_router(export.router)
app.include_router(playlists.router)
app.include_router(favorites.router)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "running", "message": "MP3 Download API is active"}


# Run with: uvicorn main:app --reload
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=API_PORT, reload=True)
