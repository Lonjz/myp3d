import { useState } from 'react';
import type { FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import { queueApi } from '../../api/queueApi';
import type { QueueItem, QueueItemUpdate } from '../../api/queueApi';
import { useDownloadForm } from '../../hooks/useDownloadForm';
import { useTrimPreview } from '../../hooks/useTrimPreview';
import { getVideoIdFromUrl } from '../../utils/youtube';
import { CoverCropModal } from '../cover/CoverCropModal';
import { DownloadConfigSection } from '../download/DownloadConfigSection';
import { TrimRangeSection } from '../download/TrimRangeSection';
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

  const videoId = getVideoIdFromUrl(url);
  const { containerRef: playerRef, ...trim } = useTrimPreview(videoId, { start: item.start_time ?? 0, end: item.end_time ?? 0 });
  const confirming = overwriteDialogProps.open;

  const handleUrlChange = (nextUrl: string) => {
    if (getVideoIdFromUrl(nextUrl) !== videoId) trim.reset(null);
    setUrl(nextUrl);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim()) {
      showError('Please enter a YouTube URL');
      return;
    }
    if (trim.hasDuration && !trim.hasTrimRange) {
      showError('Trim end must be after start');
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
    if (trim.hasDuration) {
      changes.start_time = trim.shouldTrim ? trim.start : null;
      changes.end_time = trim.shouldTrim ? trim.end : null;
    }

    trim.pause();

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
                onUrlChange={handleUrlChange}
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

              {videoId && <div ref={playerRef} className="downloads-dialog__player" aria-hidden="true" />}
              <TrimRangeSection {...trim.trimRangeProps} disabled={saving} />

              <div className="downloads-dialog__actions">
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
