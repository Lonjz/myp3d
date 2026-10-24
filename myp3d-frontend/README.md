# myp3d-frontend

React + TypeScript + Vite. Setup is in the [main README](../README.md).

```bash
npm run dev       # http://localhost:5173
npm run lint
npm run build
```

`VITE_API_BASE_URL` in `.env` points at the backend (default `http://localhost:8000`).

## Layout

- `src/pages/` one component per route
- `src/components/` grouped by feature, with shared pieces in `ui/` (`IconButton`, `IconField`, `IconSelect`, `EmptyState`)
- `src/api/` typed clients for the backend
- `src/styles/tokens.css` colours, spacing, radii and glass effects everything else builds on
