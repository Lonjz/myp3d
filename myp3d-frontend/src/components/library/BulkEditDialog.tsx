import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DiscAlbum, ImagePlus, MicVocal, Music, Save, X } from 'lucide-react';
import { mp3Api } from '../../api/mp3Api';
import type { BulkResult, BulkTagUpdate, MP3Info } from '../../api/mp3Api';
import { emitAppEvent } from '../../utils/appEvents';
import { CoverCropModal } from '../cover/CoverCropModal';
import { useCoverImageCrop } from '../cover/useCoverImageCrop';
import { useToast } from '../messages/ToastProvider';
import { IconField } from '../ui/IconField';
import { Spinner } from '../ui/Spinner';

interface BulkEditDialogProps {
  tracks: MP3Info[];
  closing: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const sharedValue = (tracks: MP3Info[], pick: (track: MP3Info) => string | null | undefined) => {
  const first = pick(tracks[0]) ?? '';
  return tracks.every((track) => (pick(track) ?? '') === first) ? first : '';
};

export function BulkEditDialog({ tracks: selectedTracks, closing, onClose, onSaved }: BulkEditDialogProps) {
  const { showSuccess, showError, showInfo, clearToast } = useToast();
  const [tracks] = useState(selectedTracks);
  const [initial] = useState(() => ({
    artist: sharedValue(tracks, (track) => track.artist),
    album: sharedValue(tracks, (track) => track.album),
  }));
  const [artist, setArtist] = useState(initial.artist);
  const [album, setAlbum] = useState(initial.album);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    coverFile,
    coverPreview,
    cropSource,
    crop,
    zoom,
    isCropModalOpen,
    isApplyingCrop,
    setCrop,
    setZoom,
    handleCropComplete,
    handleCoverChange,
    handleApplyCrop,
    handleCancelCrop,
  } = useCoverImageCrop({ onError: showError, onClearError: clearToast });

  const tags: BulkTagUpdate = {};
  if (artist !== initial.artist) tags.artist = artist;
  if (album !== initial.album) tags.album = album;
  const hasTagChanges = Object.keys(tags).length > 0;
  const isDirty = hasTagChanges || coverFile !== null;

  useEffect(() => {
    if (isCropModalOpen || saving || closing) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isCropModalOpen, saving, closing, onClose]);

  const handleSave = async () => {
    const filenames = tracks.map((track) => track.filename);
    setSaving(true);
    showInfo('Saving...');

    try {
      const results: BulkResult[] = [];
      if (hasTagChanges) results.push(await mp3Api.bulkUpdateTags(filenames, tags));
      if (coverFile) results.push(await mp3Api.bulkUpdateCover(filenames, coverFile));
      emitAppEvent('library-changed');

      const failed = new Set(results.flatMap((result) => result.failed.map((entry) => entry.filename)));
      if (failed.size > 0) {
        showError(`${failed.size} of ${filenames.length} tracks failed to update`);
      } else {
        showSuccess(`Updated ${filenames.length} track${filenames.length === 1 ? '' : 's'}`);
      }
      onSaved();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Bulk update failed');
      setSaving(false);
    }
  };

  const sharedCoverTrack = initial.album && tracks[0].has_cover ? tracks[0] : null;
  const preview = coverPreview || (sharedCoverTrack ? mp3Api.getCoverUrl(sharedCoverTrack.filename, 'medium') : null);

  return createPortal(
    isCropModalOpen ? (
      <CoverCropModal
        isOpen={isCropModalOpen}
        cropSource={cropSource}
        crop={crop}
        zoom={zoom}
        isApplyingCrop={isApplyingCrop}
        zoomInputId="bulkCropZoom"
        onCropChange={setCrop}
        onZoomChange={setZoom}
        onCropComplete={handleCropComplete}
        onCancel={handleCancelCrop}
        onApply={handleApplyCrop}
      />
    ) : (
      <div className="confirm-layer" data-state={closing ? 'closed' : 'open'}>
        <div className="confirm-scrim" onMouseDown={saving ? undefined : onClose} />
        <div
          className="bulk-edit-dialog glass"
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${tracks.length} tracks`}
        >
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleCoverChange}
            className="hidden-file-input"
          />

          <div className="bulk-edit-dialog__body">
            <button
              type="button"
              className="cover-preview bulk-edit-dialog__cover"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              aria-label="Change cover"
              title="Change cover"
            >
              {preview ? <img src={preview} alt="" /> : <ImagePlus className="bulk-edit-dialog__cover-icon" aria-hidden="true" />}
              <span className="cover-preview__overlay" aria-hidden="true">
                <ImagePlus />
              </span>
            </button>

            <div className="bulk-edit-dialog__fields">
              <span className="album-chip bulk-edit-dialog__count" title="Tracks">
                <Music aria-hidden="true" />
                {tracks.length}
              </span>
              <IconField
                icon={MicVocal}
                label="Artist"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                disabled={saving}
                autoFocus
              />
              <IconField
                icon={DiscAlbum}
                label="Album"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="confirm-dialog__actions">
            <button type="button" className="confirm-btn" onClick={onClose} disabled={saving}>
              <X aria-hidden="true" />
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary bulk-edit-dialog__save"
              onClick={() => void handleSave()}
              disabled={!isDirty || saving}
            >
              {saving ? <Spinner inline /> : <Save aria-hidden="true" />}
              Save
            </button>
          </div>
        </div>
      </div>
    ),
    document.body,
  );
}
