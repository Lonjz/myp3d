import { useState } from 'react';
import { ListMusic, ListPlus, Plus } from 'lucide-react';
import { playlistApi } from '../../api/playlistApi';
import type { PlaylistInfo } from '../../api/playlistApi';
import { emitAppEvent } from '../../utils/appEvents';
import { useToast } from '../messages/toastContext';
import { IconButton } from '../ui/IconButton';
import { IconField } from '../ui/IconField';
import { Spinner } from '../ui/Spinner';
import { usePlaylists } from './usePlaylists';
import { errorMessage, trackCount } from '../../utils/formatters';
import { Modal } from '../ui/Modal';

interface AddToPlaylistDialogProps {
  filenames: string[];
  closing: boolean;
  onClose: () => void;
  onAdded: () => void;
}

export function AddToPlaylistDialog({ filenames: selectedFilenames, closing, onClose, onAdded }: AddToPlaylistDialogProps) {
  const { showSuccess, showError } = useToast();
  const { playlists, loading } = usePlaylists();
  const [filenames] = useState(selectedFilenames);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      const target = await action();
      emitAppEvent('playlists-changed');
      showSuccess(`Added ${trackCount(filenames.length)} to ${target}`);
      onAdded();
    } catch (err) {
      showError(errorMessage(err, 'Failed to add to playlist'));
      setBusy(false);
    }
  };

  const addTo = (playlist: PlaylistInfo) =>
    run(async () => {
      await playlistApi.addTracks(playlist.id, filenames);
      return playlist.name;
    });

  const createWith = () =>
    run(async () => (await playlistApi.create(newName.trim(), filenames)).name);

  return (
    <Modal
      className="bulk-edit-dialog add-to-playlist"
      closing={closing}
      locked={busy}
      onClose={onClose}
      label={`Add ${trackCount(filenames.length)} to a playlist`}
    >
        <form
          className="add-to-playlist__new"
          onSubmit={(event) => {
            event.preventDefault();
            if (newName.trim()) void createWith();
          }}
        >
          <IconField
            icon={ListPlus}
            label="New playlist"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <IconButton
            icon={Plus}
            label="Create playlist"
            variant="primary"
            type="submit"
            disabled={busy || !newName.trim()}
          />
        </form>

        {loading ? (
          <Spinner inline />
        ) : (
          playlists.length > 0 && (
            <ul className="add-to-playlist__list">
              {playlists.map((playlist) => (
                <li key={playlist.id}>
                  <button
                    type="button"
                    className="add-to-playlist__item"
                    onClick={() => void addTo(playlist)}
                    disabled={busy}
                  >
                    <span className="add-to-playlist__cover">
                      {playlist.has_cover ? (
                        <img src={playlistApi.coverUrl(playlist, 'thumb')} alt="" loading="lazy" />
                      ) : (
                        <ListMusic aria-hidden="true" />
                      )}
                    </span>
                    <span className="add-to-playlist__name">{playlist.name}</span>
                    <span className="add-to-playlist__count" title="Tracks">{playlist.track_count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
    </Modal>
  );
}
