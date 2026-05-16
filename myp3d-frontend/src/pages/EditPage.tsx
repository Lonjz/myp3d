import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mp3Api } from '../api/mp3Api';
import type { MP3Info } from '../api/mp3Api';
import { CoverCropModal } from '../components/cover/CoverCropModal';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';
import { useToast } from '../components/messages/ToastProvider';
import { InfiniteSidebarList } from '../components/sidebar/InfiniteSidebarList';
import { getCachedMp3Info, invalidateMp3Info, setCachedMp3Info } from '../utils/detailCache';

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
  const [existingCoverPreview, setExistingCoverPreview] = useState<string | null>(null);

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
    handleCoverFileSelect,
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
    if (info.has_cover) {
      setExistingCoverPreview(mp3Api.getCoverUrl(info.filename));
    } else {
      setExistingCoverPreview(null);
    }
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

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    await handleCoverFileSelect(file);
    e.target.value = '';
  };

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

      invalidateMp3Info(filename);
      if (result.filename === filename) {
        await loadMp3({ force: true });
      }
      
      // If filename changed, go back to library
      if (result.filename !== filename) {
        window.setTimeout(() => onBack(), 1000);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !mp3) return <div className="page"><p>Loading...</p></div>;
  if (!mp3) return <div className="page"><p>MP3 not found</p></div>;

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
          title="Edit Another Song"
          backLabel="← Back to Library"
          onBack={onBack}
          searchPlaceholder="Search title, artist, filename"
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
          emptyMessage="No matching songs."
          pinnedItem={mp3}
          pageSize={SIDEBAR_PAGE_SIZE}
          searchDebounceMs={300}
          scrollStorageKey={SIDEBAR_SCROLL_KEY}
        />

        <section className="details-main">
          <h1>Edit: {mp3.filename}</h1>
          {loading && <p className="input-help">Loading selected song...</p>}

          <div className="edit-container">
            <div className="cover-section">
              <div className="cover-preview">
                {effectiveCoverPreview ? (
                  <img src={effectiveCoverPreview} alt="Cover" />
                ) : (
                  <div className="no-cover-large">🎵</div>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleCoverChange}
                style={{ display: 'none' }}
              />
              <button onClick={() => fileInputRef.current?.click()} className="btn-secondary">
                Change Cover
              </button>
              <p className="input-help">Choose image, crop/zoom, then save as 500x500 cover.</p>
            </div>

            <div className="metadata-section">
              <div className="form-group">
                <label htmlFor="filename">Filename</label>
                <input
                  id="filename"
                  type="text"
                  value={newFilename}
                  onChange={(e) => setNewFilename(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="title">Title</label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="artist">Artist</label>
                <input
                  id="artist"
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="album">Album</label>
                <input
                  id="album"
                  type="text"
                  value={album}
                  onChange={(e) => setAlbum(e.target.value)}
                  disabled={saving}
                />
              </div>

              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div className="audio-player">
            <h3>Preview</h3>
            <audio
              controls
              src={mp3Api.getFileUrl(filename)}
              onLoadedMetadata={(e) => restoreAudioState(e.currentTarget)}
              onVolumeChange={(e) => persistAudioState(e.currentTarget)}
            />
          </div>
        </section>
      </div>

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
