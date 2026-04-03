import { useState } from 'react';
import { mp3Api } from '../api/mp3Api';
import type { DownloadRequest } from '../api/mp3Api';
import { AppModal } from '../components/AppModal';

export function DownloadPage() {
  const [url, setUrl] = useState('');
  const [customFilename, setCustomFilename] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalState, setModalState] = useState<{ title: string; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setModalState({ title: 'Missing URL', text: 'Please enter a YouTube URL.' });
      return;
    }

    setLoading(true);

    try {
      const request: DownloadRequest = {
        url: url.trim(),
        custom_filename: customFilename.trim() || undefined,
        title: title.trim() || undefined,
        artist: artist.trim() || undefined,
        album: album.trim() || undefined,
      };

      const result = await mp3Api.download(request);
      setModalState({ title: 'Download Complete', text: `Downloaded: ${result.filename}` });
      
      // Clear form
      setUrl('');
      setCustomFilename('');
      setTitle('');
      setArtist('');
      setAlbum('');
    } catch (err) {
      setModalState({
        title: 'Download Failed',
        text: err instanceof Error ? err.message : 'Download failed',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Download MP3</h1>
      <form onSubmit={handleSubmit} className="download-form">
        <div className="form-group">
          <label htmlFor="url">YouTube URL *</label>
          <input
            id="url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="customFilename">Custom Filename (optional)</label>
          <input
            id="customFilename"
            type="text"
            value={customFilename}
            onChange={(e) => setCustomFilename(e.target.value)}
            placeholder="my-song"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Song Title"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="artist">Artist</label>
          <input
            id="artist"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artist Name"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="album">Album</label>
          <input
            id="album"
            type="text"
            value={album}
            onChange={(e) => setAlbum(e.target.value)}
            placeholder="Album Name"
            disabled={loading}
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Downloading...' : 'Download MP3'}
        </button>
      </form>

      <AppModal
        open={modalState !== null}
        title={modalState?.title ?? ''}
        onClose={() => setModalState(null)}
        actions={
          <button className="btn-primary" onClick={() => setModalState(null)}>
            Close
          </button>
        }
      >
        <p>{modalState?.text}</p>
      </AppModal>
    </div>
  );
}
