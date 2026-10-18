import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, DragEvent } from 'react';
import {
  ArrowRight,
  BrushCleaning,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  ListMusic,
  ListPlus,
  ListX,
  MonitorPlay,
  Music,
  Upload,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ExplicitBadge, MatchDot } from '../components/spotify/matchBadges';
import { MatchPicker } from '../components/spotify/MatchPicker';
import { isReadyRow, useSpotifyImport } from '../components/spotify/useSpotifyImport';
import type { SpotifyRow } from '../components/spotify/useSpotifyImport';
import { SpotifyIcon } from '../components/ui/BrandIcons';
import { Checkbox } from '../components/ui/Checkbox';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { ProgressRow } from '../components/ui/ProgressRow';
import { Spinner } from '../components/ui/Spinner';
import { formatDuration } from '../utils/formatters';

const TRUNCATED_HINT =
  'Spotify only shows the first 100 songs of a playlist. Export it at exportify.net and drop the CSV here to get the rest.';

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

function RowStatus({ row }: { row: SpotifyRow }) {
  if (row.queued) {
    return (
      <span className="spotify-status spotify-status--queued" title="Queued" aria-label="Queued">
        <CircleCheck aria-hidden="true" />
      </span>
    );
  }
  if (row.error) {
    return (
      <span className="spotify-status spotify-status--failed" title={row.error} aria-label={row.error}>
        <CircleAlert aria-hidden="true" />
      </span>
    );
  }
  if (row.match?.in_library) {
    return (
      <span className="spotify-status" title="Already in library" aria-label="Already in library">
        <ListMusic aria-hidden="true" />
      </span>
    );
  }
  return <span className="spotify-status" aria-hidden="true" />;
}

interface MatchCellProps {
  row: SpotifyRow;
  onChoose: ReturnType<typeof useSpotifyImport>['choose'];
  onChooseUrl: ReturnType<typeof useSpotifyImport>['chooseUrl'];
}

