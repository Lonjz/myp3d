# myp3d-frontend

React + TypeScript + Vite UI for downloading, browsing, and editing local MP3 files managed by the backend API.

## What This App Does

- `Download` page:
  - Submit YouTube URL.
  - Optional filename/title/artist/album metadata.
  - Optional cover image upload, crop, and preview.
- `Library` page:
  - Show local MP3 library in a table.
  - Search/filter by title, artist, album, filename.
  - Local pagination (25 rows per page).
  - Per-row actions: edit, download, delete.
- `Details` page:
  - Edit metadata and cover for a selected song.
  - Left sidebar to quickly switch between songs.

## Routing

- `/download` -> `DownloadPage`
- `/library` -> `LibraryPage`
- `/details/:songName` -> `EditPage`
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
    App.css                    # Shared styles (download/library/details)
    index.css                  # Global base styles
    api/
      mp3Api.ts                # Backend client (all HTTP calls)
    pages/
      DownloadPage.tsx         # Download form + cover crop modal
      LibraryPage.tsx          # Search/filter table + pagination
      EditPage.tsx             # Metadata/cover editor + sidebar picker
```

## Data/API Integration

All backend calls are centralized in `src/api/mp3Api.ts`.

Base URL:

- `VITE_API_BASE_URL` from `.env`
- fallback: `http://localhost:8000`

Client methods:

- `download(request)` -> `POST /download`
- `listAll()` -> `GET /mp3s`
- `getInfo(filename)` -> `GET /mp3s/{filename}/info`
- `updateMetadata(filename, metadata)` -> `PUT /mp3s/{filename}/metadata`
- `updateCover(filename, file)` -> `POST /mp3s/{filename}/cover`
- `delete(filename)` -> `DELETE /mp3s/{filename}`
- `getCoverUrl(filename)` and `getFileUrl(filename)` for media URLs

## File Responsibility Map (for AI and Maintainers)

- Route-level behavior: `src/App.tsx`
- HTTP boundary + typed contracts: `src/api/mp3Api.ts`
- Download and image crop UX: `src/pages/DownloadPage.tsx`
- Library search/filter/pagination UX: `src/pages/LibraryPage.tsx`
- Song edit workflow and sidebar navigation: `src/pages/EditPage.tsx`
- Visual consistency and layout behavior: `src/App.css`

If a bug is about:

- Wrong endpoint or payload: check `src/api/mp3Api.ts` first.
- Route navigation issues: check `src/App.tsx`.
- Cover crop/preview behavior: check `src/pages/DownloadPage.tsx` and `src/pages/EditPage.tsx`.
- Library rendering/performance/filtering: check `src/pages/LibraryPage.tsx`.

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
- Cover endpoint accepts multipart image upload.

## Notes for Future Work

- Sorting can be added to the library table without backend changes.
- Server-side pagination can be added later by extending `GET /mp3s`.
- If filename identity becomes unstable after rename, migrate route identity from filename to a persistent ID.
