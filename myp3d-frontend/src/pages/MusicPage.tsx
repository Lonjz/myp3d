import { useState } from 'react';
import type { ReactNode } from 'react';
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
import { BulkFixTools, ChangeBadge, Cover, DiffColumn, TrackText } from '../components/diff/DiffColumns';
import { AlbumColumns } from '../components/music/AlbumColumns';
import { MusicJobPanel } from '../components/music/MusicJobPanel';
import { PlaylistColumns } from '../components/music/PlaylistColumns';
import { useAlbumHealth } from '../components/music/useAlbumHealth';
import { useMusicSync } from '../components/music/useMusicSync';
import { usePlaylistMusicSync } from '../components/music/usePlaylistMusicSync';
import { Chip } from '../components/ui/Chip';
import { EmptyState, LoadFailed } from '../components/ui/EmptyState';
import { CountButton, IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { AppleMusicIcon } from '../components/ui/BrandIcons';
import { countOf, cx, formatTrackSubtitle } from '../utils/formatters';
import { SegmentedControl } from '../components/ui/SegmentedControl';

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

function TrackRow({ track, children }: { track: MP3Info; children: ReactNode }) {
  return (
    <li className="music-row">
      <Cover src={track.has_cover ? mp3Api.getCoverUrl(track.filename, 'thumb') : undefined} />
      <TrackText title={track.title || track.filename} sub={formatTrackSubtitle(track.artist, track.album)} />
      {children}
    </li>
  );
}

function LocalRow({ track }: { track: MP3Info }) {
  return (
    <TrackRow track={track}>
      <span className="music-changes">
        <ChangeBadge icon={Plus} label="Add to Apple Music" />
      </span>
    </TrackRow>
  );
}

function PairRow({ pair }: { pair: MusicPair }) {
  const { track, changes } = pair;
  return (
    <TrackRow track={track}>
      {changes.length > 0 && (
        <span className="music-changes">
          {changes.map((change) => (
            <ChangeBadge key={change} icon={CHANGE_ICONS[change]} label={changeTitle(change, pair)} />
          ))}
        </span>
      )}
    </TrackRow>
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
      {failed.length > 0 && <Chip icon={CircleAlert} title={failureList(failed)}>{failed.length}</Chip>}
      {withoutArt.length > 0 && <Chip icon={ImageOff} title={`No cover art set:\n${failureList(withoutArt)}`}>{withoutArt.length}</Chip>}
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
  const { available, loadFailed, retry, folder, setFolder } = songs;
  const [step, setStep] = useState<MusicStep>('songs');
  const playlists = usePlaylistMusicSync(folder, available === true && step === 'playlists');
  const albums = useAlbumHealth(available === true && step === 'albums');

  if (available === null) {
    return (
      <div className="page sync-page music-page">
        {loadFailed ? <LoadFailed label="Couldn't check Apple Music" onRetry={retry} /> : <EmptyState loading />}
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
            <Chip icon={Plus} title="Added">{job.created}</Chip>
            <Chip icon={PencilLine} title="Updated">{job.updated}</Chip>
            {job.deleted > 0 && <Chip icon={Trash2} title="Deleted">{job.deleted}</Chip>}
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
          <Chip icon={Plus} title="Added">{job.added}</Chip>
          <Chip icon={PencilLine} title="Updated">{job.updated}</Chip>
          <FailureChips failed={job.failed} withoutArt={job.without_art} />
        </MusicJobPanel>
      );
    }
    if (!songs.diff) return <MusicEmpty scanning={songs.scanning} />;
    const { diff } = songs;
    return (
      <div className={cx('music-columns', songs.scanning && 'is-scanning')} aria-busy={songs.scanning}>
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
        className={cx('music-folder', folderMissing && 'is-invalid')}
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
      {step === 'songs' && (
        <IconButton
          icon={ImageOff}
          label="Find missing covers in Apple Music"
          onClick={() => void songs.checkArt()}
          disabled={songs.scanning || folderMissing || jobOpen || anySyncing}
        />
      )}
      <CountButton
        icon={RefreshCw}
        count={pendingCount}
        className="music-add"
        onClick={startSync}
        disabled={active.busy || active.scanning || jobOpen || anySyncing || songsBlocking || pendingCount === 0}
        title={songsBlocking ? 'Sync songs first' : 'Sync with Apple Music'}
        label={songsBlocking ? 'Sync songs first' : `Sync ${pendingCount} with Apple Music`}
      />
    </>
  );

  const albumTools = (
    <BulkFixTools
      selection={albums.selection}
      locked={albums.albums === null || albums.scanning || albums.busy || anySyncing}
      scanDisabled={albums.scanning || albums.busy}
      onScan={() => void albums.scan()}
      fixIcon={Eraser}
      fixLabel={`Clear the album artist on ${countOf(albums.selection.chosen.length, 'album')}`}
      fixTitle={anySyncing ? 'Wait for the sync to finish' : 'Clear album artist'}
      onFix={() => void albums.fix()}
    />
  );

  return (
    <div className="page page--fill sync-page music-page">
      <div className="sync-toolbar glass">
        <SegmentedControl
          label="Sync step"
          options={[
            { value: 'songs', label: 'Songs', icon: Music },
            { value: 'playlists', label: songsPending ? 'Playlists (songs still to sync)' : 'Playlists', icon: ListMusic, dot: songsPending },
            { value: 'albums', label: 'Album artists', icon: DiscAlbum },
          ]}
          value={step}
          onChange={switchStep}
          disabled={anySyncing}
        />
        {step === 'albums' ? albumTools : syncTools}
      </div>

      {renderBody()}
    </div>
  );
}
