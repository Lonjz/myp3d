import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, CaseLower, CircleAlert, FileAudio, MicVocal, Scissors, VolumeX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { healthApi } from '../api/healthApi';
import type { ArtistTrack, NamingTrack, SilenceScan, SilentTrack } from '../api/healthApi';
import { mp3Api } from '../api/mp3Api';
import type { BulkResult, MP3Info } from '../api/mp3Api';
import { BulkFixTools, BusyColumn, SelectableRow } from '../components/diff/DiffColumns';
import { useToast } from '../components/messages/toastContext';
import { Chip } from '../components/ui/Chip';
import { EmptyState, LoadFailed } from '../components/ui/EmptyState';
import { IconField } from '../components/ui/IconField';
import { usePersistentState } from '../hooks/usePersistentState';
import { usePoll } from '../hooks/usePoll';
import { useSelection } from '../hooks/useSelection';
import type { Selection } from '../hooks/useSelection';
import { emitAppEvent, subscribeAppEvent } from '../utils/appEvents';
import { normalizeFilenameInput, stripMp3Extension } from '../utils/filenames';
import { cx, errorMessage, formatTrackSubtitle, trackCount } from '../utils/formatters';
import { stopClick } from '../utils/rowOpen';
import { SegmentedControl } from '../components/ui/SegmentedControl';

type CheckName = 'silence' | 'naming' | 'artists';

const SCAN_POLL_MS = 750;
const CHECKS: { value: CheckName; label: string; icon: LucideIcon }[] = [
  { value: 'silence', label: 'Silent endings', icon: VolumeX },
  { value: 'naming', label: 'File names', icon: FileAudio },
  { value: 'artists', label: 'Multiple artists', icon: MicVocal },
];

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

function useIssues<T>(load: () => Promise<T[]>) {
  const [tracks, setTracks] = useState<T[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = async () => {
    try {
      setTracks(await load());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  const loadIssues = useEffectEvent(() => {
    void reload();
  });

  useEffect(() => {
    loadIssues();
    return subscribeAppEvent('library-changed', () => loadIssues());
  }, []);

  return { tracks, failed, reload };
}

function CheckToolbar({
  picker,
  selection,
  locked,
  onScan,
  fixIcon,
  fixLabel,
  fixTitle,
  onFix,
}: {
  picker: ReactNode;
  selection: Selection;
  locked: boolean;
  onScan: () => void;
  fixIcon: LucideIcon;
  fixLabel: string;
  fixTitle: string;
  onFix: () => void;
}) {
  return (
    <div className="sync-toolbar glass">
      {picker}
      <BulkFixTools
        selection={selection}
        locked={locked}
        onScan={onScan}
        fixIcon={fixIcon}
        fixLabel={`${fixLabel} ${trackCount(selection.chosen.length)}`}
        fixTitle={fixTitle}
        onFix={onFix}
      />
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
  return (
    <SelectableRow
      rowKey={track.filename}
      selection={selection}
      title={title}
      sub={sub}
      coverSrc={track.has_cover ? mp3Api.getCoverUrl(track.filename, 'thumb') : undefined}
    >
      {children}
    </SelectableRow>
  );
}

function SilenceCheck({ picker }: { picker: ReactNode }) {
  const { showError } = useToast();
  const [scan, setScan] = useState<SilenceScan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const startedRef = useRef(false);
  const fix = useFix('trim', 'trimmed', 'Failed to trim the silence');

  const startScan = useCallback(async () => {
    try {
      setScan(await healthApi.scanSilence());
      setFailed(false);
    } catch (err) {
      showError(errorMessage(err, 'Failed to scan for silence'));
    }
  }, [showError]);

  const load = useCallback(async () => {
    try {
      setScan((await healthApi.silence()) ?? (await healthApi.scanSilence()));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void load();
  }, [load]);

  const scanning = scan?.status === 'scanning';

  const refreshScan = async () => {
    try {
      setScan(await healthApi.silence());
    } catch {
      setFailed(true);
    }
  };

  usePoll(refreshScan, SCAN_POLL_MS, scanning && !failed);

  const visible: SilentTrack[] = scan?.tracks ?? [];
  const selection = useSelection(visible.map((track) => track.filename));

  const trim = () => {
    const chosen = selection.chosen;
    void fix.run(chosen.length, () => healthApi.trimSilence(chosen), async (result) => {
      selection.drop(result.updated);
      setScan(await healthApi.silence());
    });
  };

  const renderBody = () => {
    if (failed) return <LoadFailed label="Couldn't load the silence scan" onRetry={() => void load()} />;
    if (!loaded || scanning) {
      const progress = scan && scan.total > 0 ? `${scan.done} / ${scan.total}` : undefined;
      return <EmptyState loading text={progress} label="Scanning for silent endings" />;
    }
    if (!scan) return <EmptyState icon={VolumeX} />;
    if (scan.status === 'failed') return <EmptyState icon={CircleAlert} text={scan.error ?? "Couldn't scan the library"} />;
    return (
      <BusyColumn busy={fix.busy} icon={VolumeX} label="Silent endings" count={visible.length}>
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
              <Chip icon={VolumeX} className="health-silence" title={`Silent ending: ${silence}`} label={`Silent ending: ${silence}`}>{silence}</Chip>
            </CheckRow>
          );
        })}
      </BusyColumn>
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
      />
      {renderBody()}
    </>
  );
}

function NamingCheck({ picker }: { picker: ReactNode }) {
  const { tracks, failed, reload } = useIssues<NamingTrack>(healthApi.naming);
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
      {failed ? (
        <LoadFailed label="Couldn't check the file names" onRetry={() => void reload()} />
      ) : tracks === null ? (
        <EmptyState loading label="Checking file names" />
      ) : (
        <BusyColumn busy={fix.busy} icon={FileAudio} label="File names" count={list.length}>
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
        </BusyColumn>
      )}
    </>
  );
}

function ArtistCheck({ picker }: { picker: ReactNode }) {
  const { tracks, failed, reload } = useIssues<ArtistTrack>(healthApi.artists);
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
      {failed ? (
        <LoadFailed label="Couldn't check the artists" onRetry={() => void reload()} />
      ) : tracks === null ? (
        <EmptyState loading label="Checking artists" />
      ) : (
        <BusyColumn busy={fix.busy} icon={MicVocal} label="Multiple artists" count={list.length}>
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
                      className={cx('album-chip health-artist', artistIndex === index && 'is-active')}
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
        </BusyColumn>
      )}
    </>
  );
}

export function HealthPage() {
  const [check, setCheck] = usePersistentState<CheckName>('health:check', 'silence');

  const picker = <SegmentedControl label="Check" options={CHECKS} value={check} onChange={setCheck} />;

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
