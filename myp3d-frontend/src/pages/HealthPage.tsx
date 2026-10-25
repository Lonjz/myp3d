import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, ScanSearch, Scissors, VolumeX } from 'lucide-react';
import { healthApi } from '../api/healthApi';
import type { SilenceScan, SilentTrack } from '../api/healthApi';
import { mp3Api } from '../api/mp3Api';
import { Cover, DiffColumn, TrackText } from '../components/diff/DiffColumns';
import { useToast } from '../components/messages/toastContext';
import { Checkbox } from '../components/ui/Checkbox';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { usePersistentState } from '../hooks/usePersistentState';
import { emitAppEvent } from '../utils/appEvents';
import { formatTrackSubtitle } from '../utils/formatters';

const SCAN_POLL_MS = 750;
const THRESHOLDS = [1.5, 3, 5, 10];

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const trackCount = (count: number) => `${count} track${count === 1 ? '' : 's'}`;

function SilentRow({
  track,
  selected,
  onToggle,
}: {
  track: SilentTrack;
  selected: boolean;
  onToggle: (filename: string) => void;
}) {
  const title = track.title || track.filename;
  const silence = `${track.silence.toFixed(1)}s`;
  return (
    <li
      className={`music-row is-clickable health-row ${selected ? 'is-selected' : ''}`.trim()}
      onClick={() => onToggle(track.filename)}
    >
      <Checkbox
        label={`Select ${title}`}
        checked={selected}
        onChange={() => onToggle(track.filename)}
        onClick={(event) => event.stopPropagation()}
      />
      <Cover src={track.has_cover ? mp3Api.getCoverUrl(track.filename, 'thumb') : undefined} />
      <TrackText title={title} sub={formatTrackSubtitle(track.artist, track.album)} />
      <span className="album-chip health-silence" title={`Silent ending: ${silence}`} aria-label={`Silent ending: ${silence}`}>
        <VolumeX aria-hidden="true" />
        {silence}
      </span>
    </li>
  );
}

export function HealthPage() {
  const { showSuccess, showError } = useToast();
  const [scan, setScan] = useState<SilenceScan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [threshold, setThreshold] = usePersistentState('health:threshold', THRESHOLDS[0]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);

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

  const visible = (scan?.tracks ?? []).filter((track) => track.silence >= threshold);
  const chosen = visible.filter((track) => selected.has(track.filename)).map((track) => track.filename);
  const allChosen = visible.length > 0 && chosen.length === visible.length;

  const toggle = useCallback((filename: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }, []);

  const toggleAll = () => {
    setSelected(allChosen ? new Set() : new Set(visible.map((track) => track.filename)));
  };

  const trim = async () => {
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const result = await healthApi.trimSilence(chosen);
      if (result.updated.length > 0) emitAppEvent('library-changed');
      setSelected((current) => {
        const next = new Set(current);
        result.updated.forEach((filename) => next.delete(filename));
        return next;
      });
      setScan(await healthApi.silence());
      if (result.failed.length === 0) {
        showSuccess(`Trimmed ${trackCount(result.updated.length)}`);
      } else if (chosen.length === 1) {
        showError(`Couldn't trim: ${result.failed[0].detail}`);
      } else {
        showError(`${result.failed.length} of ${trackCount(chosen.length)} couldn't be trimmed`);
      }
    } catch (err) {
      showError(errorMessage(err, 'Failed to trim the silence'));
    } finally {
      setBusy(false);
    }
  };

  const renderBody = () => {
    if (!loaded || scanning) {
      const progress = scan && scan.total > 0 ? `${scan.done} / ${scan.total}` : undefined;
      return <EmptyState loading text={progress} label="Scanning for silent endings" />;
    }
    if (!scan) return <EmptyState icon={VolumeX} />;
    if (scan.status === 'failed') return <EmptyState icon={CircleAlert} text={scan.error ?? "Couldn't scan the library"} />;
    return (
      <div className={`health-columns ${busy ? 'is-busy' : ''}`.trim()} aria-busy={busy}>
        <DiffColumn icon={VolumeX} label="Silent endings" count={visible.length}>
          {visible.map((track) => (
            <SilentRow key={track.filename} track={track} selected={selected.has(track.filename)} onToggle={toggle} />
          ))}
        </DiffColumn>
      </div>
    );
  };

  return (
    <div className="page page--fill sync-page health-page">
      <div className="sync-toolbar glass">
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
        <span className="health-select-all">
          <Checkbox
            label={allChosen ? 'Deselect all' : 'Select all'}
            checked={allChosen}
            indeterminate={chosen.length > 0 && !allChosen}
            onChange={toggleAll}
            disabled={visible.length === 0 || scanning || busy}
          />
        </span>
        <IconButton
          icon={ScanSearch}
          label="Scan again"
          className="sync-toolbar__push"
          onClick={() => void startScan()}
          disabled={scanning || busy}
        />
        <button
          type="button"
          className="btn-primary health-trim"
          onClick={() => void trim()}
          disabled={chosen.length === 0 || scanning || busy}
          aria-label={`Trim silence from ${trackCount(chosen.length)}`}
          title="Trim silence"
        >
          <Scissors aria-hidden="true" />
          {chosen.length}
        </button>
      </div>

      {renderBody()}
    </div>
  );
}
