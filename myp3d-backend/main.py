from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import albums, cache, download, mp3s, search, stats, sync, youtube
from services.config import API_PORT
from services.discovery_service import discovery


@asynccontextmanager
async def lifespan(_: FastAPI):
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

# Include routers
app.include_router(download.router)
app.include_router(albums.router)
app.include_router(mp3s.router)
app.include_router(youtube.router)
app.include_router(stats.router)
app.include_router(search.router)
app.include_router(cache.router)
app.include_router(sync.router)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "running", "message": "MP3 Download API is active"}


# Run with: uvicorn main:app --reload
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=API_PORT, reload=True)
