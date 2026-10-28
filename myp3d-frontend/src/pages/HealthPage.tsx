import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, CaseLower, CircleAlert, FileAudio, MicVocal, ScanSearch, Scissors, VolumeX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { healthApi } from '../api/healthApi';
import type { ArtistTrack, NamingTrack, SilenceScan, SilentTrack } from '../api/healthApi';
import { mp3Api } from '../api/mp3Api';
import type { BulkResult, MP3Info } from '../api/mp3Api';
import { Cover, DiffColumn, TrackText } from '../components/diff/DiffColumns';
import { useToast } from '../components/messages/toastContext';
import { Checkbox } from '../components/ui/Checkbox';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { usePersistentState } from '../hooks/usePersistentState';
import { emitAppEvent, subscribeAppEvent } from '../utils/appEvents';
import { normalizeFilenameInput, stripMp3Extension } from '../utils/filenames';
import { formatTrackSubtitle } from '../utils/formatters';

type CheckName = 'silence' | 'naming' | 'artists';

const SCAN_POLL_MS = 750;
const THRESHOLDS = [0.5, 1.5, 3, 5, 10];
const DEFAULT_THRESHOLD = 1.5;
const CHECKS: { value: CheckName; label: string; icon: LucideIcon }[] = [
  { value: 'silence', label: 'Silent endings', icon: VolumeX },
  { value: 'naming', label: 'File names', icon: FileAudio },
  { value: 'artists', label: 'Multiple artists', icon: MicVocal },
];

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const trackCount = (count: number) => `${count} track${count === 1 ? '' : 's'}`;
const stopClick = (event: { stopPropagation: () => void }) => event.stopPropagation();

