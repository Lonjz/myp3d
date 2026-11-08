import { useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DiscAlbum, FileAudio, MicVocal, Music, Pause, Play, Save } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { MP3Info } from '../api/mp3Api';
import { CoverCropModal } from '../components/cover/CoverCropModal';
import { CoverEditButton } from '../components/cover/CoverEditButton';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';
import { useToast } from '../components/messages/toastContext';
import { InfiniteSidebarList } from '../components/sidebar/InfiniteSidebarList';
import { usePlayer } from '../components/player/playerContext';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState, LoadFailed } from '../components/ui/EmptyState';
import { useDetail } from '../hooks/useDetail';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { emitAppEvent, subscribeAppEvent } from '../utils/appEvents';
import { fetchMp3Info } from '../utils/detailCache';
import { normalizeFilenameInput, stripMp3Extension } from '../utils/filenames';
import { errorMessage } from '../utils/formatters';
import { DiscardChangesDialog } from '../components/ui/DiscardChangesDialog';
import { useSaveShortcut } from '../hooks/useSaveShortcut';

interface EditPageProps {
  filename: string;
  onBack: () => void;
}

const getTrackKey = (song: MP3Info) => song.filename;

export function EditPage({ filename, onBack }: EditPageProps) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError, clearToast } = useToast();

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [newFilename, setNewFilename] = useState('');
  const backTimerRef = useRef<number | undefined>(undefined);
  const [, refreshCoverPreview] = useReducer((count: number) => count + 1, 0);

  const {
    cropModalProps,
    coverFile,
    coverPreview,
    handleCoverChange,
    resetCoverState,
  } = useCoverImageCrop({
    onError: showError,
    onClearError: clearToast,
    outputFilename: 'cover.jpg',
  });

  const applyMp3Info = (info: MP3Info) => {
    resetCoverState();
    setTitle(info.title || '');
    setArtist(info.artist || '');
    setAlbum(info.album || '');
    setNewFilename(stripMp3Extension(info.filename));
  };

  const { detail: mp3, current, missing, failed, reload } = useDetail(filename, fetchMp3Info, applyMp3Info, (err) =>
    showError(errorMessage(err, 'Failed to load MP3 info')),
  );

  useEffect(() => subscribeAppEvent('library-changed', refreshCoverPreview), []);
  useEffect(() => () => window.clearTimeout(backTimerRef.current), []);

  const isDirty =
    mp3 !== null &&
    (title !== (mp3.title || '') ||
      artist !== (mp3.artist || '') ||
      album !== (mp3.album || '') ||
      newFilename !== stripMp3Extension(mp3.filename) ||
      coverFile !== null);

  const { blocker, allowNavigation } = useUnsavedChangesGuard(isDirty);
  useSaveShortcut(() => void handleSave(), !(saving || !current || !isDirty));
  const player = usePlayer();

  const handleSave = async () => {
    if (!mp3 || !current) return;
    setSaving(true);
    clearToast();

    try {
      const result = await mp3Api.updateMetadata(filename, {
        title,
        artist,
        album,
        new_filename: newFilename.trim() && newFilename !== stripMp3Extension(filename) ? `${newFilename.trim()}.mp3` : undefined,
      });

      if (coverFile) {
        await mp3Api.updateCover(result.filename, coverFile);
      }

      showSuccess('Saved successfully!');

      player.trackUpdated(filename, {
        ...mp3,
        filename: result.filename,
        title: title || null,
        artist: artist || null,
        album: album || null,
      });
      emitAppEvent('library-changed');
      if (result.filename === filename) {
        await reload();
      } else {
        allowNavigation();
        backTimerRef.current = window.setTimeout(onBack, 1000);
      }
    } catch (err) {
      showError(errorMessage(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  if (missing) return <div className="page"><EmptyState icon={Music} label="Track not found" /></div>;
  if (failed) return <div className="page"><LoadFailed label="Couldn't load the song" onRetry={() => void reload()} /></div>;
  if (!mp3) return <div className="page"><Spinner /></div>;

  const existingCoverPreview = mp3.has_cover ? mp3Api.getCoverUrl(mp3.filename, 'full') : null;
  const effectiveCoverPreview = coverPreview || existingCoverPreview;
  const isPlayingThis = player.isCurrent(mp3.filename) && player.state.isPlaying;

  return (
    <div className="page">
      <div className="details-layout">
        <InfiniteSidebarList<MP3Info>
          backLabel="Back to library"
          onBack={onBack}
          activeKey={filename}
          getItemKey={getTrackKey}
          getItemTitle={(song) => song.title || song.filename}
          getItemSubtitle={(song) => song.artist || 'Unknown Artist'}
          onSelect={(song) => navigate(`/details/${encodeURIComponent(song.filename)}`)}
          fetchPage={mp3Api.listAllPaged}
          pinnedItem={mp3}
        />

        <section className="details-main">

          <div className="edit-container glass">
            <CoverEditButton
              label="Change cover"
              src={effectiveCoverPreview}
              placeholder={<div className="no-cover-large"><Music aria-hidden="true" /></div>}
              onFileChange={handleCoverChange}
            />

            <div className="metadata-section">
              <IconField
                icon={FileAudio}
                label="File name"
                value={newFilename}
                onChange={(e) => setNewFilename(normalizeFilenameInput(e.target.value))}
                disabled={saving || !current}
              />
              <IconField
                icon={Music}
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={saving || !current}
              />
              <IconField
                icon={MicVocal}
                label="Artist"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                disabled={saving || !current}
              />
              <IconField
                icon={DiscAlbum}
                label="Album"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                disabled={saving || !current}
              />

              <div className="metadata-actions">
                <IconButton
                  icon={isPlayingThis ? Pause : Play}
                  label={isPlayingThis ? 'Pause' : 'Play'}
                  onClick={() => (player.isCurrent(mp3.filename) ? player.togglePlay() : player.playTracks([mp3], 0))}
                />
                <IconButton
                  icon={Save}
                  label="Save"
                  variant="primary"
                  onClick={() => void handleSave()}
                  busy={saving}
                  disabled={saving || !current || !isDirty}
                />
              </div>
            </div>
          </div>

        </section>
      </div>

      <DiscardChangesDialog blocker={blocker} />

      <CoverCropModal {...cropModalProps} />
    </div>
  );
}
