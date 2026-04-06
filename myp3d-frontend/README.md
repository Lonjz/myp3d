# myp3d-frontend

React + TypeScript + Vite UI for downloading, browsing, and editing local MP3 files managed by the backend API.

## What This App Does

- `Download` page:
  - Submit YouTube URL.
  - URL input stays in its own top row.
  - Metadata fields and cover upload are split into two columns.
  - Optional filename/title/artist/album metadata.
  - Optional cover image upload, crop, and preview using a shared square click-to-upload component.
- `Query` page:
  - Search YouTube from the backend `yt-dlp` endpoint.
  - Browse results in a left sidebar and preview selected video in an embedded player.
  - Autofill URL/title/artist/album from selected result.
  - Uses the same cover upload UI and config layout as Download page.
- `Library` page:
  - Show local MP3 library in a table.
  - Search/filter by title, artist, album, filename.
  - Local pagination (25 rows per page).
  - Per-row actions: edit, download, delete.
- `Details` page:
  - Edit metadata and cover for a selected song.
  - Left sidebar to quickly switch between songs.
- `Albums` page:
  - Show grouped albums (same album name across different artists counts as one album group).
  - Search/sort albums and open album edit screen.
- `Album Edit` page:
  - Rename album for all tracks in the selected group.
  - Apply a single cover to all tracks in the selected group.
  - Includes left sidebar for quick album-to-album navigation.

## Routing

- `/download` -> `DownloadPage`
- `/query` -> `QueryPage`
- `/library` -> `LibraryPage`
- `/details/:songName` -> `EditPage`
- `/albums` -> `AlbumsPage`
- `/albums/:albumKey` -> `AlbumEditPage`
- `/` redirects to `/download`

Route wiring is in `src/App.tsx`.

## Project Structure

```text
myp3d-frontend/
  package.json
  .env                         # VITE_API_BASE_URL
  src/
    main.tsx                   # BrowserRouter + app bootstrapping
    App.tsx                    # Top-level nav + route definitions
    App.css                    # Shared styles (download/query/library/details/albums)
    index.css                  # Global base styles
    api/
      mp3Api.ts                # Backend client (all HTTP calls)
    components/
      CoverUploadSquare.tsx    # Shared square uploader UI for Download/Query cover input
    pages/
      DownloadPage.tsx         # Download form + cover crop modal
      QueryPage.tsx            # YouTube search + preview + autofill download form
      LibraryPage.tsx          # Search/filter table + pagination
      EditPage.tsx             # Metadata/cover editor + sidebar picker
      AlbumsPage.tsx           # Album list/search/sort/pagination
      AlbumEditPage.tsx        # Bulk album metadata/cover editor + sidebar picker
```

## Data/API Integration

All backend calls are centralized in `src/api/mp3Api.ts`.

Base URL:

- `VITE_API_BASE_URL` from `.env`
- fallback: `http://localhost:8000`

Client methods:

- `download(request)` -> `POST /download`
- `searchYouTube(query, limit)` -> `GET /youtube/search`
- `listAll()` -> `GET /mp3s`
- `getInfo(filename)` -> `GET /mp3s/{filename}/info`
- `updateMetadata(filename, metadata)` -> `PUT /mp3s/{filename}/metadata`
- `updateCover(filename, file)` -> `POST /mp3s/{filename}/cover`
- `delete(filename)` -> `DELETE /mp3s/{filename}`
- `getCoverUrl(filename)` and `getFileUrl(filename)` for media URLs
- `listAlbums()` -> `GET /albums`
- `getAlbum(albumKey)` -> `GET /albums/{album_key}`
- `updateAlbum(albumKey, payload)` -> `PUT /albums/{album_key}`
- `updateAlbumCover(albumKey, file)` -> `POST /albums/{album_key}/cover`
- `getAlbumCoverUrl(albumKey)` for album cover previews

## File Responsibility Map (for AI and Maintainers)

- Route-level behavior: `src/App.tsx`
- HTTP boundary + typed contracts: `src/api/mp3Api.ts`
- Download and image crop UX: `src/pages/DownloadPage.tsx`
- Query/search + embedded preview workflow: `src/pages/QueryPage.tsx`
- Library search/filter/pagination UX: `src/pages/LibraryPage.tsx`
- Song edit workflow and sidebar navigation: `src/pages/EditPage.tsx`
- Albums listing and album-level navigation: `src/pages/AlbumsPage.tsx`
- Album-level edit workflow: `src/pages/AlbumEditPage.tsx`
- Shared cover upload interaction: `src/components/CoverUploadSquare.tsx`
- Visual consistency and layout behavior: `src/App.css`

If a bug is about:

- Wrong endpoint or payload: check `src/api/mp3Api.ts` first.
- Route navigation issues: check `src/App.tsx`.
- Query search results, selection, or preview: check `src/pages/QueryPage.tsx`.
- Cover crop/preview behavior: check `src/pages/DownloadPage.tsx` and `src/pages/EditPage.tsx`.
- Download/Query cover picker behavior parity: check `src/components/CoverUploadSquare.tsx`.
- Library rendering/performance/filtering: check `src/pages/LibraryPage.tsx`.
- Album grouping/list/detail rendering: check `src/pages/AlbumsPage.tsx` and `src/pages/AlbumEditPage.tsx`.

## Local Development

From `myp3d-frontend/`:

```bash
npm install
npm run dev
```

Useful scripts:

- `npm run dev` - Vite dev server
- `npm run build` - type-check + production build
- `npm run preview` - serve built app
- `npm run lint` - ESLint

## Environment

`.env` example:

```env
VITE_API_BASE_URL=http://localhost:8000
```

If backend runs on a different host/port, update this value and restart dev server.

## Expected Backend Contract

This frontend assumes backend behavior from `myp3d-backend`:

- Download endpoint returns `{ success, filename, message }`.
- MP3 list endpoint returns objects with:
  - `filename`
  - `title`
  - `artist`
  - `album`
  - `has_cover`
  - `file_size`
- YouTube search endpoint returns `results[]` with:
  - `video_id`
  - `url`
  - `title`
  - `artist` (best-effort fallback from creator metadata)
  - `album` (often empty)
  - `thumbnail_url` (for sidebar visuals)
  - `duration`
- Cover endpoint accepts multipart image upload.
- Albums endpoints return grouped album metadata and track lists:
  - `GET /albums`
  - `GET /albums/{album_key}`
  - `PUT /albums/{album_key}`
  - `POST /albums/{album_key}/cover`
  - `GET /albums/{album_key}/cover`

## Notes for Future Work

- Sorting can be added to the library table without backend changes.
- Server-side pagination can be added later by extending `GET /mp3s`.
- If filename identity becomes unstable after rename, migrate route identity from filename to a persistent ID.
