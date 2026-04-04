import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mp3Api } from '../api/mp3Api';
import type { MP3Info } from '../api/mp3Api';

export function LibraryPage() {
  const navigate = useNavigate();
  const [mp3s, setMp3s] = useState<MP3Info[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMp3s = async () => {
    try {
      setLoading(true);
      const list = await mp3Api.listAll();
      setMp3s(list);
      setError(null);
    } catch (err) {
      setError('Failed to load MP3 library');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMp3s();
  }, []);

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await mp3Api.delete(filename);
      loadMp3s();
    } catch {
      alert('Failed to delete file');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (error) return <div className="page"><p className="error">{error}</p></div>;

  return (
    <div className="page">
      <h1>MP3 Library</h1>
      <button onClick={loadMp3s} className="btn-secondary" style={{ marginBottom: '1rem' }}>
        Refresh
      </button>

      {mp3s.length === 0 ? (
        <p>No MP3 files yet. Download some!</p>
      ) : (
        <div className="mp3-list">
          {mp3s.map((mp3) => (
            <div key={mp3.filename} className="mp3-card">
              <div className="mp3-cover">
                {mp3.has_cover ? (
                  <img src={mp3Api.getCoverUrl(mp3.filename)} alt="Cover" />
                ) : (
                  <div className="no-cover">🎵</div>
                )}
              </div>
              <div className="mp3-info">
                <h3>{mp3.title || mp3.filename}</h3>
                <p className="artist">{mp3.artist || 'Unknown Artist'}</p>
                <p className="album">{mp3.album || 'Unknown Album'}</p>
                <p className="size">{formatSize(mp3.file_size)}</p>
              </div>
              <div className="mp3-actions">
                <button
                  onClick={() => navigate(`/details/${encodeURIComponent(mp3.filename)}`)}
                  className="btn-secondary"
                >
                  Edit
                </button>
                <a href={mp3Api.getFileUrl(mp3.filename)} download className="btn-secondary">
                  Download
                </a>
                <button onClick={() => handleDelete(mp3.filename)} className="btn-danger">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
