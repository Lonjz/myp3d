import { useEffect, useState, useRef } from 'react';
import { mp3Api } from '../api/mp3Api';
import type { MP3Info } from '../api/mp3Api';

interface EditPageProps {
  filename: string;
  onBack: () => void;
}

export function EditPage({ filename, onBack }: EditPageProps) {
  const [mp3, setMp3] = useState<MP3Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [newFilename, setNewFilename] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [newCoverFile, setNewCoverFile] = useState<File | null>(null);

  useEffect(() => {
    loadMp3();
  }, [filename]);

  const loadMp3 = async () => {
    try {
      setLoading(true);
      const info = await mp3Api.getInfo(filename);
      setMp3(info);
      setTitle(info.title || '');
      setArtist(info.artist || '');
      setAlbum(info.album || '');
      setNewFilename(info.filename);
      if (info.has_cover) {
        setCoverPreview(mp3Api.getCoverUrl(filename));
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load MP3 info' });
    } finally {
      setLoading(false);
    }
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
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
      if (newCoverFile) {
        await mp3Api.updateCover(result.filename, newCoverFile);
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

  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (!mp3) return <div className="page"><p>MP3 not found</p></div>;

  return (
    <div className="page">
      <button onClick={onBack} className="btn-secondary" style={{ marginBottom: '1rem' }}>
        ← Back to Library
      </button>

      <h1>Edit: {mp3.filename}</h1>

      <div className="edit-container">
        <div className="cover-section">
          <div className="cover-preview">
            {coverPreview ? (
              <img src={coverPreview} alt="Cover" />
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
        <audio controls src={mp3Api.getFileUrl(filename)} />
      </div>
    </div>
  );
}
