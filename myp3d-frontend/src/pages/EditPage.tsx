import { useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DiscAlbum, FileAudio, ImagePlus, MicVocal, Save, Trash2, TriangleAlert, Type, Undo2 } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { MP3Info } from '../api/mp3Api';
import { CoverCropModal } from '../components/cover/CoverCropModal';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';
import { useToast } from '../components/messages/ToastProvider';
import { InfiniteSidebarList } from '../components/sidebar/InfiniteSidebarList';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { IconField } from '../components/ui/IconField';
import { Spinner } from '../components/ui/Spinner';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { emitAppEvent, subscribeAppEvent } from '../utils/appEvents';
import { getCachedMp3Info, setCachedMp3Info } from '../utils/detailCache';

interface EditPageProps {
  filename: string;
  onBack: () => void;
}

const SIDEBAR_SCROLL_KEY = 'edit-sidebar-scroll-top';
const EDIT_AUDIO_VOLUME_KEY = 'edit-audio-volume';
const EDIT_AUDIO_MUTED_KEY = 'edit-audio-muted';
const SIDEBAR_PAGE_SIZE = 25;

export function EditPage({ filename, onBack }: EditPageProps) {
  const navigate = useNavigate();
  const [mp3, setMp3] = useState<MP3Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError, clearToast } = useToast();

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [newFilename, setNewFilename] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, refreshCoverPreview] = useReducer((count: number) => count + 1, 0);

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
    resetCoverState,
  } = useCoverImageCrop({
    onError: showError,
    onClearError: clearToast,
    outputFilename: 'cover.jpg',
  });

  const applyMp3Info = (info: MP3Info) => {
    setMp3(info);
    setTitle(info.title || '');
    setArtist(info.artist || '');
    setAlbum(info.album || '');
    setNewFilename(info.filename);
  };

  const loadMp3 = async (options?: { force?: boolean }) => {
    const force = options?.force ?? false;
    clearToast();
    resetCoverState();

    if (!force) {
      const cached = getCachedMp3Info(filename);
      if (cached) {
        applyMp3Info(cached);
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      const info = await mp3Api.getInfo(filename);
      setCachedMp3Info(filename, info);
      applyMp3Info(info);
    } catch {
      showError('Failed to load MP3 info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMp3();
  }, [filename]);

  useEffect(() => subscribeAppEvent('library-changed', refreshCoverPreview), []);

  const isDirty =
    mp3 !== null &&
    (title !== (mp3.title || '') ||
      artist !== (mp3.artist || '') ||
      album !== (mp3.album || '') ||
      newFilename !== mp3.filename ||
      coverFile !== null);

  const { blocker, allowNavigation } = useUnsavedChangesGuard(isDirty);

  const handleSave = async () => {
    setSaving(true);
    clearToast();

    try {
      // Update metadata
      const result = await mp3Api.updateMetadata(filename, {
        title: title || undefined,
        artist: artist || undefined,
        album: album || undefined,
        new_filename: newFilename !== filename ? newFilename : undefined,
      });

      // Update cover if changed
      if (coverFile) {
        await mp3Api.updateCover(result.filename, coverFile);
      }

      showSuccess('Saved successfully!');

      emitAppEvent('library-changed');
      if (result.filename === filename) {
        await loadMp3({ force: true });
      }
      
      // If filename changed, go back to library
      if (result.filename !== filename) {
        allowNavigation();
        window.setTimeout(() => onBack(), 1000);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !mp3) return <div className="page"><Spinner /></div>;
  if (!mp3) return <div className="page"><p className="page-empty">Track not found</p></div>;

  const existingCoverPreview = mp3.has_cover ? mp3Api.getCoverUrl(mp3.filename) : null;
  const effectiveCoverPreview = coverPreview || existingCoverPreview;

  const restoreAudioState = (audio: HTMLAudioElement) => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedVolume = window.localStorage.getItem(EDIT_AUDIO_VOLUME_KEY);
    if (storedVolume !== null) {
      const parsedVolume = Number(storedVolume);
      if (Number.isFinite(parsedVolume)) {
        const clampedVolume = Math.min(1, Math.max(0, parsedVolume));
        audio.volume = clampedVolume;
      }
    }

    const storedMuted = window.localStorage.getItem(EDIT_AUDIO_MUTED_KEY);
    if (storedMuted !== null) {
      audio.muted = storedMuted === 'true';
    }
  };

  const persistAudioState = (audio: HTMLAudioElement) => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(EDIT_AUDIO_VOLUME_KEY, String(audio.volume));
    window.localStorage.setItem(EDIT_AUDIO_MUTED_KEY, String(audio.muted));
  };

  return (
    <div className="page">
      <div className="details-layout">
        <InfiniteSidebarList<MP3Info>
          backLabel="Back to library"
          onBack={onBack}
          activeKey={filename}
          getItemKey={(song) => song.filename}
          getItemTitle={(song) => song.title || song.filename}
          getItemSubtitle={(song) => song.artist || 'Unknown Artist'}
          onSelect={(song) => navigate(`/details/${encodeURIComponent(song.filename)}`)}
          fetchPage={async ({ page, limit, search }) => {
            const response = await mp3Api.listAllPaged({
              page,
              limit,
              search,
              filterBy: 'all',
              sortBy: 'date_added',
              sortDirection: 'desc',
            });

            return {
              items: response.items,
              total: response.meta.total,
              totalPages: response.meta.total_pages,
            };
          }}
          emptyMessage="No matches"
          pinnedItem={mp3}
          pageSize={SIDEBAR_PAGE_SIZE}
          searchDebounceMs={300}
          scrollStorageKey={SIDEBAR_SCROLL_KEY}
        />

        <section className="details-main">
          <h1 className="details-title">{mp3.title || mp3.filename}</h1>

          <div className="edit-container glass">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleCoverChange}
              className="hidden-file-input"
            />
            <button
              type="button"
              className="cover-preview"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Change cover"
              title="Change cover"
            >
              {effectiveCoverPreview ? (
                <img src={effectiveCoverPreview} alt="" />
              ) : (
                <div className="no-cover-large">🎵</div>
              )}
              <span className="cover-preview__overlay" aria-hidden="true">
                <ImagePlus />
              </span>
            </button>

            <div className="metadata-section">
              <IconField
                icon={FileAudio}
                label="File name"
                value={newFilename}
                onChange={(e) => setNewFilename(e.target.value)}
                disabled={saving}
              />
              <IconField
                icon={Type}
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={saving}
              />
              <IconField
                icon={MicVocal}
                label="Artist"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                disabled={saving}
              />
              <IconField
                icon={DiscAlbum}
                label="Album"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                disabled={saving}
              />

              <button onClick={handleSave} disabled={saving} className="btn-primary metadata-save">
                {saving ? <Spinner inline /> : <Save aria-hidden="true" />}
                Save
              </button>
            </div>
          </div>

          <div className="audio-player glass glass--strong">
            <audio
              controls
              src={mp3Api.getFileUrl(filename)}
              onLoadedMetadata={(e) => restoreAudioState(e.currentTarget)}
              onVolumeChange={(e) => persistAudioState(e.currentTarget)}
            />
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        icon={TriangleAlert}
        title="Discard changes?"
        cancelLabel="Stay"
        cancelIcon={Undo2}
        confirmLabel="Discard"
        confirmIcon={Trash2}
        tone="danger"
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />

      <CoverCropModal
        isOpen={isCropModalOpen}
        cropSource={cropSource}
        crop={crop}
        zoom={zoom}
        isApplyingCrop={isApplyingCrop}
        zoomInputId="editCropZoom"
        onCropChange={setCrop}
        onZoomChange={setZoom}
        onCropComplete={handleCropComplete}
        onCancel={handleCancelCrop}
        onApply={handleApplyCrop}
      />
    </div>
  );
}
