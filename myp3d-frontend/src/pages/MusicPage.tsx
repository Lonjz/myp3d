import { useState } from 'react';
import {
  Check,
  CircleAlert,
  CircleCheck,
  DiscAlbum,
  Folder,
  Image as ImageIcon,
  ImageOff,
  MicVocal,
  Music,
  PencilLine,
  Plus,
  RefreshCw,
  ScanSearch,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { MP3Info } from '../api/mp3Api';
import type { MusicChange, MusicDiff, MusicPair, MusicSync, MusicTrack } from '../api/musicApi';
import { Cover, DiffColumn, TrackText } from '../components/diff/DiffColumns';
import { useMusicSync } from '../components/music/useMusicSync';
import { Checkbox } from '../components/ui/Checkbox';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { AppleMusicIcon } from '../components/ui/BrandIcons';
import { ProgressRow } from '../components/ui/ProgressRow';
import { Spinner } from '../components/ui/Spinner';
import { formatTrackSubtitle } from '../utils/formatters';

const EMPTY_NAMES: ReadonlySet<string> = new Set();

const CHANGE_ICONS: Record<MusicChange, LucideIcon> = {
  title: Music,
  artist: MicVocal,
  album: DiscAlbum,
  art: ImageIcon,
};

const hasChanges = (pair: MusicPair) => pair.changes.length > 0;

const trackSortKey = (track: MP3Info) => `${track.artist ?? ''}\u0000${track.title || track.filename}`;

const changeTitle = (change: MusicChange, { track, music }: MusicPair) => {
  if (change === 'title') return `${music.name || '-'} → ${track.title}`;
  if (change === 'artist') return `${music.artist || '-'} → ${track.artist}`;
  if (change === 'album') return `${music.album || '-'} → ${track.album}`;
  return 'Cover art';
};

interface Selection {
  checked: boolean;
  onToggle: () => void;
}

function RowCheckbox({ title, selection }: { title: string; selection?: Selection }) {
  if (!selection) return null;
  return <Checkbox label={`Sync ${title}`} checked={selection.checked} onChange={selection.onToggle} />;
}

function LocalRow({ track, selection }: { track: MP3Info; selection?: Selection }) {
  const title = track.title || track.filename;
  return (
    <li className="music-row">
      <RowCheckbox title={title} selection={selection} />
      <Cover src={track.has_cover ? mp3Api.getCoverUrl(track.filename, 'thumb') : undefined} />
      <TrackText title={title} sub={formatTrackSubtitle(track.artist, track.album)} />
      <span className="music-changes">
        <span className="music-change" title="Add to Apple Music" aria-label="Add to Apple Music">
          <Plus aria-hidden="true" />
        </span>
      </span>
    </li>
  );
}

function PairRow({ pair, selection }: { pair: MusicPair; selection?: Selection }) {
  const { track, changes } = pair;
  const title = track.title || track.filename;
  return (
    <li className="music-row">
      <RowCheckbox title={title} selection={selection} />
      <Cover src={track.has_cover ? mp3Api.getCoverUrl(track.filename, 'thumb') : undefined} />
      <TrackText title={title} sub={formatTrackSubtitle(track.artist, track.album)} />
      {changes.length > 0 && (
        <span className="music-changes">
          {changes.map((change) => {
            const Icon = CHANGE_ICONS[change];
            const label = changeTitle(change, pair);
            return (
              <span key={change} className="music-change" title={label} aria-label={label}>
                <Icon aria-hidden="true" />
              </span>
            );
          })}
        </span>
      )}
    </li>
  );
}

function MusicRow({ track }: { track: MusicTrack }) {
  return (
    <li className="music-row">
      <Cover />
      <TrackText title={track.name || '-'} sub={formatTrackSubtitle(track.artist, track.album)} />
    </li>
  );
}

function SyncPanel({ job, busy, onDismiss }: { job: MusicSync; busy: boolean; onDismiss: () => void }) {
  if (job.status === 'syncing') {
    return (
      <section className="sync-panel glass" aria-live="polite">
        <Spinner />
        <div className="sync-panel__progress">
          <ProgressRow
            icon={AppleMusicIcon}
            label="Syncing with Apple Music"
            progress={{ total: job.total, done: job.added + job.updated + job.failed.length, finished: false }}
          />
        </div>
      </section>
    );
  }

  const failedTitle = job.failed.map((failure) => `${failure.filename}: ${failure.detail}`).join('\n');
  const outcomeOk = job.status === 'done' && job.failed.length === 0;
  const OutcomeIcon = outcomeOk ? CircleCheck : CircleAlert;

  return (
    <section className="sync-panel glass" aria-live="polite">
      <OutcomeIcon
        className={`sync-panel__outcome sync-panel__outcome--${outcomeOk ? 'success' : 'warning'}`}
        aria-hidden="true"
      />
      {job.status === 'failed' && <h2 className="sync-panel__title" title={job.error ?? ''}>{job.error ?? 'Sync failed'}</h2>}
      {job.status === 'done' && (
        <div className="album-chips sync-panel__chips">
          <span className="album-chip" title="Added">
            <Plus aria-hidden="true" />
            {job.added}
          </span>
          <span className="album-chip" title="Updated">
            <PencilLine aria-hidden="true" />
            {job.updated}
          </span>
          {job.failed.length > 0 && (
            <span className="album-chip" title={failedTitle}>
              <CircleAlert aria-hidden="true" />
              {job.failed.length}
            </span>
          )}
          {job.without_art.length > 0 && (
            <span className="album-chip" title={`No cover art set:\n${job.without_art.join('\n')}`}>
              <ImageOff aria-hidden="true" />
              {job.without_art.length}
            </span>
          )}
        </div>
      )}
      <button type="button" className="btn-primary" onClick={onDismiss} disabled={busy}>
        <Check aria-hidden="true" />
        Done
      </button>
    </section>
  );
}

export function MusicPage() {
  const { available, folder, setFolder, diff, scanning, job, busy, scan, startSync, dismiss } = useMusicSync();
  const [excluded, setExcluded] = useState<{ diff: MusicDiff | null; names: ReadonlySet<string> }>({
    diff: null,
    names: EMPTY_NAMES,
  });

  if (available === null) {
    return (
      <div className="page sync-page music-page">
        <div className="sync-empty glass">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!available) {
    return (
      <div className="page sync-page music-page">
        <div className="sync-empty glass">
          <span className="sync-radar" aria-hidden="true">
            <AppleMusicIcon />
          </span>
          <p className="sync-empty__text">macOS only</p>
        </div>
      </div>
    );
  }

  const excludedNames = excluded.diff === diff ? excluded.names : EMPTY_NAMES;
  const inBoth = (diff?.both ?? []).filter((pair) => !hasChanges(pair));
  const toSync = [
    ...(diff?.both ?? []).filter(hasChanges),
    ...(diff?.only_in_library ?? []).map((track) => ({ track, music: null, changes: [] })),
  ].sort((a, b) => trackSortKey(a.track).localeCompare(trackSortKey(b.track)));
  const selected = toSync.map((entry) => entry.track).filter((track) => !excludedNames.has(track.filename));
  const jobOpen = job !== null;
  const folderMissing = !folder.trim();

  const setExcludedNames = (names: ReadonlySet<string>) => setExcluded({ diff, names });

  const selectionFor = (filename: string): Selection => ({
    checked: !excludedNames.has(filename),
    onToggle: () => {
      const next = new Set(excludedNames);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      setExcludedNames(next);
    },
  });

  const selectAll = (tracks: MP3Info[]) => {
    const included = tracks.filter((track) => !excludedNames.has(track.filename)).length;
    const allSelected = tracks.length > 0 && included === tracks.length;
    const toggle = () => {
      const next = new Set(excludedNames);
      tracks.forEach((track) => (allSelected ? next.add(track.filename) : next.delete(track.filename)));
      setExcludedNames(next);
    };
    return (
      <Checkbox
        label="Select all"
        checked={allSelected}
        indeterminate={included > 0 && !allSelected}
        onChange={toggle}
        disabled={tracks.length === 0}
      />
    );
  };

  return (
    <div className="page page--fill sync-page music-page">
      <div className="sync-toolbar glass">
        <IconField
          icon={Folder}
          label="Apple Music folder"
          className={`music-folder ${folderMissing ? 'is-invalid' : ''}`.trim()}
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void scan();
          }}
          aria-invalid={folderMissing}
          disabled={jobOpen}
          spellCheck={false}
        />
        <IconButton
          icon={ScanSearch}
          label="Scan"
          onClick={() => void scan()}
          disabled={scanning || folderMissing || jobOpen}
        />
        <button
          type="button"
          className="btn-primary music-add"
          onClick={() => void startSync(selected.map((track) => track.filename))}
          disabled={busy || scanning || jobOpen || selected.length === 0}
          title="Sync with Apple Music"
        >
          <RefreshCw aria-hidden="true" />
          {selected.length}
        </button>
      </div>

      {job ? (
        <SyncPanel job={job} busy={busy} onDismiss={() => void dismiss()} />
      ) : !diff ? (
        <div className="sync-empty glass">
          {scanning ? (
            <Spinner />
          ) : (
            <span className="sync-radar" aria-hidden="true">
              <AppleMusicIcon />
            </span>
          )}
        </div>
      ) : (
        <div className={`music-columns ${scanning ? 'is-scanning' : ''}`.trim()} aria-busy={scanning}>
          <DiffColumn icon={AppleMusicIcon} label="Only in Apple Music" count={diff.only_in_music.length}>
            {diff.only_in_music.map((track) => (
              <MusicRow key={track.persistent_id} track={track} />
            ))}
          </DiffColumn>
          <DiffColumn icon={Check} label="In both" count={inBoth.length}>
            {inBoth.map((pair) => (
              <PairRow key={pair.track.filename} pair={pair} />
            ))}
          </DiffColumn>
          <DiffColumn
            icon={RefreshCw}
            label="To sync"
            count={toSync.length}
            leading={selectAll(toSync.map((entry) => entry.track))}
          >
            {toSync.map((entry) =>
              entry.music ? (
                <PairRow key={entry.track.filename} pair={entry} selection={selectionFor(entry.track.filename)} />
              ) : (
                <LocalRow key={entry.track.filename} track={entry.track} selection={selectionFor(entry.track.filename)} />
              ),
            )}
          </DiffColumn>
        </div>
      )}
    </div>
  );
}
