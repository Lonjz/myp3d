import { useState } from 'react';
import {
  AudioWaveform,
  Check,
  CircleAlert,
  DiscAlbum,
  Eraser,
  Folder,
  Image as ImageIcon,
  ImageOff,
  ListMusic,
  MicVocal,
  Music,
  PencilLine,
  Plus,
  RefreshCw,
  ScanSearch,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { BulkResult, MP3Info } from '../api/mp3Api';
import type { MusicChange, MusicPair, MusicTrack } from '../api/musicApi';
import { Cover, DiffColumn, TrackText } from '../components/diff/DiffColumns';
import { AlbumColumns } from '../components/music/AlbumColumns';
import { MusicJobPanel } from '../components/music/MusicJobPanel';
import { PlaylistColumns } from '../components/music/PlaylistColumns';
import { useAlbumHealth } from '../components/music/useAlbumHealth';
import { useMusicSync } from '../components/music/useMusicSync';
import { usePlaylistMusicSync } from '../components/music/usePlaylistMusicSync';
import { Checkbox } from '../components/ui/Checkbox';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { AppleMusicIcon } from '../components/ui/BrandIcons';
import { formatTrackSubtitle } from '../utils/formatters';

type MusicStep = 'songs' | 'playlists' | 'albums';

const CHANGE_ICONS: Record<MusicChange, LucideIcon> = {
  title: Music,
  artist: MicVocal,
  album: DiscAlbum,
  art: ImageIcon,
  audio: AudioWaveform,
  favorite: Star,
  unfavorite: StarOff,
  favorite_music: Star,
  unfavorite_music: StarOff,
};

const hasChanges = (pair: MusicPair) => pair.changes.length > 0;

const trackSortKey = (track: MP3Info) => `${track.artist ?? ''}\u0000${track.title || track.filename}`;

const changeTitle = (change: MusicChange, { track, music }: MusicPair) => {
  if (change === 'title') return `${music.name || '-'} → ${track.title}`;
  if (change === 'artist') return `${music.artist || '-'} → ${track.artist}`;
  if (change === 'album') return `${music.album || '-'} → ${track.album}`;
  if (change === 'audio') return 'Audio from myp3d';
  if (change === 'favorite') return 'Favourite in myp3d';
  if (change === 'unfavorite') return 'Unfavourite in myp3d';
  if (change === 'favorite_music') return 'Favourite in Apple Music';
  if (change === 'unfavorite_music') return 'Unfavourite in Apple Music';
  return 'Cover art';
};

function LocalRow({ track }: { track: MP3Info }) {
  const title = track.title || track.filename;
  return (
    <li className="music-row">
      <Cover src={track.has_cover ? mp3Api.getCoverUrl(track.filename, 'thumb') : undefined} />
      <TrackText title={title} sub={formatTrackSubtitle(track.artist, track.album)} />
      <span className="music-changes">
        <span className="music-change" title="Add to Apple Music" aria-label="Add to Apple Music">
          <Plus aria-hidden="true" />
        </span>
      </span>
    </li>
  );
}

function PairRow({ pair }: { pair: MusicPair }) {
  const { track, changes } = pair;
  const title = track.title || track.filename;
  return (
    <li className="music-row">
      <Cover src={track.has_cover ? mp3Api.getCoverUrl(track.filename, 'thumb') : undefined} />
      <TrackText title={title} sub={formatTrackSubtitle(track.artist, track.album)} />
      {changes.length > 0 && (
        <span className="music-changes">
          {changes.map((change) => {
            const Icon = CHANGE_ICONS[change];
            const label = changeTitle(change, pair);
            return (
              <span key={change} className="music-change" title={label} aria-label={label}>
                <Icon aria-hidden="true" />
              </span>
            );
          })}
        </span>
      )}
    </li>
  );
}

function MusicRow({ track }: { track: MusicTrack }) {
  return (
    <li className="music-row">
      <Cover />
      <TrackText title={track.name || '-'} sub={formatTrackSubtitle(track.artist, track.album)} />
    </li>
  );
}

const failureList = (failures: BulkResult['failed']) => failures.map((item) => `${item.filename}: ${item.detail}`).join('\n');

function FailureChips({ failed, withoutArt }: { failed: BulkResult['failed']; withoutArt: BulkResult['failed'] }) {
  return (
    <>
      {failed.length > 0 && (
        <span className="album-chip" title={failureList(failed)}>
          <CircleAlert aria-hidden="true" />
          {failed.length}
        </span>
      )}
      {withoutArt.length > 0 && (
        <span className="album-chip" title={`No cover art set:\n${failureList(withoutArt)}`}>
          <ImageOff aria-hidden="true" />
          {withoutArt.length}
        </span>
      )}
    </>
  );
}

function MusicEmpty({ scanning }: { scanning: boolean }) {
  return (
    <EmptyState icon={AppleMusicIcon} loading={scanning} />
  );
}

export function MusicPage() {
  const songs = useMusicSync();
  const { available, folder, setFolder } = songs;
  const [step, setStep] = useState<MusicStep>('songs');
  const playlists = usePlaylistMusicSync(folder, available === true && step === 'playlists');
  const albums = useAlbumHealth(available === true && step === 'albums');

  if (available === null) {
    return (
      <div className="page sync-page music-page">
        <EmptyState loading />
      </div>
    );
  }

  if (!available) {
    return (
      <div className="page sync-page music-page">
        <EmptyState icon={AppleMusicIcon} text="macOS only" />
      </div>
    );
  }

  const inBoth = (songs.diff?.both ?? []).filter((pair) => !hasChanges(pair));
  const toSync = [
    ...(songs.diff?.both ?? []).filter(hasChanges),
    ...(songs.diff?.only_in_library ?? []).map((track) => ({ track, music: null, changes: [] })),
  ].sort((a, b) => trackSortKey(a.track).localeCompare(trackSortKey(b.track)));
  const playlistChanges = (playlists.diff?.only_in_music.length ?? 0) + (playlists.diff?.to_sync.length ?? 0);

  const active = step === 'songs' ? songs : playlists;
  const pendingCount = step === 'songs' ? toSync.length : playlistChanges;
  const jobOpen = active.job !== null;
  const anySyncing = songs.job?.status === 'syncing' || playlists.job?.status === 'syncing';
  const folderMissing = !folder.trim();
  const songsPending = songs.diff !== null && toSync.length > 0;
  const songsBlocking = step === 'playlists' && (playlists.diff?.songs_pending ?? 0) > 0;

  const switchStep = (next: MusicStep) => {
    if (next === step) return;
    setStep(next);
    if (next === 'albums') {
      if (albums.albums) void albums.scan();
      return;
    }
    const target = next === 'songs' ? songs : playlists;
    if (target.diff && !target.job) void target.scan();
  };

  const startSync = () => {
    if (step === 'songs') void songs.startSync();
    else void playlists.startSync();
  };

  const renderBody = () => {
    if (step === 'albums') {
      if (!albums.albums) return <EmptyState icon={DiscAlbum} loading={albums.scanning} />;
      return <AlbumColumns albums={albums.albums} selection={albums.selection} busy={albums.busy || albums.scanning} />;
    }

    if (step === 'playlists') {
      if (playlists.job) {
        const { job } = playlists;
        return (
          <MusicJobPanel
            status={job.status}
            error={job.error}
            total={job.total}
            done={job.created + job.updated + job.deleted + job.failed.length}
            failed={job.failed.length}
            busy={playlists.busy}
            onDismiss={() => void playlists.dismiss()}
          >
            <span className="album-chip" title="Added">
              <Plus aria-hidden="true" />
              {job.created}
            </span>
            <span className="album-chip" title="Updated">
              <PencilLine aria-hidden="true" />
              {job.updated}
            </span>
            {job.deleted > 0 && (
              <span className="album-chip" title="Deleted">
                <Trash2 aria-hidden="true" />
                {job.deleted}
              </span>
            )}
            <FailureChips failed={job.failed} withoutArt={job.without_art} />
          </MusicJobPanel>
        );
      }
      if (!playlists.diff) return <MusicEmpty scanning={playlists.scanning} />;
      return (
        <PlaylistColumns diff={playlists.diff} scanning={playlists.scanning} />
      );
    }

    if (songs.job) {
      const { job } = songs;
      return (
        <MusicJobPanel
          status={job.status}
          error={job.error}
          total={job.total}
          done={job.added + job.updated + job.failed.length}
          failed={job.failed.length}
          busy={songs.busy}
          onDismiss={() => void songs.dismiss()}
        >
          <span className="album-chip" title="Added">
            <Plus aria-hidden="true" />
            {job.added}
          </span>
          <span className="album-chip" title="Updated">
            <PencilLine aria-hidden="true" />
            {job.updated}
          </span>
          <FailureChips failed={job.failed} withoutArt={job.without_art} />
        </MusicJobPanel>
      );
    }
    if (!songs.diff) return <MusicEmpty scanning={songs.scanning} />;
    const { diff } = songs;
    return (
      <div className={`music-columns ${songs.scanning ? 'is-scanning' : ''}`.trim()} aria-busy={songs.scanning}>
        <DiffColumn icon={AppleMusicIcon} label="Only in Apple Music" count={diff.only_in_music.length}>
          {diff.only_in_music.map((track) => (
            <MusicRow key={track.persistent_id} track={track} />
          ))}
        </DiffColumn>
        <DiffColumn icon={Check} label="In both" count={inBoth.length}>
          {inBoth.map((pair) => (
            <PairRow key={pair.track.filename} pair={pair} />
          ))}
        </DiffColumn>
        <DiffColumn icon={RefreshCw} label="To sync" count={toSync.length}>
          {toSync.map((entry) =>
            entry.music ? (
              <PairRow key={entry.track.filename} pair={entry} />
            ) : (
              <LocalRow key={entry.track.filename} track={entry.track} />
            ),
          )}
        </DiffColumn>
      </div>
    );
  };

  const syncTools = (
    <>
      <IconField
        icon={Folder}
        label="Apple Music folder"
        className={`music-folder ${folderMissing ? 'is-invalid' : ''}`.trim()}
        value={folder}
        onChange={(e) => setFolder(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void active.scan();
        }}
        aria-invalid={folderMissing}
        disabled={jobOpen}
        spellCheck={false}
      />
      <IconButton
        icon={ScanSearch}
        label="Compare again"
        className="sync-toolbar__push"
        onClick={() => void active.scan()}
        disabled={active.scanning || folderMissing || jobOpen}
      />
      <button
        type="button"
        className="btn-primary music-add"
        onClick={startSync}
        disabled={active.busy || active.scanning || jobOpen || anySyncing || songsBlocking || pendingCount === 0}
        title={songsBlocking ? 'Sync songs first' : 'Sync with Apple Music'}
      >
        <RefreshCw aria-hidden="true" />
        {pendingCount}
      </button>
    </>
  );

  const albumLocked = albums.albums === null || albums.scanning || albums.busy || anySyncing;
  const albumChosen = albums.selection.chosen.length;
  const albumTools = (
    <>
      <span className="health-select-all">
        <Checkbox
          label={albums.selection.allChosen ? 'Deselect all' : 'Select all'}
          checked={albums.selection.allChosen}
          indeterminate={albumChosen > 0 && !albums.selection.allChosen}
          onChange={albums.selection.toggleAll}
          disabled={albums.selection.keys.length === 0 || albumLocked}
        />
      </span>
      <IconButton
        icon={ScanSearch}
        label="Scan again"
        className="sync-toolbar__push"
        onClick={() => void albums.scan()}
        disabled={albums.scanning || albums.busy}
      />
      <button
        type="button"
        className="btn-primary health-fix"
        onClick={() => void albums.fix()}
        disabled={albumChosen === 0 || albumLocked}
        aria-label={`Clear the album artist on ${albumChosen} album${albumChosen === 1 ? '' : 's'}`}
        title={anySyncing ? 'Wait for the sync to finish' : 'Clear album artist'}
      >
        <Eraser aria-hidden="true" />
        {albumChosen}
      </button>
    </>
  );

  return (
    <div className="page page--fill sync-page music-page">
      <div className="sync-toolbar glass">
        <div className="segmented" role="group" aria-label="Sync step">
          <button
            type="button"
            className={`segmented__option ${step === 'songs' ? 'is-active' : ''}`.trim()}
            aria-pressed={step === 'songs'}
            aria-label="Songs"
            title="Songs"
            onClick={() => switchStep('songs')}
            disabled={anySyncing}
          >
            <Music aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`segmented__option ${step === 'playlists' ? 'is-active' : ''}`.trim()}
            aria-pressed={step === 'playlists'}
            aria-label={songsPending ? 'Playlists (songs still to sync)' : 'Playlists'}
            title={songsPending ? 'Playlists (songs still to sync)' : 'Playlists'}
            onClick={() => switchStep('playlists')}
            disabled={anySyncing}
          >
            <ListMusic aria-hidden="true" />
            {songsPending && <span className="segmented__dot" aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={`segmented__option ${step === 'albums' ? 'is-active' : ''}`.trim()}
            aria-pressed={step === 'albums'}
            aria-label="Album artists"
            title="Album artists"
            onClick={() => switchStep('albums')}
            disabled={anySyncing}
          >
            <DiscAlbum aria-hidden="true" />
          </button>
        </div>
        {step === 'albums' ? albumTools : syncTools}
      </div>

      {renderBody()}
    </div>
  );
}
