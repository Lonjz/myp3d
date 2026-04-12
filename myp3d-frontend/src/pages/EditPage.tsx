import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { mp3Api } from '../api/mp3Api';
import type { MP3Info } from '../api/mp3Api';
import { CoverCropModal } from '../components/cover/CoverCropModal';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';

interface EditPageProps {
  filename: string;
  onBack: () => void;
}

const SIDEBAR_SCROLL_KEY = 'edit-sidebar-scroll-top';
const EDIT_AUDIO_VOLUME_KEY = 'edit-audio-volume';
const EDIT_AUDIO_MUTED_KEY = 'edit-audio-muted';

export function EditPage({ filename, onBack }: EditPageProps) {
  const navigate = useNavigate();
  const [mp3, setMp3] = useState<MP3Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [librarySongs, setLibrarySongs] = useState<MP3Info[]>([]);
  const [songSearch, setSongSearch] = useState('');

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [newFilename, setNewFilename] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailsSongListRef = useRef<HTMLDivElement>(null);
  const hasRestoredSidebarScrollRef = useRef(false);
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
    onError: (text) => setMessage({ type: 'error', text }),
    onClearError: () => setMessage(null),
    outputFilename: 'cover.jpg',
  });

  useEffect(() => {
    loadMp3();
  }, [filename]);

  useEffect(() => {
    loadLibrarySongs();
  }, []);

  useEffect(() => {
    if (hasRestoredSidebarScrollRef.current) {
      return;
    }

    if (!detailsSongListRef.current || typeof window === 'undefined') {
      return;
    }

    const storedScrollTop = window.sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    const scrollTop = storedScrollTop ? Number(storedScrollTop) : 0;

    if (Number.isFinite(scrollTop) && scrollTop > 0) {
      detailsSongListRef.current.scrollTop = scrollTop;
    }

    hasRestoredSidebarScrollRef.current = true;
  }, [librarySongs.length]);

  const persistSidebarScroll = () => {
    if (typeof window === 'undefined' || !detailsSongListRef.current) {
      return;
    }

    window.sessionStorage.setItem(
      SIDEBAR_SCROLL_KEY,
      String(detailsSongListRef.current.scrollTop),
    );
  };

  const loadMp3 = async () => {
    try {
      setLoading(true);
      setMessage(null);
      resetCoverState();
      const info = await mp3Api.getInfo(filename);
      setMp3(info);
      setTitle(info.title || '');
      setArtist(info.artist || '');
      setAlbum(info.album || '');
      setNewFilename(info.filename);
      if (info.has_cover) {
        setExistingCoverPreview(mp3Api.getCoverUrl(filename));
      } else {
        setExistingCoverPreview(null);
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load MP3 info' });
    } finally {
      setLoading(false);
    }
  };

  const loadLibrarySongs = async () => {
    try {
      const list = await mp3Api.listAll();
      setLibrarySongs(list);
    } catch {
      // Keep editor available even if list cannot be loaded.
      setLibrarySongs([]);
    }
  };

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
    setMessage(null);

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

      setMessage({ type: 'success', text: 'Saved successfully!' });
      
      // If filename changed, go back to library
      if (result.filename !== filename) {
        setTimeout(() => onBack(), 1000);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !mp3) return <div className="page"><p>Loading...</p></div>;
  if (!mp3) return <div className="page"><p>MP3 not found</p></div>;

  const normalizedSongSearch = songSearch.trim().toLowerCase();
  const effectiveCoverPreview = coverPreview || existingCoverPreview;
  const visibleSongs = librarySongs.filter((song) => {
    if (!normalizedSongSearch) return true;
    return (
      (song.title || '').toLowerCase().includes(normalizedSongSearch) ||
      (song.artist || '').toLowerCase().includes(normalizedSongSearch) ||
      song.filename.toLowerCase().includes(normalizedSongSearch)
    );
  });

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
        <aside className="details-sidebar">
          <button
            onClick={() => {
              persistSidebarScroll();
              onBack();
            }}
            className="btn-secondary details-back-btn"
          >
            ← Back to Library
          </button>

          <h3>Edit Another Song</h3>
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <input
              type="text"
              value={songSearch}
              onChange={(e) => setSongSearch(e.target.value)}
              placeholder="Search title, artist, filename"
            />
          </div>

          <div className="details-song-list" ref={detailsSongListRef} onScroll={persistSidebarScroll}>
            {visibleSongs.map((song) => {
              const isActive = song.filename === filename;
              return (
                <button
                  key={song.filename}
                  type="button"
                  className={`details-song-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    persistSidebarScroll();
                    navigate(`/details/${encodeURIComponent(song.filename)}`);
                  }}
                  disabled={isActive}
                >
                  <span className="details-song-title">{song.title || song.filename}</span>
                  <span className="details-song-subtitle">
                    {song.artist || 'Unknown Artist'}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

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

              {message && (
                <div className={`message ${message.type}`}>
                  {message.text}
                </div>
              )}
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
