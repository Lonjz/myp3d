# myp3d-backend

FastAPI backend for YouTube-to-MP3 downloads, metadata edits, and album grouping.

## Quick start

```bash
python -m venv venv
```

Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

macOS/Linux:

```bash
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Config

`.env`:

```env
USE_SYSTEM_FFMPEG=false
```

- `false`: use bundled `ffmpeg.exe` (Windows default)
- `true`: use system ffmpeg from `PATH`

## Key endpoints

- `GET /` health
- `POST /download` download + tag
- `GET /youtube/search` search
- `GET /mp3s/paged` list with pagination
- `GET /mp3s/{filename}` stream/download
- `GET /mp3s/{filename}/info` metadata
- `PUT /mp3s/{filename}/metadata` update + optional rename
- `POST /mp3s/{filename}/cover` update cover
- `GET /mp3s/{filename}/cover` cover bytes
- `DELETE /mp3s/{filename}` delete
- `POST /mp3s/upload` upload MP3
- `GET /albums/paged` list albums
- `GET /albums/{album_key}` album detail
- `PUT /albums/{album_key}` rename album
- `POST /albums/{album_key}/cover` update album cover
- `GET /albums/{album_key}/cover` album cover bytes

## Notes

- Files are stored in `downloads/`.
- Local filesystem only; no auth.
