import { DiscAlbum, MicVocal, Music } from 'lucide-react';
import type { MusicAlbumIssue } from '../../api/musicApi';
import type { Selection } from '../../hooks/useSelection';
import { Cover, DiffColumn, TrackText } from '../diff/DiffColumns';
import { Checkbox } from '../ui/Checkbox';

const stopClick = (event: { stopPropagation: () => void }) => event.stopPropagation();
const songCount = (count: number) => `${count} song${count === 1 ? '' : 's'} with an album artist`;

function AlbumRow({ album, selection }: { album: MusicAlbumIssue; selection: Selection }) {
  const title = album.album || '-';
  const selected = selection.selected.has(album.key);
  const albumArtists = album.album_artists.join(', ');
  return (
    <li
      className={`music-row is-clickable health-row ${selected ? 'is-selected' : ''}`.trim()}
      onClick={() => selection.toggle(album.key)}
    >
      <Checkbox
        label={`Select ${title}`}
        checked={selected}
        onChange={() => selection.toggle(album.key)}
        onClick={stopClick}
      />
      <Cover icon={DiscAlbum} />
      <TrackText title={title} sub={album.artists.join(', ')} />
      <span className="album-chip music-album-artist" title={`Album artist: ${albumArtists}`} aria-label={`Album artist: ${albumArtists}`}>
        <MicVocal aria-hidden="true" />
        <span className="album-chip__text">{albumArtists}</span>
      </span>
      <span className="music-changes">
        <span className="album-chip" title={songCount(album.track_count)} aria-label={songCount(album.track_count)}>
          <Music aria-hidden="true" />
          {album.track_count}
        </span>
      </span>
    </li>
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
    <div className={`health-columns ${busy ? 'is-busy' : ''}`.trim()} aria-busy={busy}>
      <DiffColumn icon={DiscAlbum} label="Album artists" count={albums.length}>
        {albums.map((album) => (
          <AlbumRow key={album.key} album={album} selection={selection} />
        ))}
      </DiffColumn>
    </div>
  );
}
