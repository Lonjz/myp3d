# myp3d-backend

FastAPI server for downloads, tagging, the library database and sync. Setup and config are in the [main README](../README.md).

```bash
venv/bin/python main.py                 # Windows: venv\Scripts\python main.py
venv/bin/python -m pytest tests         # Windows: venv\Scripts\python -m pytest tests
```

Endpoints are documented at http://localhost:8000/docs while the server runs.

## Layout

- `routers/` HTTP routes, one file per area, with shared helpers in `common.py`
- `services/` the actual work: the library cache, yt-dlp, covers, playlists, sync, Apple Music
- `services/track_records.py` renames and deletes a song everywhere it's referenced
- `services/filenames.py` the rules for song file names
- `services/errors.py` `AppError`, which `main.py` turns into an HTTP error
- `models/schemas.py` request and response models
- `applescripts/` scripts the Apple Music sync runs through `osascript`
- `tests/` pytest suite, fakes for YouTube, Spotify and YouTube Music, and the sandbox (`tests/sandbox.py`)

## Database

`myp3d.db` (or `MYP3D_DB_PATH`) is a SQLite file created on first run. It holds playlists, favourites, the download queue, the date each song was added, and the Apple Music links. Your songs and their tags live only in the MP3 files.

## Tests

The suite runs against a temporary library and database, generates its audio with ffmpeg, and fails if anything tries to reach the internet. Fixtures in `tests/conftest.py`:

- `library`, `seeded_library`, `peer_library` for songs on disk
- `client` and `make_client` for API calls
- `youtube`, `web` and `ytmusic` for the fake outside world
- `make_playlist`, `star` and `manifest` for playlists, favourites and sync
