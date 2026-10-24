# myp3d-backend

FastAPI server for downloads, tagging, the library database and sync. Setup and config are in the [main README](../README.md).

```bash
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
python main.py
```

Endpoints are documented at http://localhost:8000/docs while the server runs.

## Layout

- `routers/` HTTP routes, one file per area
- `services/` the actual work: yt-dlp, eyed3, playlists, sync, Apple Music
- `models/schemas.py` request and response models
- `applescripts/` scripts the Apple Music sync runs through `osascript`
- `myp3d.db` SQLite file for playlists, favourites and the download queue (created on first run)