function MatchCell({ row, onChoose, onChooseUrl }: MatchCellProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { match, choice } = row;

  if (!match) {
    return <span className="spotify-match spotify-match--loading">{row.error ? null : <Spinner inline />}</span>;
  }

  const suggested = choice ? match.candidates.some((candidate) => candidate.video_id === choice.video_id) : false;
  const sub = choice
    ? [choice.artists.join(', '), choice.duration ? formatDuration(choice.duration) : null].filter(Boolean).join(' · ')
    : '';

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`spotify-match ${open ? 'is-open' : ''}`.trim()}
        onClick={() => setOpen((value) => !value)}
        disabled={row.queued}
        aria-expanded={open}
        aria-label="Choose a YouTube match"
        title="Choose a YouTube match"
      >
        {choice ? (
          <>
            <span className="match-thumb" aria-hidden="true">
              {choice.thumbnail_url ? <img src={choice.thumbnail_url} alt="" loading="lazy" /> : <MonitorPlay />}
            </span>
            <span className="music-row__text">
              <span className="music-row__title" title={choice.title}>{choice.title}</span>
              {sub && <span className="music-row__sub" title={sub}>{sub}</span>}
            </span>
            {choice.explicit && <ExplicitBadge />}
            {suggested && <MatchDot score={choice.score} />}
          </>
        ) : (
          <span className="spotify-match__empty">
            <CircleAlert aria-hidden="true" />
          </span>
        )}
        <ChevronDown className="spotify-match__chevron" aria-hidden="true" />
      </button>
      {open && (
        <MatchPicker
          anchorRef={anchorRef}
          candidates={match.candidates}
          choice={choice}
          onChoose={(candidate) => onChoose(row.ref.id, candidate)}
          onChooseUrl={(url) => onChooseUrl(row.ref.id, url)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function SpotifyPage() {
  const {
    text,
    setText,
    rows,
    truncated,
    resolving,
    selected,
    queueing,
    resolve,
    setRowSelected,
    setSelected,
    choose,
    chooseUrl,
    importFile,
    clearQueued,
    clearAll,
    queueSelected,
  } = useSpotifyImport();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dropping, setDropping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applySearchParams = useEffectEvent((params: URLSearchParams) => {
    const incoming = params.get('url');
    if (!incoming) return;
    setText(incoming);
    void resolve(incoming);
    setSearchParams({}, { replace: true });
  });

  useEffect(() => {
    applySearchParams(searchParams);
  }, [searchParams]);

  const selectable = rows.filter(isReadyRow);
  const fresh = selectable.filter((row) => !row.match.in_library);
  const selectedCount = selectable.filter((row) => selected.has(row.ref.id)).length;
  const allSelected = selectable.length > 0 && selectedCount === selectable.length;
  const freshSelected =
    fresh.length > 0 &&
    fresh.length < selectable.length &&
    selectedCount === fresh.length &&
    fresh.every((row) => selected.has(row.ref.id));
  const matched = rows.filter((row) => row.match || row.error).length;
  const nextSelection = allSelected
    ? { label: 'Select none', rows: [] }
    : freshSelected || fresh.length === 0 || fresh.length === selectable.length
      ? { label: 'Select all, including songs in your library', rows: selectable }
      : { label: 'Select songs not in your library', rows: fresh };

  const queuedCount = rows.filter((row) => row.queued).length;

  const cycleSelection = () => {
    setSelected(new Set(nextSelection.rows.map((row) => row.ref.id)));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void importFile(file);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropping(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setDropping(false);
    const file = event.dataTransfer.files[0];
    if (file) void importFile(file);
  };

  return (
    <div
      className={`page page--fill sync-page spotify-page ${dropping ? 'is-dropping' : ''}`.trim()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="hidden-file-input"
        onChange={handleFileChange}
      />
      <form
        className="sync-toolbar glass"
        onSubmit={(event) => {
          event.preventDefault();
          void resolve(text);
        }}
      >
        <IconField
          icon={SpotifyIcon}
          label="Spotify links"
          className="spotify-links"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={resolving}
          spellCheck={false}
        />
        {resolving ? (
          <span className="spotify-resolving">
            <Spinner inline />
          </span>
        ) : (
          <IconButton icon={ArrowRight} label="Find songs" variant="primary" type="submit" disabled={!text.trim()} />
        )}
        <IconButton
          icon={Upload}
          label="Import an Exportify CSV"
          onClick={() => fileInputRef.current?.click()}
          disabled={resolving}
        />
        <IconButton
          icon={BrushCleaning}
          label="Clear queued"
          className="spotify-clear"
          onClick={clearQueued}
          disabled={queuedCount === 0}
        />
        <IconButton icon={ListX} label="Clear all" onClick={clearAll} disabled={rows.length === 0 && !resolving} />
        <button
          type="button"
          className="btn-primary spotify-queue"
          onClick={() => void queueSelected()}
          disabled={queueing || selectedCount === 0}
          title="Add to queue"
        >
          {queueing ? <Spinner inline /> : <ListPlus aria-hidden="true" />}
          {selectedCount}
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="sync-empty glass">
          {resolving ? (
            <Spinner />
          ) : (
            <span className="sync-radar" aria-hidden="true">
              <SpotifyIcon />
            </span>
          )}
        </div>
      ) : (
        <section className="spotify-list glass" aria-label="Spotify songs" aria-busy={resolving}>
          <header className="spotify-list__header">
            <Checkbox
              label={nextSelection.label}
              checked={allSelected}
              indeterminate={selectedCount > 0 && !allSelected}
              onChange={cycleSelection}
              disabled={selectable.length === 0}
            />
            <SpotifyIcon className="spotify-list__icon" aria-hidden="true" />
            <div className="spotify-list__meta">
              {truncated && (
                <span className="spotify-truncated" title={TRUNCATED_HINT} aria-label={TRUNCATED_HINT}>
                  <CircleAlert aria-hidden="true" />
                </span>
              )}
              {matched < rows.length && (
                <ProgressRow
                  icon={MonitorPlay}
                  label="Matching on YouTube"
                  progress={{ total: rows.length, done: matched, finished: false }}
                />
              )}
            </div>
            <MonitorPlay className="spotify-list__icon spotify-list__icon--match" aria-hidden="true" />
          </header>
          <ul className="music-rows spotify-rows">
            {rows.map((row, index) => {
              const title = row.match?.title ?? (row.ref.name || (row.error ? row.ref.id : ''));
              const artist = row.match?.artist ?? row.ref.subtitle;
              const album = row.match?.track.album ?? row.ref.album;
              const sub = [artist, album].filter(Boolean).join(' · ');
              const cover = row.match?.track.cover_url ?? row.ref.cover_url;
              return (
                <li
                  key={row.ref.id}
                  className={`spotify-row ${row.queued ? 'is-queued' : ''}`.trim()}
                  style={{ '--row': index } as CSSProperties}
                >
                  <Checkbox
                    label={`Queue ${title || 'song'}`}
                    checked={selected.has(row.ref.id)}
                    onChange={(event) => setRowSelected(row.ref.id, event.target.checked)}
                    disabled={!isReadyRow(row)}
                  />
                  <span className="music-cover" aria-hidden="true">
                    {cover ? <img src={cover} alt="" loading="lazy" /> : <Music />}
                  </span>
                  <div className="music-row__text">
                    {title ? (
                      <span className="music-row__title" title={title}>
                        {title}
                      </span>
                    ) : (
                      <span className="spotify-row__placeholder" aria-label="Loading" />
                    )}
                    {sub && <span className="music-row__sub" title={sub}>{sub}</span>}
                  </div>
                  {row.ref.explicit || row.match?.track.explicit ? <ExplicitBadge /> : <span aria-hidden="true" />}
                  <span className="spotify-row__duration">
                    {formatDuration(row.ref.duration ?? row.match?.track.duration)}
                  </span>
                  <MatchCell row={row} onChoose={choose} onChooseUrl={chooseUrl} />
                  <RowStatus row={row} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
