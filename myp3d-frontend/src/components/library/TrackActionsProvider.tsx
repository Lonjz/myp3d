import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  Library,
  ListEnd,
  ListPlus,
  ListStart,
  Music,
  Pencil,
  Play,
  Shuffle,
  Star,
  StarOff,
  Trash2,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import { mp3Api } from '../../api/mp3Api';
import type { AlbumInfo, MP3Info } from '../../api/mp3Api';
import { playlistApi } from '../../api/playlistApi';
import type { PlaylistInfo } from '../../api/playlistApi';
import { usePresence } from '../../hooks/usePresence';
import { emitAppEvent } from '../../utils/appEvents';
import { useFavorites } from '../favorites/useFavorites';
import { useToast } from '../messages/toastContext';
import { usePlayer } from '../player/playerContext';
import { AddToPlaylistDialog } from '../playlists/AddToPlaylistDialog';
import { createLibrarySource } from '../spotlight/sources/librarySource';
import { createPlaylistsSource } from '../spotlight/sources/playlistsSource';
import type { SpotlightCommand } from '../spotlight/spotlightTypes';
import { useSpotlightCommands } from '../spotlight/useSpotlightCommands';
import { useSpotlightSource } from '../spotlight/useSpotlightSource';
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

type PlayMode = 'play' | 'shuffle' | 'queue';

interface SearchActions {
  track: (track: MP3Info) => MenuAction[];
  album: (album: AlbumInfo) => MenuAction[];
  playlist: (playlist: PlaylistInfo) => MenuAction[];
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
  const { playNext, enqueue, playTracks, currentTrack } = usePlayer();
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

  const playLoaded = async (load: () => Promise<MP3Info[]>, mode: PlayMode) => {
    try {
      const tracks = await load();
      if (mode === 'queue') {
        enqueue(tracks);
        return;
      }
      playTracks(tracks, mode === 'shuffle' ? undefined : 0, { shuffle: mode === 'shuffle' });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load tracks');
    }
  };

  const collectionActions = (load: () => Promise<MP3Info[]>): MenuAction[] => [
    { id: 'play', label: 'Play', icon: Play, run: () => void playLoaded(load, 'play') },
    { id: 'shuffle', label: 'Shuffle', icon: Shuffle, run: () => void playLoaded(load, 'shuffle') },
    { id: 'enqueue', label: 'Add to queue', icon: ListEnd, run: () => void playLoaded(load, 'queue') },
  ];

  const searchActions: SearchActions = {
    track: (track) => trackActions(track, { play: () => playTracks([track], 0) }).filter((action) => action.id !== 'edit'),
    album: (album) => collectionActions(async () => (await mp3Api.getAlbum(album.album_key)).tracks),
    playlist: (playlist) => collectionActions(async () => (await playlistApi.get(playlist.id)).tracks),
  };
  const searchActionsRef = useRef(searchActions);

  useEffect(() => {
    searchActionsRef.current = searchActions;
  });

  const librarySource = useMemo(() => createLibrarySource(() => searchActionsRef.current), []);
  const playlistsSource = useMemo(() => createPlaylistsSource(() => searchActionsRef.current.playlist), []);
  useSpotlightSource(librarySource);
  useSpotlightSource(playlistsSource);

  const playLoadedRef = useRef(playLoaded);

  useEffect(() => {
    playLoadedRef.current = playLoaded;
  });

  const commands = useMemo<SpotlightCommand[]>(() => {
    const loadLibrary = () => mp3Api.listAll();
    const loadFavorites = () => mp3Api.listAll({ favoritesOnly: true });
    const playback: SpotlightCommand[] = [
      {
        id: 'play-library',
        title: 'Play library',
        icon: Library,
        keywords: ['all', 'songs', 'music'],
        run: () => playLoadedRef.current(loadLibrary, 'play'),
      },
      {
        id: 'shuffle-library',
        title: 'Shuffle library',
        icon: Shuffle,
        keywords: ['all', 'songs', 'random', 'mix'],
        run: () => playLoadedRef.current(loadLibrary, 'shuffle'),
      },
      {
        id: 'play-favourites',
        title: 'Play favourites',
        icon: Star,
        keywords: ['favorites', 'liked', 'starred'],
        run: () => playLoadedRef.current(loadFavorites, 'play'),
      },
      {
        id: 'shuffle-favourites',
        title: 'Shuffle favourites',
        icon: Shuffle,
        keywords: ['favorites', 'liked', 'starred', 'random', 'mix'],
        run: () => playLoadedRef.current(loadFavorites, 'shuffle'),
      },
    ];
    if (!currentTrack) return playback;

    const { filename } = currentTrack;
    const favorite = favorites.has(filename);
    return [
      ...playback,
      {
        id: 'favorite-current',
        title: favorite ? 'Unfavourite current song' : 'Favourite current song',
        icon: favorite ? StarOff : Star,
        keywords: ['favorite', 'like', 'star', 'now playing'],
        run: () => toggleFavorite(filename),
      },
      {
        id: 'add-current-to-playlist',
        title: 'Add current song to playlist',
        icon: ListPlus,
        keywords: ['now playing', 'collection'],
        run: () => addToPlaylist([filename]),
      },
      {
        id: 'show-current',
        title: 'Show current song',
        icon: Music,
        keywords: ['now playing', 'details', 'edit', 'go to'],
        run: () => navigate(`/details/${encodeURIComponent(filename)}`),
      },
    ];
  }, [currentTrack, favorites, toggleFavorite, addToPlaylist, navigate]);

  useSpotlightCommands('library-playback', commands);

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
