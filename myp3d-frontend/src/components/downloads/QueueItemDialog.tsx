import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Save, Scissors, X } from 'lucide-react';
import { queueApi } from '../../api/queueApi';
import type { QueueItem, QueueItemUpdate } from '../../api/queueApi';
import { useDownloadForm } from '../../hooks/useDownloadForm';
import { formatDuration } from '../../utils/formatters';
import { CoverCropModal } from '../cover/CoverCropModal';
import { DownloadConfigSection } from '../download/DownloadConfigSection';
import { useToast } from '../messages/ToastProvider';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Spinner } from '../ui/Spinner';
import { useDownloadQueue } from './downloadQueueContext';

interface QueueItemDialogProps {
  item: QueueItem;
  closing: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function QueueItemDialog({ item, closing, onClose, onSaved }: QueueItemDialogProps) {
  const { showError } = useToast();
  const { update } = useDownloadQueue();
  const [initialCover] = useState(() => (item.has_cover ? queueApi.getCoverUrl(item) : undefined));
  const [saving, setSaving] = useState(false);

  const {
    url,
    setUrl,
    customFilename,
    setCustomFilename,
    filenameStatus,
    title,
    setTitle,
    artist,
    setArtist,
    album,
    setAlbum,
    coverImageBase64,
    coverPreview,
    handleCoverFileSelect,
    handleRemoveCover,
    cropModalProps,
    overwriteDialogProps,
    checkOverwrite,
  } = useDownloadForm({
    zoomInputId: 'queueCropZoom',
    initialValues: {
      url: item.url,
      customFilename: item.custom_filename ?? '',
      title: item.title ?? '',
      artist: item.artist ?? '',
      album: item.album ?? '',
      cover: initialCover,
    },
  });

  const confirming = overwriteDialogProps.open;
  const isTrimmed = item.start_time !== null && item.end_time !== null;

  useEffect(() => {
    if (cropModalProps.isOpen || confirming || saving || closing) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [cropModalProps.isOpen, confirming, saving, closing, onClose]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim()) {
      showError('Please enter a YouTube URL');
      return;
    }

    const filename = customFilename.trim().toLowerCase();
    const keepsOverwrite = item.overwrite && filename === (item.custom_filename ?? '');
    const overwrite = keepsOverwrite || (await checkOverwrite());
    if (overwrite === null) return;

    const changes: QueueItemUpdate = {
      url: url.trim(),
      custom_filename: filename,
      title,
      artist,
      album,
      overwrite,
    };
    if (coverImageBase64 !== initialCover) changes.cover_image_base64 = coverImageBase64 ?? null;

    setSaving(true);
    const saved = await update(item.id, changes);
    setSaving(false);
    if (saved) onSaved();
  };

  return (
    <>
      {createPortal(
        cropModalProps.isOpen ? (
          <CoverCropModal {...cropModalProps} />
        ) : (
          <div className="confirm-layer" data-state={closing ? 'closed' : 'open'}>
            <div className="confirm-scrim" onMouseDown={saving ? undefined : onClose} />
            <form
              className="queue-dialog glass"
              role="dialog"
              aria-modal="true"
              aria-label="Edit download"
              onSubmit={(event) => void handleSave(event)}
            >
              <DownloadConfigSection
                idPrefix="queue"
                url={url}
                onUrlChange={setUrl}
                customFilename={customFilename}
                onCustomFilenameChange={setCustomFilename}
                filenameStatus={filenameStatus}
                title={title}
                onTitleChange={setTitle}
                artist={artist}
                onArtistChange={setArtist}
                album={album}
                onAlbumChange={setAlbum}
                coverPreview={coverPreview}
                onCoverSelect={handleCoverFileSelect}
                onCoverClear={handleRemoveCover}
                disabled={saving}
              />

              <div className="queue-dialog__actions">
                {isTrimmed && (
                  <span className="album-chip queue-dialog__trim" title="Trim">
                    <Scissors aria-hidden="true" />
                    {formatDuration(item.start_time)} – {formatDuration(item.end_time)}
                  </span>
                )}
                <button type="button" className="confirm-btn" onClick={onClose} disabled={saving}>
                  <X aria-hidden="true" />
                  Cancel
                </button>
                <button type="submit" className="btn-primary queue-dialog__save" disabled={saving}>
                  {saving ? <Spinner inline /> : <Save aria-hidden="true" />}
                  Save
                </button>
              </div>
            </form>
          </div>
        ),
        document.body,
      )}
      <ConfirmDialog {...overwriteDialogProps} />
    </>
  );
}
