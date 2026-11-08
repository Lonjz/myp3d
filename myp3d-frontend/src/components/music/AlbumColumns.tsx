import { DiscAlbum, MicVocal, Music } from 'lucide-react';
import type { MusicAlbumIssue } from '../../api/musicApi';
import type { Selection } from '../../hooks/useSelection';
import { countOf } from '../../utils/formatters';
import { BusyColumn, SelectableRow } from '../diff/DiffColumns';
import { Chip } from '../ui/Chip';

function AlbumRow({ album, selection }: { album: MusicAlbumIssue; selection: Selection }) {
  const albumArtists = `Album artist: ${album.album_artists.join(', ')}`;
  const songs = `${countOf(album.track_count, 'song')} with an album artist`;
  return (
    <SelectableRow rowKey={album.key} selection={selection} title={album.album || '-'} sub={album.artists.join(', ')} coverIcon={DiscAlbum}>
      <Chip icon={MicVocal} className="music-album-artist" title={albumArtists} label={albumArtists}>
        <span className="album-chip__text">{album.album_artists.join(', ')}</span>
      </Chip>
      <span className="music-changes">
        <Chip icon={Music} title={songs} label={songs}>{album.track_count}</Chip>
      </span>
    </SelectableRow>
  );
}

export function AlbumColumns({
  albums,
  selection,
  busy,
}: {
  albums: MusicAlbumIssue[];
  selection: Selection;
  busy: boolean;
}) {
  return (
    <BusyColumn busy={busy} icon={DiscAlbum} label="Album artists" count={albums.length}>
      {albums.map((album) => (
        <AlbumRow key={album.key} album={album} selection={selection} />
      ))}
    </BusyColumn>
  );
}