function useSelection(keys: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const chosen = keys.filter((key) => selected.has(key));
  const allChosen = keys.length > 0 && chosen.length === keys.length;

  const toggle = useCallback((key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(keys));

  const drop = (removed: string[]) => {
    setSelected((current) => {
      const next = new Set(current);
      removed.forEach((key) => next.delete(key));
      return next;
    });
  };

  return { keys, selected, chosen, allChosen, toggle, toggleAll, drop };
}

type Selection = ReturnType<typeof useSelection>;

function useFix(verb: string, past: string, failure: string) {
  const { showSuccess, showError } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async (count: number, request: () => Promise<BulkResult>, onDone: (result: BulkResult) => Promise<void>) => {
    if (count === 0) return;
    setBusy(true);
    try {
      const result = await request();
      if (result.updated.length > 0) emitAppEvent('library-changed');
      await onDone(result);
      if (result.failed.length === 0) {
        showSuccess(`${past[0].toUpperCase()}${past.slice(1)} ${trackCount(result.updated.length)}`);
      } else if (count === 1) {
        showError(`Couldn't ${verb}: ${result.failed[0].detail}`);
      } else {
        showError(`${result.failed.length} of ${trackCount(count)} couldn't be ${past}`);
      }
    } catch (err) {
      showError(errorMessage(err, failure));
    } finally {
      setBusy(false);
    }
  };

  return { busy, run };
}

function useIssues<T>(load: () => Promise<T[]>, failure: string) {
  const { showError } = useToast();
  const [tracks, setTracks] = useState<T[] | null>(null);

  const reload = async () => {
    try {
      setTracks(await load());
    } catch (err) {
      showError(errorMessage(err, failure));
      setTracks((current) => current ?? []);
    }
  };

  const loadIssues = useEffectEvent(() => {
    void reload();
  });

  useEffect(() => {
    loadIssues();
    return subscribeAppEvent('library-changed', () => loadIssues());
  }, []);

  return { tracks, reload };
}

function CheckToolbar({
  picker,
  selection,
  locked,
  onScan,
  fixIcon: FixIcon,
  fixLabel,
  fixTitle,
  onFix,
  children,
}: {
  picker: ReactNode;
  selection: Selection;
  locked: boolean;
  onScan: () => void;
  fixIcon: LucideIcon;
  fixLabel: string;
  fixTitle: string;
  onFix: () => void;
  children?: ReactNode;
}) {
  const count = selection.chosen.length;
  return (
    <div className="sync-toolbar glass">
      {picker}
      {children}
      <span className="health-select-all">
        <Checkbox
          label={selection.allChosen ? 'Deselect all' : 'Select all'}
          checked={selection.allChosen}
          indeterminate={count > 0 && !selection.allChosen}
          onChange={selection.toggleAll}
          disabled={selection.keys.length === 0 || locked}
        />
      </span>
      <IconButton icon={ScanSearch} label="Scan again" className="sync-toolbar__push" onClick={onScan} disabled={locked} />
      <button
        type="button"
        className="btn-primary health-fix"
        onClick={onFix}
        disabled={count === 0 || locked}
        aria-label={`${fixLabel} ${trackCount(count)}`}
        title={fixTitle}
      >
        <FixIcon aria-hidden="true" />
        {count}
      </button>
    </div>
  );
}

function CheckRow({
  track,
  selection,
  title,
  sub,
  children,
}: {
  track: MP3Info;
  selection: Selection;
  title: string;
  sub: string;
  children: ReactNode;
}) {
  const selected = selection.selected.has(track.filename);
  return (
    <li
      className={`music-row is-clickable health-row ${selected ? 'is-selected' : ''}`.trim()}
      onClick={() => selection.toggle(track.filename)}
    >
      <Checkbox
        label={`Select ${title}`}
        checked={selected}
        onChange={() => selection.toggle(track.filename)}
        onClick={stopClick}
      />
      <Cover src={track.has_cover ? mp3Api.getCoverUrl(track.filename, 'thumb') : undefined} />
      <TrackText title={title} sub={sub} />
      {children}
    </li>
  );
}

function CheckBody({ busy, icon, label, count, children }: { busy: boolean; icon: LucideIcon; label: string; count: number; children: ReactNode }) {
  return (
    <div className={`health-columns ${busy ? 'is-busy' : ''}`.trim()} aria-busy={busy}>
      <DiffColumn icon={icon} label={label} count={count}>
        {children}
      </DiffColumn>
    </div>
  );
}

function SilenceCheck({ picker }: { picker: ReactNode }) {
  const { showError } = useToast();
  const [scan, setScan] = useState<SilenceScan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [threshold, setThreshold] = usePersistentState('health:threshold', DEFAULT_THRESHOLD);
  const startedRef = useRef(false);
  const fix = useFix('trim', 'trimmed', 'Failed to trim the silence');

  const startScan = useCallback(async () => {
    try {
      setScan(await healthApi.scanSilence());
    } catch (err) {
      showError(errorMessage(err, 'Failed to scan for silence'));
    }
  }, [showError]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const load = async () => {
      try {
        const current = await healthApi.silence();
        if (current) setScan(current);
        else await startScan();
      } catch (err) {
        showError(errorMessage(err, 'Failed to load the silence scan'));
      } finally {
        setLoaded(true);
      }
    };

    void load();
  }, [showError, startScan]);

  const scanning = scan?.status === 'scanning';

  useEffect(() => {
    if (!scanning) return undefined;
    let cancelled = false;

    const poll = async () => {
      try {
        const next = await healthApi.silence();
        if (!cancelled) setScan(next);
      } catch {
        return;
      }
    };

    const timer = window.setInterval(poll, SCAN_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [scanning]);

  const visible: SilentTrack[] = (scan?.tracks ?? []).filter((track) => track.silence >= threshold);
  const selection = useSelection(visible.map((track) => track.filename));

  const trim = () => {
    const chosen = selection.chosen;
    void fix.run(chosen.length, () => healthApi.trimSilence(chosen), async (result) => {
      selection.drop(result.updated);
      setScan(await healthApi.silence());
    });
  };

  const renderBody = () => {
    if (!loaded || scanning) {
      const progress = scan && scan.total > 0 ? `${scan.done} / ${scan.total}` : undefined;
      return <EmptyState loading text={progress} label="Scanning for silent endings" />;
    }
    if (!scan) return <EmptyState icon={VolumeX} />;
    if (scan.status === 'failed') return <EmptyState icon={CircleAlert} text={scan.error ?? "Couldn't scan the library"} />;
    return (
      <CheckBody busy={fix.busy} icon={VolumeX} label="Silent endings" count={visible.length}>
        {visible.map((track) => {
          const silence = `${track.silence.toFixed(1)}s`;
          return (
            <CheckRow
              key={track.filename}
              track={track}
              selection={selection}
              title={track.title || track.filename}
              sub={formatTrackSubtitle(track.artist, track.album)}
            >
              <span className="album-chip health-silence" title={`Silent ending: ${silence}`} aria-label={`Silent ending: ${silence}`}>
                <VolumeX aria-hidden="true" />
                {silence}
              </span>
            </CheckRow>
          );
        })}
      </CheckBody>
    );
  };

  return (
    <>
      <CheckToolbar
        picker={picker}
        selection={selection}
        locked={scanning || fix.busy}
        onScan={() => void startScan()}
        fixIcon={Scissors}
        fixLabel="Trim silence from"
        fixTitle="Trim silence"
        onFix={trim}
      >
        <div className="segmented health-thresholds" role="group" aria-label="Minimum silence">
          {THRESHOLDS.map((value) => (
            <button
              key={value}
              type="button"
              className={`segmented__option ${threshold === value ? 'is-active' : ''}`.trim()}
              aria-pressed={threshold === value}
              aria-label={`At least ${value}s of silence`}
              title={`At least ${value}s of silence`}
              onClick={() => setThreshold(value)}
            >
              {value}s
            </button>
          ))}
        </div>
      </CheckToolbar>
      {renderBody()}
    </>
  );
}

function NamingCheck({ picker }: { picker: ReactNode }) {
  const { tracks, reload } = useIssues<NamingTrack>(healthApi.naming, 'Failed to check the file names');
  const [names, setNames] = useState<Record<string, string>>({});
  const list = tracks ?? [];
  const selection = useSelection(list.map((track) => track.filename));
  const fix = useFix('rename', 'renamed', 'Failed to rename the songs');
  const nameFor = (track: NamingTrack) => names[track.filename] ?? track.suggested ?? '';

  const rename = () => {
    const items = list
      .filter((track) => selection.selected.has(track.filename))
      .map((track) => ({ filename: track.filename, new_name: nameFor(track) }));
    void fix.run(items.length, () => healthApi.fixNaming(items), async (result) => selection.drop(result.updated));
  };

  return (
    <>
      <CheckToolbar
        picker={picker}
        selection={selection}
        locked={tracks === null || fix.busy}
        onScan={() => void reload()}
        fixIcon={CaseLower}
        fixLabel="Rename"
        fixTitle="Rename"
        onFix={rename}
      />
      {tracks === null ? (
        <EmptyState loading label="Checking file names" />
      ) : (
        <CheckBody busy={fix.busy} icon={FileAudio} label="File names" count={list.length}>
          {list.map((track) => {
            const name = nameFor(track);
            return (
              <CheckRow
                key={track.filename}
                track={track}
                selection={selection}
                title={track.title || stripMp3Extension(track.filename)}
                sub={formatTrackSubtitle(track.artist, track.album)}
              >
                <span
                  className="album-chip health-current-name"
                  title={`Current file name: ${track.filename}`}
                  aria-label={`Current file name: ${track.filename}`}
                >
                  <span className="album-chip__text">{stripMp3Extension(track.filename)}</span>
                </span>
                <ArrowRight className="health-name-arrow" aria-hidden="true" />
                <div className="health-name" onClick={stopClick}>
                  <IconField
                    icon={FileAudio}
                    label="New file name"
                    className={name.trim() ? undefined : 'is-invalid'}
                    value={name}
                    onChange={(event) => {
                      const value = normalizeFilenameInput(event.target.value);
                      setNames((current) => ({ ...current, [track.filename]: value }));
                    }}
                    aria-invalid={!name.trim()}
                    spellCheck={false}
                  />
                </div>
              </CheckRow>
            );
          })}
        </CheckBody>
      )}
    </>
  );
}

function ArtistCheck({ picker }: { picker: ReactNode }) {
  const { tracks, reload } = useIssues<ArtistTrack>(healthApi.artists, 'Failed to check the artists');
  const [primaries, setPrimaries] = useState<Record<string, string>>({});
  const list = tracks ?? [];
  const selection = useSelection(list.map((track) => track.filename));
  const fix = useFix('fix', 'fixed', 'Failed to fix the artists');
  const primaryIndex = (track: ArtistTrack) => Math.max(0, track.artists.indexOf(primaries[track.filename]));

  const fixArtists = () => {
    const items = list
      .filter((track) => selection.selected.has(track.filename))
      .map((track) => ({ filename: track.filename, artist: track.artists[primaryIndex(track)] }));
    void fix.run(items.length, () => healthApi.fixArtists(items), async (result) => selection.drop(result.updated));
  };

  return (
    <>
      <CheckToolbar
        picker={picker}
        selection={selection}
        locked={tracks === null || fix.busy}
        onScan={() => void reload()}
        fixIcon={MicVocal}
        fixLabel="Fix the artist on"
        fixTitle="Fix artists"
        onFix={fixArtists}
      />
      {tracks === null ? (
        <EmptyState loading label="Checking artists" />
      ) : (
        <CheckBody busy={fix.busy} icon={MicVocal} label="Multiple artists" count={list.length}>
          {list.map((track) => {
            const index = primaryIndex(track);
            return (
              <CheckRow
                key={track.filename}
                track={track}
                selection={selection}
                title={track.titles[index]}
                sub={formatTrackSubtitle(track.artists[index], track.album)}
              >
                <div className="health-artists" role="group" aria-label="Main artist" onClick={stopClick}>
                  {track.artists.map((artist, artistIndex) => (
                    <button
                      key={artist}
                      type="button"
                      className={`album-chip health-artist ${artistIndex === index ? 'is-active' : ''}`.trim()}
                      aria-pressed={artistIndex === index}
                      title={`Make ${artist} the main artist`}
                      onClick={() => setPrimaries((current) => ({ ...current, [track.filename]: artist }))}
                    >
                      {artist}
                    </button>
                  ))}
                </div>
              </CheckRow>
            );
          })}
        </CheckBody>
      )}
    </>
  );
}

export function HealthPage() {
  const [check, setCheck] = usePersistentState<CheckName>('health:check', 'silence');

  const picker = (
    <div className="segmented" role="group" aria-label="Check">
      {CHECKS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className={`segmented__option ${check === value ? 'is-active' : ''}`.trim()}
          aria-pressed={check === value}
          aria-label={label}
          title={label}
          onClick={() => setCheck(value)}
        >
          <Icon aria-hidden="true" />
        </button>
      ))}
    </div>
  );

  return (
    <div className="page page--fill sync-page health-page">
      <div className="health-check" hidden={check !== 'silence'}>
        <SilenceCheck picker={picker} />
      </div>
      <div className="health-check" hidden={check !== 'naming'}>
        <NamingCheck picker={picker} />
      </div>
      <div className="health-check" hidden={check !== 'artists'}>
        <ArtistCheck picker={picker} />
      </div>
    </div>
  );
}
