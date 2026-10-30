import { useState } from 'react';
import type { FormEvent } from 'react';
import { Save, Scissors, X } from 'lucide-react';
import { queueApi } from '../../api/queueApi';
import type { QueueItem, QueueItemUpdate } from '../../api/queueApi';
import { useDownloadForm } from '../../hooks/useDownloadForm';
import { formatDuration } from '../../utils/formatters';
import { CoverCropModal } from '../cover/CoverCropModal';
import { DownloadConfigSection } from '../download/DownloadConfigSection';
import { useToast } from '../messages/toastContext';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useDownloadQueue } from './downloadQueueContext';
import { IconButton } from '../ui/IconButton';
import { Modal } from '../ui/Modal';

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
      <Modal
        className="downloads-dialog"
        closing={closing}
        locked={saving || confirming || cropModalProps.isOpen}
        onClose={onClose}
        label="Edit download"
      >
            <form className="modal-form" onSubmit={(event) => void handleSave(event)}>
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

              <div className="downloads-dialog__actions">
                {isTrimmed && (
                  <span className="album-chip downloads-dialog__trim" title="Trim">
                    <Scissors aria-hidden="true" />
                    {formatDuration(item.start_time)} – {formatDuration(item.end_time)}
                  </span>
                )}
                <IconButton icon={X} label="Cancel" onClick={onClose} disabled={saving} />
                <IconButton type="submit" icon={Save} label="Save" variant="primary" busy={saving} disabled={saving} />
              </div>
            </form>
      </Modal>
      <CoverCropModal {...cropModalProps} />
      <ConfirmDialog {...overwriteDialogProps} />
    </>
  );
}
