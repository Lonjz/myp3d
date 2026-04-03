import { useEffect, useState } from 'react';
import { mp3Api } from '../api/mp3Api';
import type { MP3Info } from '../api/mp3Api';
import { AppModal } from '../components/AppModal';

interface LibraryPageProps {
  onEdit: (filename: string) => void;
}

type ModalState =
  | { kind: 'confirm-delete'; filename: string }
  | { kind: 'confirm-normalize' }
  | { kind: 'result'; title: string; message: string }
  | null;

export function LibraryPage({ onEdit }: LibraryPageProps) {
  const [mp3s, setMp3s] = useState<MP3Info[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [normalizing, setNormalizing] = useState(false);
  const [modalState, setModalState] = useState<ModalState>(null);

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
    setModalState({ kind: 'confirm-delete', filename });
  };

  const confirmDelete = async (filename: string) => {
    try {
      await mp3Api.delete(filename);
      await loadMp3s();
    } catch {
      setModalState({ kind: 'result', title: 'Delete Failed', message: 'Failed to delete file.' });
    }
  };

  const handleNormalizeAll = async () => {
    setModalState({ kind: 'confirm-normalize' });
  };

  const confirmNormalizeAll = async () => {
    try {
      setNormalizing(true);
      const result = await mp3Api.normalizeAll();
      const failedFiles = result.results
        .filter((row) => row.status === 'error')
        .slice(0, 5)
        .map((row) => row.filename)
        .join(', ');

      const failureSuffix = failedFiles ? `\nFailed files: ${failedFiles}` : '';
      setModalState({
        kind: 'result',
        title: 'Normalization Complete',
        message:
          `Default target: ${result.target_peak_db} dB\n` +
          `Normalized: ${result.normalized}\n` +
          `Skipped: ${result.skipped}\n` +
          `Failed: ${result.failed}${failureSuffix}`,
      });

      await loadMp3s();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Normalization failed';
      setModalState({ kind: 'result', title: 'Normalization Failed', message });
    } finally {
      setNormalizing(false);
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
      <div className="library-controls">
        <button onClick={loadMp3s} className="btn-secondary">
          Refresh
        </button>

        <button onClick={handleNormalizeAll} className="btn-primary" disabled={normalizing}>
          {normalizing ? 'Normalizing...' : 'Normalize All (Default)'}
        </button>
      </div>

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
                <button onClick={() => onEdit(mp3.filename)} className="btn-secondary">
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

      <AppModal
        open={modalState !== null}
        title={
          modalState?.kind === 'confirm-delete'
            ? 'Delete File'
            : modalState?.kind === 'confirm-normalize'
              ? 'Normalize Library'
              : modalState?.kind === 'result'
                ? modalState.title
                : ''
        }
        onClose={() => {
          if (normalizing) return;
          setModalState(null);
        }}
        actions={
          modalState?.kind === 'confirm-delete' ? (
            <>
              <button className="btn-secondary" onClick={() => setModalState(null)}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={async () => {
                  const filename = modalState.filename;
                  setModalState(null);
                  await confirmDelete(filename);
                }}
              >
                Delete
              </button>
            </>
          ) : modalState?.kind === 'confirm-normalize' ? (
            <>
              <button className="btn-secondary" onClick={() => setModalState(null)} disabled={normalizing}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  await confirmNormalizeAll();
                }}
                disabled={normalizing}
              >
                {normalizing ? 'Normalizing...' : 'Run Normalize'}
              </button>
            </>
          ) : (
            <button className="btn-primary" onClick={() => setModalState(null)}>
              Close
            </button>
          )
        }
      >
        {modalState?.kind === 'confirm-delete' && (
          <p>Delete "{modalState.filename}" from your library?</p>
        )}
        {modalState?.kind === 'confirm-normalize' && (
          <p>
            Normalize all tracks using the backend default target. Only tracks above the target will be reduced.
          </p>
        )}
        {modalState?.kind === 'result' && (
          <pre className="modal-result-text">{modalState.message}</pre>
        )}
      </AppModal>
    </div>
  );
}
