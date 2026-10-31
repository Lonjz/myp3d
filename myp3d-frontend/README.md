# myp3d-frontend

React + TypeScript + Vite. Setup is in the [main README](../README.md).

```bash
npm run dev       # http://localhost:5173
npm test          # Vitest, add -- --run for a single run
npm run lint
npm run build
```

The backend address defaults to `http://localhost:8000`. To change it, copy `.env.example` to `.env` and set `VITE_API_BASE_URL`.

## Layout

- `src/pages/` one component per route, loaded on demand
- `src/components/` grouped by feature
- `src/components/ui/` shared pieces: `IconButton`, `IconField`, `InlineSelect`, `SegmentedControl`, `Modal`, `ConfirmDialog`, `Popover`, `ContextMenu`, `EmptyState`, `Checkbox`, `Spinner` and the brand logos in `BrandIcons`
- `src/hooks/` shared hooks such as `useDetail`, `usePoll` and `useDialog`
- `src/api/` typed clients for the backend
- `src/styles/tokens.css` colours, spacing, radii and glass effects everything else builds on
- `tests/` Vitest suite: a fake backend (`fakeBackend.ts`), data factories (`factories.ts`) and `renderApp` for rendering the whole app at a route
