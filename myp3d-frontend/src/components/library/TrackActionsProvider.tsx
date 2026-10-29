import { useCallback, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ListEnd, ListPlus, ListStart, Pencil, Play, Star, StarOff, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { mp3Api } from '../../api/mp3Api';
import type { MP3Info } from '../../api/mp3Api';
import { usePresence } from '../../hooks/usePresence';
import { emitAppEvent } from '../../utils/appEvents';
import { useFavorites } from '../favorites/useFavorites';
import { useToast } from '../messages/toastContext';
import { usePlayer } from '../player/playerContext';
import { AddToPlaylistDialog } from '../playlists/AddToPlaylistDialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ContextMenu } from '../ui/ContextMenu';
import type { MenuAction } from '../ui/ContextMenu';
import { TrackActionsContext } from './trackActionsContext';
import type { TrackActionOptions, TrackActionsContextValue } from './trackActionsContext';

interface OpenMenu {
  id: number;
  x: number;
  y: number;
  track: MP3Info;
  actions: MenuAction[];
}

interface PendingDelete {
  filenames: string[];
  onDeleted?: (filenames: string[]) => void;
}

const trackCount = (count: number) => `${count} track${count === 1 ? '' : 's'}`;

const downloadFile = (filename: string) => {
  const link = document.createElement('a');
  link.href = mp3Api.getFileUrl(filename);
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export function TrackActionsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { playNext, enqueue } = usePlayer();
  const { showSuccess, showError } = useToast();
  const { favorites, toggle: toggleFavorite } = useFavorites();
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const menuCountRef = useRef(0);
  const [playlistFilenames, setPlaylistFilenames] = useState<string[]>([]);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const playlistPresence = usePresence(playlistOpen);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);

  const closeMenu = useCallback(() => setMenu(null), []);

  const addToPlaylist = useCallback((filenames: string[]) => {
    setPlaylistFilenames(filenames);
    setPlaylistOpen(true);
  }, []);

  const requestDelete = useCallback((filenames: string[], onDeleted?: (filenames: string[]) => void) => {
    if (filenames.length > 0) setPendingDelete({ filenames, onDeleted });
  }, []);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { filenames, onDeleted } = pendingDelete;
    setPendingDelete(null);
    setDeleting(true);
    try {
      const result = await mp3Api.bulkDelete(filenames);
      onDeleted?.(result.updated);
      emitAppEvent('library-changed');
      if (result.failed.length === 0) {
        showSuccess(`Deleted ${trackCount(result.updated.length)}`);
      } else if (filenames.length === 1) {
        showError(`Couldn't delete: ${result.failed[0].detail}`);
      } else {
        showError(`${result.failed.length} of ${trackCount(filenames.length)} couldn't be deleted`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const trackActions = useCallback(
    (track: MP3Info, { play, extra = [], onDeleted }: TrackActionOptions): MenuAction[] => {
      const favorite = favorites.has(track.filename);
      return [
        { id: 'play', label: 'Play', icon: Play, run: play },
        { id: 'play-next', label: 'Play next', icon: ListStart, run: () => playNext(track) },
        { id: 'enqueue', label: 'Add to queue', icon: ListEnd, run: () => enqueue([track]) },
        { id: 'add-to-playlist', label: 'Add to playlist', icon: ListPlus, run: () => addToPlaylist([track.filename]) },
        {
          id: 'favorite',
          label: favorite ? 'Unfavourite' : 'Favourite',
          icon: favorite ? StarOff : Star,
          run: () => void toggleFavorite(track.filename),
        },
        { id: 'edit', label: 'Edit', icon: Pencil, run: () => navigate(`/details/${encodeURIComponent(track.filename)}`) },
        { id: 'download', label: 'Download', icon: Download, run: () => downloadFile(track.filename) },
        ...extra,
        { id: 'delete', label: 'Delete', icon: Trash2, danger: true, run: () => requestDelete([track.filename], onDeleted) },
      ];
    },
    [favorites, playNext, enqueue, addToPlaylist, toggleFavorite, navigate, requestDelete],
  );

  const openMenu = useCallback(
    (event: MouseEvent<HTMLElement>, track: MP3Info, options: TrackActionOptions) => {
      event.preventDefault();
      const fromKeyboard = event.clientX === 0 && event.clientY === 0;
      const rect = event.currentTarget.getBoundingClientRect();
      menuCountRef.current += 1;
      setMenu({
        id: menuCountRef.current,
        x: fromKeyboard ? rect.left + rect.width / 3 : event.clientX,
        y: fromKeyboard ? rect.bottom : event.clientY,
        track,
        actions: trackActions(track, options),
      });
    },
    [trackActions],
  );

  const value = useMemo<TrackActionsContextValue>(
    () => ({
      favorites,
      toggleFavorite,
      deleting,
      requestDelete,
      trackActions,
      openMenu,
      menuFilename: menu?.track.filename ?? null,
    }),
    [favorites, toggleFavorite, deleting, requestDelete, trackActions, openMenu, menu],
  );

  const deleteTargets = pendingDelete?.filenames ?? [];

  return (
    <TrackActionsContext.Provider value={value}>
      {children}

      {menu && (
        <ContextMenu
          key={menu.id}
          x={menu.x}
          y={menu.y}
          label={menu.track.title || menu.track.filename}
          actions={menu.actions}
          onClose={closeMenu}
        />
      )}

      {playlistPresence.mounted && (
        <AddToPlaylistDialog
          filenames={playlistFilenames}
          closing={playlistPresence.closing}
          onClose={() => setPlaylistOpen(false)}
          onAdded={() => setPlaylistOpen(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        icon={TriangleAlert}
        title={deleteTargets.length === 1 ? `Delete "${deleteTargets[0]}"?` : `Delete ${trackCount(deleteTargets.length)}?`}
        cancelLabel="Keep"
        cancelIcon={Undo2}
        confirmLabel="Delete"
        confirmIcon={Trash2}
        tone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </TrackActionsContext.Provider>
  );
}
