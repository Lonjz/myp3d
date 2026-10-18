import { useState } from 'react';
import type { CSSProperties } from 'react';
import {
  BrushCleaning,
  CircleAlert,
  CircleCheck,
  Download,
  Hourglass,
  Music,
  Pencil,
  Play,
  RotateCcw,
  Scissors,
  Square,
  X,
} from 'lucide-react';
import { queueApi } from '../api/queueApi';
import type { QueueItem } from '../api/queueApi';
import { QueueItemDialog } from '../components/downloads/QueueItemDialog';
import { useDownloadQueue } from '../components/downloads/downloadQueueContext';
import { IconButton } from '../components/ui/IconButton';
import { Spinner } from '../components/ui/Spinner';
import { usePresence } from '../hooks/usePresence';
import { formatDuration } from '../utils/formatters';
import { getVideoIdFromUrl, getYouTubeThumbnailUrl } from '../utils/youtube';

const subtitle = (item: QueueItem) => [item.artist, item.album].filter(Boolean).join(' · ');

function coverSource(item: QueueItem): string | undefined {
  if (item.has_cover) return queueApi.getCoverUrl(item);
  const videoId = getVideoIdFromUrl(item.url);
  return videoId ? getYouTubeThumbnailUrl(videoId) : undefined;
}

function QueueStatusIndicator({ item }: { item: QueueItem }) {
  if (item.status === 'running') {
    const progress = item.progress ?? 0;
    return (
      <span className="queue-status" title="Downloading">
        {progress > 0 && progress < 1 ? (
          <span
            className="sync-meter queue-status__meter"
            role="progressbar"
            aria-label="Downloading"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span style={{ width: `${progress * 100}%` }} />
          </span>
        ) : (
          <Spinner inline />
        )}
      </span>
    );
  }
  if (item.status === 'queued') {
    return (
      <span className="queue-status" title="Queued" aria-label="Queued">
        <Hourglass aria-hidden="true" />
      </span>
    );
  }
  if (item.status === 'done') {
    const label = item.filename ? `Downloaded: ${item.filename}` : 'Downloaded';
    return (
      <span className="queue-status queue-status--done" title={label} aria-label={label}>
        <CircleCheck aria-hidden="true" />
      </span>
    );
  }
  if (item.status === 'failed') {
    return (
      <span className="queue-status queue-status--failed" title={item.error ?? 'Failed'} aria-label="Failed">
        <CircleAlert aria-hidden="true" />
      </span>
    );
  }
  return null;
}

interface QueueRowProps {
  item: QueueItem;
  index: number;
  busy: boolean;
  onStart: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

function QueueRow({ item, index, busy, onStart, onEdit, onRemove }: QueueRowProps) {
  const cover = coverSource(item);
  const title = item.title || item.custom_filename || item.url;
  const sub = item.status === 'failed' ? item.error ?? '' : subtitle(item);
  const editable = item.status === 'pending' || item.status === 'failed';
  const trimLabel =
    item.start_time !== null && item.end_time !== null
      ? `${formatDuration(item.start_time)} – ${formatDuration(item.end_time)}`
      : null;

  return (
    <li className={`music-row queue-row queue-row--${item.status}`} style={{ '--row': index } as CSSProperties}>
      <span className={`music-cover ${item.has_cover ? '' : 'queue-row__thumb'}`.trim()} aria-hidden="true">
        {cover ? <img src={cover} alt="" loading="lazy" /> : <Music />}
      </span>
      <div className="music-row__text">
        <span className="music-row__title" title={title}>{title}</span>
        {sub && <span className="music-row__sub" title={sub}>{sub}</span>}
      </div>
      {trimLabel && (
        <span className="queue-trim" title={trimLabel} aria-label={`Trim ${trimLabel}`}>
          <Scissors aria-hidden="true" />
        </span>
      )}
      <QueueStatusIndicator item={item} />
      <span className="queue-row__actions">
        {editable && (
          <IconButton
            icon={item.status === 'failed' ? RotateCcw : Play}
            label={item.status === 'failed' ? 'Retry' : 'Start'}
            size="sm"
            variant="ghost"
            onClick={onStart}
            disabled={busy}
          />
        )}
        {editable && <IconButton icon={Pencil} label="Edit" size="sm" variant="ghost" onClick={onEdit} disabled={busy} />}
        {item.status !== 'running' && (
          <IconButton icon={X} label="Remove" size="sm" variant="ghost" onClick={onRemove} disabled={busy} />
        )}
      </span>
    </li>
  );
}

export function DownloadsPage() {
  const { items, active, busy, start, stop, clearDone, remove } = useDownloadQueue();
  const [editTarget, setEditTarget] = useState<QueueItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const editPresence = usePresence(editOpen);

  const pendingCount = items?.filter((item) => item.status === 'pending').length ?? 0;
  const queuedCount = items?.filter((item) => item.status === 'queued').length ?? 0;
  const doneCount = items?.filter((item) => item.status === 'done').length ?? 0;

  const openEditor = (item: QueueItem) => {
    setEditTarget(item);
    setEditOpen(true);
  };

  return (
    <div className="page page--fill sync-page downloads-page">
      <div className="sync-toolbar glass">
        <IconButton
          icon={BrushCleaning}
          label="Clear finished"
          onClick={() => void clearDone()}
          disabled={busy || doneCount === 0}
        />
        {active ? (
          <button
            type="button"
            className="btn-primary downloads-run"
            onClick={() => void stop()}
            disabled={busy || queuedCount === 0}
            title="Stop after the current download"
          >
            <Square aria-hidden="true" />
            {queuedCount}
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary downloads-run"
            onClick={() => void start()}
            disabled={busy || pendingCount === 0}
            title="Start downloads"
          >
            <Play aria-hidden="true" />
            {pendingCount}
          </button>
        )}
      </div>

      {items === null || items.length === 0 ? (
        <div className="sync-empty glass">
          {items === null ? (
            <Spinner />
          ) : (
            <span className="sync-radar" aria-hidden="true">
              <Download />
            </span>
          )}
        </div>
      ) : (
        <section className="downloads-list glass" aria-label="Downloads">
          <ul className="music-rows">
            {items.map((item, index) => (
              <QueueRow
                key={item.id}
                item={item}
                index={index}
                busy={busy}
                onStart={() => void start([item.id])}
                onEdit={() => openEditor(item)}
                onRemove={() => void remove(item.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {editPresence.mounted && editTarget && (
        <QueueItemDialog
          key={editTarget.id}
          item={editTarget}
          closing={editPresence.closing}
          onClose={() => setEditOpen(false)}
          onSaved={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
