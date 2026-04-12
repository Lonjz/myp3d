# myp3d-frontend

React + TypeScript + Vite UI for downloading, browsing, and editing local MP3 files managed by the backend API.

## What This App Does

- App shell/navigation:
  - Left sidebar with active route highlighting.
  - Desktop collapse/expand toggle.
  - Mobile menu button and overlay close behavior.

- `Download` page:
  - Submit YouTube URL.
  - URL input stays in its own top row.
  - Metadata fields and cover upload are split into two columns.
  - Optional filename/title/artist/album metadata.
  - Optional cover image upload, crop, and preview using shared upload + crop components.
- `Query` page:
  - Search YouTube from the backend `yt-dlp` endpoint.
  - Browse results in a left sidebar and preview selected video in an embedded player.
  - Autofill URL/title/artist/album from selected result.
  - Uses the same download config section and cover upload/crop flow as Download page.
- `Library` page:
  - Show local MP3 library in a shared paginated table component.
  - Search/filter by title, artist, album, filename.
  - Local pagination (25 rows per page).
  - Column sorting via shared sortable header buttons.
  - Stable row heights with per-column widths and ellipsis truncation for long values.
  - Per-row actions: edit, download, delete.
- `Details` page:
  - Edit metadata and cover for a selected song.
  - Left sidebar to quickly switch between songs.
  - Uses the same shared cover crop modal workflow as Download/Query.
- `Albums` page:
  - Show grouped albums (same album name across different artists counts as one album group).
  - Search/sort albums and open album edit screen.
  - Uses the same shared paginated table + sortable header components as Library.
  - Stable row heights with per-column widths and ellipsis truncation for long values.
- `Album Edit` page:
  - Rename album for all tracks in the selected group.
  - Apply a single cover to all tracks in the selected group.
  - Includes left sidebar for quick album-to-album navigation.
  - Uses the same shared cover crop modal workflow as Download/Query/Edit.

## Routing

- `/download` -> `DownloadPage`
- `/query` -> `QueryPage`
- `/library` -> `LibraryPage`
- `/details/:songName` -> `EditPage`
- `/albums` -> `AlbumsPage`
- `/albums/:albumKey` -> `AlbumEditPage`
- `/` redirects to `/download`

Route wiring and sidebar shell behavior are in `src/App.tsx`.

## UI Architecture Highlights

- Theme/token source:
  - `src/theme.css` defines shared CSS variables used across the app.
- Style organization:
  - `src/App.css` is now an import aggregator only.
  - Feature/layout styles are split under `src/assets/styles/` (shell, forms, tables/library, details, query, responsive, etc.).
- Shared UI building blocks:
  - Download + Query share the same `DownloadConfigSection`.
  - Download/Query/Edit/AlbumEdit share one cover upload + crop flow (`CoverUploadSquare`, `CoverCropModal`, `useCoverImageCrop`).
  - Library + Albums share table primitives (`PaginatedTable`, `SortableHeaderButton`).

## Project Structure

```text
myp3d-frontend/
  package.json
  .env                         # VITE_API_BASE_URL
  src/
    main.tsx                   # BrowserRouter + app bootstrapping
    theme.css                  # Theme tokens (colors used across app styles)
    App.tsx                    # Sidebar shell + route definitions
    App.css                    # Style import aggregator
    index.css                  # Global base styles
    assets/
      styles/
        base.css               # Resets + root body baseline
        shell.css              # Sidebar shell, header, mobile nav overlay
        pages.css              # Common page container spacing/title styles
        forms.css              # Form controls + cover upload/crop modal styles
        buttons.css            # Primary/secondary/danger button styles
        messages.css           # Success/error message blocks + generic error text
        library.css            # Shared table, sorting, pagination, truncation styles
        details.css            # Song/album edit layouts and audio player styles
        query.css              # Query search/preview layouts and result list styles
        responsive.css         # Mobile breakpoints and layout overrides
    api/
      mp3Api.ts                # Backend client (all HTTP calls)
    components/
      cover/
        CoverUploadSquare.tsx  # Shared square uploader UI
        CoverCropModal.tsx     # Shared crop modal UI
        useCoverImageCrop.ts   # Shared cover upload/crop state + behavior
      download/
        DownloadConfigSection.tsx # Shared download form block for Download/Query pages
      table/
        PaginatedTable.tsx     # Shared table shell + empty state + pagination controls
        SortableHeaderButton.tsx # Shared sortable table header button
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
- Shared download form block: `src/components/download/DownloadConfigSection.tsx`
- Shared cover upload interaction: `src/components/cover/CoverUploadSquare.tsx`
- Shared crop modal UI: `src/components/cover/CoverCropModal.tsx`
- Shared crop/upload state logic: `src/components/cover/useCoverImageCrop.ts`
- Shared table wrapper + pagination: `src/components/table/PaginatedTable.tsx`
- Shared sortable table header button: `src/components/table/SortableHeaderButton.tsx`
- Download page orchestration: `src/pages/DownloadPage.tsx`
- Query/search + embedded preview workflow: `src/pages/QueryPage.tsx`
- Library search/filter/pagination UX: `src/pages/LibraryPage.tsx`
- Song edit workflow and sidebar navigation: `src/pages/EditPage.tsx`
- Albums listing and album-level navigation: `src/pages/AlbumsPage.tsx`
- Album-level edit workflow: `src/pages/AlbumEditPage.tsx`
- Style import entrypoint: `src/App.css`
- Style modules by feature/layout: `src/assets/styles/*.css`
- Theme token definitions: `src/theme.css`

If a bug is about:

- Wrong endpoint or payload: check `src/api/mp3Api.ts` first.
- Route navigation issues: check `src/App.tsx`.
- Query search results, selection, or preview: check `src/pages/QueryPage.tsx`.
- Cover crop/preview behavior across pages: check `src/components/cover/useCoverImageCrop.ts` and `src/components/cover/CoverCropModal.tsx`.
- Download/Query form field parity: check `src/components/download/DownloadConfigSection.tsx`.
- Cover picker button behavior: check `src/components/cover/CoverUploadSquare.tsx`.
- Table sorting/pagination shell behavior: check `src/components/table/PaginatedTable.tsx` and `src/components/table/SortableHeaderButton.tsx`.
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
- `npm audit` - dependency vulnerability report

UI icon dependencies used by navigation shell:

- `@mui/material`
- `@mui/icons-material`
- `@emotion/react`
- `@emotion/styled`

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

- Server-side sorting can be added later by extending `GET /mp3s` and `GET /albums`.
- Server-side pagination can be added later by extending `GET /mp3s`.
- If filename identity becomes unstable after rename, migrate route identity from filename to a persistent ID.
