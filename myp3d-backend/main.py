import ipaddress
from contextlib import asynccontextmanager
from typing import Optional
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import albums, cache, download, export, favorites, health, mp3s, music, peer, playlists, queue, search, spotify, stats, sync, system, youtube
from services import database_sync, db, date_service, favorite_playlist, favorite_service, mp3_service, music_playlist_service, music_service, playlist_service, queue_service
from services.config import API_PORT, API_RELOAD, VERSION
from services.discovery_service import discovery
from services.errors import AppError

PEER_PREFIX = "/peer/"
ALLOWED_ORIGINS = [f"http://{host}:{port}" for host in ("localhost", "127.0.0.1") for port in (5173, 5174, 4173)]


def _is_loopback(host: Optional[str]) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host or "").is_loopback
    except ValueError:
        return False


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.enable_wal()
    mp3_service.sweep_partial_files()
    mp3_service.init()
    queue_service.init()
    playlist_service.init()
    favorite_service.init()
    date_service.init()
    music_playlist_service.init()
    music_service.init()
    database_sync.purge_tombstones()
    favorite_playlist.ensure()
    yield
    discovery.stop()


app = FastAPI(title="myp3d", version=VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error(_: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.middleware("http")
async def local_only(request: Request, call_next):
    if request.url.path.startswith(PEER_PREFIX):
        return await call_next(request)
    client = request.client.host if request.client else None
    host_header = urlsplit(f"//{request.headers.get('host', '')}").hostname
    origin = request.headers.get("origin")
    if _is_loopback(client) and _is_loopback(host_header) and (origin is None or origin in ALLOWED_ORIGINS):
        return await call_next(request)
    return JSONResponse(status_code=403, content={"detail": "Only this device can use the app"})


for module in (download, albums, mp3s, youtube, stats, search, cache, sync, peer, music, queue, spotify, export, health, playlists, favorites, system):
    app.include_router(module.router)


@app.get("/")
async def root():
    return {"name": "myp3d", "version": VERSION}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=API_PORT, reload=API_RELOAD)
