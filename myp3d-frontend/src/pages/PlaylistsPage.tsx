import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Search, Star } from 'lucide-react';
import { NEW_PLAYLIST_NAME, playlistApi } from '../api/playlistApi';
import type { PlaylistInfo } from '../api/playlistApi';
import { useToast } from '../components/messages/toastContext';
import { CoverPlayButton } from '../components/player/CoverPlayButton';
import { usePlayer } from '../components/player/playerContext';
import { usePlaylists } from '../components/playlists/usePlaylists';
import { DataTable } from '../components/table/DataTable';
import type { DataTableColumn } from '../components/table/DataTable';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { usePersistentState } from '../hooks/usePersistentState';
import { emitAppEvent } from '../utils/appEvents';
import { formatDate, formatDateTime } from '../utils/formatters';

const getPlaylistKey = (playlist: PlaylistInfo) => playlist.id;

export function PlaylistsPage() {
  const navigate = useNavigate();
  const player = usePlayer();
  const { showError } = useToast();
  const { playlists, loading, error, refresh } = usePlaylists();
  const [searchQuery, setSearchQuery] = usePersistentState('playlists:search', '');
  const [creating, setCreating] = useState(false);

  const visiblePlaylists = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return query ? playlists.filter((playlist) => playlist.name.toLowerCase().includes(query)) : playlists;
  }, [playlists, searchQuery]);

  const openPlaylist = (id: string) => navigate(`/playlists/${encodeURIComponent(id)}`);

  const createPlaylist = async () => {
    setCreating(true);
    try {
      const playlist = await playlistApi.create(NEW_PLAYLIST_NAME);
      emitAppEvent('playlists-changed');
      openPlaylist(playlist.id);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create playlist');
    } finally {
      setCreating(false);
    }
  };

  const playPlaylist = async (id: string) => {
    try {
      const detail = await playlistApi.get(id);
      if (detail.tracks.length > 0) player.playTracks(detail.tracks, 0);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load playlist');
    }
  };

  const columns: DataTableColumn<PlaylistInfo>[] = [
    {
      key: 'cover',
      header: <span className="sr-only">Cover</span>,
      width: '76px',
      render: (playlist) => (
        <div className="library-cover-sm">
          <CoverPlayButton
            src={playlist.has_cover ? playlistApi.coverUrl(playlist, 'thumb') : undefined}
            label={`Play ${playlist.name}`}
            isCurrent={false}
            isPlaying={player.state.isPlaying}
            onPlay={() => void playPlaylist(playlist.id)}
            onToggle={player.togglePlay}
          />
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Playlist',
      render: (playlist) => (
        <span className="playlist-name">
          <span className="table-cell-ellipsis" title={playlist.name}>{playlist.name}</span>
          {playlist.is_favorites && (
            <span className="playlist-name__favorites" title="Favourites" aria-label="Favourites" role="img">
              <Star aria-hidden="true" />
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'tracks',
      header: 'Tracks',
      width: '90px',
      hideBelow: 'sm',
      render: (playlist) => playlist.track_count,
    },
    {
      key: 'updated_at',
      header: 'Updated',
      width: '128px',
      hideBelow: 'sm',
      render: (playlist) => (
        <span className="library-date" title={formatDateTime(playlist.updated_at)}>{formatDate(playlist.updated_at)}</span>
      ),
    },
  ];

  return (
    <div className="page page--fill">
      {error && <p className="error">{error}</p>}

      <DataTable
        fill
        columns={columns}
        items={visiblePlaylists}
        getRowKey={getPlaylistKey}
        onRowOpen={(playlist) => openPlaylist(playlist.id)}
        emptyMessage={searchQuery.trim() ? 'No matches' : 'No playlists yet'}
        loading={loading}
        toolbar={(
          <>
            <IconField
              icon={Search}
              label="Search"
              className="library-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <IconButton icon={Plus} label="New playlist" onClick={() => void createPlaylist()} disabled={creating} />
            <IconButton icon={RefreshCw} label="Refresh" onClick={() => void refresh()} />
            <span className="library-count">{visiblePlaylists.length} / {playlists.length}</span>
          </>
        )}
      />
    </div>
  );
}
