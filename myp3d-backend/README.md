# myp3d-backend

FastAPI backend for downloading YouTube audio as MP3, storing files locally, and editing MP3 metadata/artwork.

## What This Service Does

- Downloads a YouTube URL as a 320 kbps MP3.
- Searches YouTube videos via `yt-dlp` for Query page discovery.
- Stores MP3 files in the local `downloads/` folder.
- Reads and updates ID3 metadata (title, artist, album).
- Adds or replaces cover artwork (normalized to `500x500` JPEG).
- Serves MP3 files and embedded cover images over HTTP.

Core stack:

- `FastAPI` for API routes.
- `yt-dlp` + `ffmpeg` for audio download/extraction.
- `eyed3` for ID3 metadata updates.
- `Pillow` for cover image cropping/resizing.

## Runtime Flow

1. Frontend Query page calls `GET /youtube/search` to fetch candidate videos.
2. Frontend selects one result and submits `POST /download` with URL and optional metadata.
3. Backend downloads audio via `yt-dlp`, extracts MP3 via ffmpeg.
4. Backend writes metadata and optional uploaded cover image.
5. Frontend lists files via `GET /mp3s` and edits via `/mp3s/{filename}/...` endpoints.

## API Surface

### Health

- `GET /`
	- Returns backend status payload.

### Download

- `POST /download`
	- Body: `DownloadRequest` (`url`, optional `custom_filename`, `title`, `artist`, `album`, `cover_image_base64`).
	- Returns: `DownloadResponse` (`success`, `filename`, `message`).

### YouTube Discovery

- `GET /youtube/search`
	- Query params: `query` (required), `limit` (optional, `1-30`, default `12`).
	- Returns: `YouTubeSearchResponse` with lightweight result fields for Query page.

### MP3 Library

- `GET /mp3s`
	- List all MP3s with metadata summary.
- `GET /mp3s/{filename}`
	- Download/stream MP3 file.
- `GET /mp3s/{filename}/info`
	- Read metadata for one MP3.
- `PUT /mp3s/{filename}/metadata`
	- Update metadata and optional rename (`new_filename`).
- `POST /mp3s/{filename}/cover`
	- Upload image file and set as cover art.
- `GET /mp3s/{filename}/cover`
	- Read embedded cover art bytes.
- `DELETE /mp3s/{filename}`
	- Delete MP3 from local library.
- `POST /mp3s/upload`
	- Upload an existing MP3 to the library.

## Project Structure

```text
myp3d-backend/
	main.py                    # FastAPI app entrypoint + CORS + router mounting
	requirements.txt           # Python dependencies
	.env                       # Runtime config (ffmpeg mode)
	ffmpeg.exe                 # Local ffmpeg binary (Windows mode)
	downloads/                 # Saved MP3 files
	models/
		schemas.py               # Pydantic request/response models
	routers/
		download.py              # /download endpoint
		mp3s.py                  # /mp3s* endpoints
		youtube.py               # /youtube/search endpoint
	services/
		config.py                # env loading + output directory + ffmpeg path logic
		mp3_service.py           # yt-dlp download + metadata + artwork processing
		youtube_service.py       # yt-dlp search + result mapping
	utils/
		inspect_id3_artwork.py   # helper scripts for ID3 artwork debugging
		normalize_itunes_artwork.py
```

## File Responsibility Map (for AI and Maintainers)

- Route wiring: `main.py`
- Request/response models: `models/schemas.py`
- Download orchestration: `routers/download.py` -> `services/mp3_service.py::download_as_mp3`
- YouTube search orchestration: `routers/youtube.py` -> `services/youtube_service.py::search_youtube`
- Metadata/cover update endpoints: `routers/mp3s.py`
- Artwork crop/normalize logic: `services/mp3_service.py::make_square_cover`
- Cover frame writing behavior: `services/mp3_service.py::set_cover_images`
- Storage location config: `services/config.py`

If a bug is about:

- URL download failure: inspect `download_as_mp3` and ffmpeg config first.
- Query page search results: inspect `youtube_search` route and `search_youtube` mapping.
- Bad artwork in players: inspect `make_square_cover` and `set_cover_images`.
- Rename/metadata mismatch: inspect `routers/mp3s.py::update_metadata`.

## Configuration

Backend `.env`:

```env
USE_SYSTEM_FFMPEG=false
```

- `false`: use `ffmpeg.exe` from backend root (Windows default).
- `true`: use system ffmpeg from `PATH` (macOS/Linux typical).

Frontend CORS origins allowed by default:

- `http://localhost:5173`
- `http://localhost:3000`

Update in `main.py` if you run frontend from another origin.

## Local Development

From `myp3d-backend/`:

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

Or use root scripts documented in `../run/README.md`.

## Data Notes

- Files are saved in `downloads/`.
- Filenames are user-controlled on rename, with collision checks.
- Cover uploads are converted to 500x500 JPEG for consistency.

## Known Constraints

- Backend storage is local filesystem only (no DB/object storage yet).
- No auth; endpoints are intended for local/dev trusted usage.
- Large libraries are listed from local directory each request (no pagination at API layer).
- YouTube search uses `yt-dlp` (no API key), so upstream metadata quality can vary by result.
- Query autofill for artist is best-effort creator fallback (`uploader` then `channel`), not guaranteed music artist data.

## Quick Endpoint Smoke Checks

```bash
curl http://localhost:8000/
curl http://localhost:8000/mp3s
curl "http://localhost:8000/youtube/search?query=lofi&limit=3"
```
