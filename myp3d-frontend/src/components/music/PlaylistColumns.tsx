import { ArrowDown, ArrowUp, Check, CircleMinus, Link, ListMusic, RefreshCw, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MusicPlaylistAction, MusicPlaylistDiff, MusicPlaylistEntry } from '../../api/musicApi';
import { playlistApi } from '../../api/playlistApi';
import { Cover, DiffColumn, TrackText } from '../diff/DiffColumns';
import { AppleMusicIcon } from '../ui/BrandIcons';

const ACTION_BADGES: Record<Exclude<MusicPlaylistAction, 'in_sync'>, { icon: LucideIcon; label: string; danger?: boolean }> = {
  import: { icon: ArrowDown, label: 'Add to myp3d' },
  export: { icon: ArrowUp, label: 'Add to Apple Music' },
  pull: { icon: ArrowDown, label: 'Update in myp3d' },
  push: { icon: ArrowUp, label: 'Update in Apple Music' },
  link: { icon: Link, label: 'Link with the Apple Music playlist of the same name and combine their songs' },
  delete_local: { icon: Trash2, label: 'Delete in myp3d', danger: true },
  delete_music: { icon: Trash2, label: 'Delete in Apple Music', danger: true },
};

const leftOutLabel = (count: number) => `${count} song${count === 1 ? '' : 's'} only on one side`;

function PlaylistRow({ entry }: { entry: MusicPlaylistEntry }) {
  const badge = entry.action === 'in_sync' ? null : ACTION_BADGES[entry.action];
  const cover =
    entry.has_cover && entry.playlist_id && entry.updated_at
      ? playlistApi.coverUrl({ id: entry.playlist_id, updated_at: entry.updated_at }, 'thumb')
      : undefined;

  return (
    <li className="music-row">
      <Cover src={cover} icon={ListMusic} />
      <TrackText title={entry.name} sub="" />
      <span className="music-changes">
        {entry.left_out > 0 && (
          <span className="music-left-out" title={leftOutLabel(entry.left_out)} aria-label={leftOutLabel(entry.left_out)}>
            <CircleMinus aria-hidden="true" />
            {entry.left_out}
          </span>
        )}
        {badge && (
          <span
            className={`music-change ${badge.danger ? 'music-change--danger' : ''}`.trim()}
            title={badge.label}
            aria-label={badge.label}
          >
            <badge.icon aria-hidden="true" />
          </span>
        )}
      </span>
    </li>
  );
}

export function PlaylistColumns({ diff, scanning }: { diff: MusicPlaylistDiff; scanning: boolean }) {
  return (
    <div className={`music-columns ${scanning ? 'is-scanning' : ''}`.trim()} aria-busy={scanning}>
      <DiffColumn icon={AppleMusicIcon} label="Only in Apple Music" count={diff.only_in_music.length}>
        {diff.only_in_music.map((entry) => (
          <PlaylistRow key={entry.key} entry={entry} />
        ))}
      </DiffColumn>
      <DiffColumn icon={Check} label="In sync" count={diff.in_sync.length}>
        {diff.in_sync.map((entry) => (
          <PlaylistRow key={entry.key} entry={entry} />
        ))}
      </DiffColumn>
      <DiffColumn icon={RefreshCw} label="To sync" count={diff.to_sync.length}>
        {diff.to_sync.map((entry) => (
          <PlaylistRow key={entry.key} entry={entry} />
        ))}
      </DiffColumn>
    </div>
  );
}
