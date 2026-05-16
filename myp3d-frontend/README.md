# myp3d-frontend

React + TypeScript + Vite UI for downloading, browsing, and editing local MP3 files.

## Quick start

```bash
npm install
npm run dev
```

## Config

`.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

## Pages

- Download: URL + metadata + cover
- Query: YouTube search + preview + autofill
- Library: list/search/sort/paginate MP3s
- Details: edit metadata + cover
- Albums: list/search/sort albums
- Album Edit: rename + cover for all tracks

## Notes

- Backend client lives in `src/api/mp3Api.ts`.
- Shared UI primitives: cover crop flow + paginated table.
