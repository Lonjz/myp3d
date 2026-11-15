import { useState } from 'react';
import { ArrowRight, Download, ListPlus, Search } from 'lucide-react';
import type { DownloadRequest, YouTubeSearchResult } from '../api/mp3Api';
import { CoverCropModal } from '../components/cover/CoverCropModal';
import { DownloadConfigSection } from '../components/download/DownloadConfigSection';
import { QueryResults } from '../components/download/QueryResults';
import { TrimRangeSection } from '../components/download/TrimRangeSection';
import { useQueryResults } from '../components/download/useQueryResults';
import { YouTubePreview } from '../components/download/YouTubePreview';
import { useToast } from '../components/messages/toastContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { Spinner } from '../components/ui/Spinner';
import { useConsumeSearchParams } from '../hooks/useConsumeSearchParams';
import { useDownloadForm } from '../hooks/useDownloadForm';
import { useTrimPreview } from '../hooks/useTrimPreview';
import { getVideoIdFromUrl, isYouTubePlaylistUrl } from '../utils/youtube';

export function QueryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const list = useQueryResults();

  const [selectedResult, setSelectedResult] = useState<YouTubeSearchResult | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState('');

  const trim = useTrimPreview({ kind: 'youtube', videoId: selectedVideoId });

  const { showError, clearToast } = useToast();

  const {
    url,
    setUrl,
    customFilename,
    setCustomFilename,
    filenameStatus,
    title,
    setTitle,
    artist,
    setArtist,
    album,
    setAlbum,
    loading: downloading,
    submitting,
    coverPreview,
    applyCoverUrl,
    handleCoverFileSelect,
    handleRemoveCover,
    cropModalProps,
    overwriteDialogProps,
    submitDownload,
    queueDownload,
  } = useDownloadForm({
    onSubmitted: () => {
      trim.reset(null);
      setSelectedResult(null);
      setSelectedVideoId('');
    },
  });

  const applySelectedResult = (result: YouTubeSearchResult) => {
    const fallbackVideoId = getVideoIdFromUrl(result.url);
    const nextDuration = result.duration ?? null;

    setSelectedResult(result);
    setSelectedVideoId(result.video_id || fallbackVideoId);
    setUrl(result.url);
    setTitle(result.title || '');
    setArtist(result.artist || '');
    setAlbum(result.album || '');
    setCustomFilename(result.filename || '');
    applyCoverUrl(result.cover_url);
    trim.reset(nextDuration);

    clearToast();
  };

  const runSearch = async (query: string) => {
    const normalized = query.trim();
    if (!normalized) {
      showError('Please enter a search query');
      return;
    }
    if (isYouTubePlaylistUrl(normalized)) {
      await list.openPlaylist(normalized);
      return;
    }

    const results = await list.search(normalized);
    if (results?.length === 0) {
      setSelectedResult(null);
      setSelectedVideoId('');
      trim.reset(null);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(searchQuery);
  };

  const applyUrl = (nextUrl: string) => {
    setUrl(nextUrl);
    const nextVideoId = getVideoIdFromUrl(nextUrl);
    setSelectedVideoId(nextVideoId);
    if (!nextVideoId || nextVideoId !== selectedResult?.video_id) {
      setSelectedResult(null);
      trim.reset(null);
    }
  };

  useConsumeSearchParams((params) => {
    const incomingArtist = params.get('artist');
    const incomingSimilar = params.get('similar');
    if (incomingArtist) {
      void list.openArtist(incomingArtist);
      return true;
    }
    if (incomingSimilar) {
      void list.openSimilar(incomingSimilar);
      return true;
    }

    const incomingUrl = params.get('url');
    const incomingQuery = params.get('q') ?? params.get('playlist');
    if (!incomingUrl && !incomingQuery) return false;

    if (incomingUrl) {
      applyUrl(incomingUrl);
    }
    if (incomingQuery) {
      setSearchQuery(incomingQuery);
      void runSearch(incomingQuery);
    }
    return true;
  });

  const prepareSubmit = (): Partial<DownloadRequest> | null => {
    if (!url.trim()) {
      showError('Please select a YouTube video or enter a URL');
      return null;
    }
    if (trim.hasDuration && !trim.hasTrimRange) {
      showError('Trim end must be after start');
      return null;
    }

    trim.pause();

    return {
      start_time: trim.shouldTrim ? trim.start : undefined,
      end_time: trim.shouldTrim ? trim.end : undefined,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const extra = prepareSubmit();
    if (extra) await submitDownload(extra);
  };

  const handleQueue = async () => {
    const extra = prepareSubmit();
    if (extra) await queueDownload(extra);
  };

  return (
    <div className="page page--fill">
      <div className="query-layout">
        <aside className="query-sidebar glass">
          <form onSubmit={handleSearch} className="query-search-form">
            <IconField
              icon={Search}
              label="Search songs or paste a playlist"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={list.loading}
            />
            {list.loading ? (
              <span className="query-search-spinner"><Spinner inline /></span>
            ) : (
              <IconButton icon={ArrowRight} label="Search" variant="primary" type="submit" />
            )}
          </form>

          <QueryResults list={list} activeKey={selectedResult?.video_id ?? null} onPick={applySelectedResult} />
        </aside>

        <section className="query-main">
          <div className="query-preview-card glass">
            <YouTubePreview
              videoId={selectedVideoId}
              thumbnailUrl={selectedResult?.thumbnail_url}
              containerRef={trim.containerRef}
              isPlaying={trim.isPlaying}
              previewError={trim.previewError}
            />
          </div>

          <form onSubmit={handleSubmit} className="download-form glass">
            <DownloadConfigSection
              url={url}
              onUrlChange={applyUrl}
              customFilename={customFilename}
              onCustomFilenameChange={setCustomFilename}
              filenameStatus={filenameStatus}
              title={title}
              onTitleChange={setTitle}
              artist={artist}
              onArtistChange={setArtist}
              album={album}
              onAlbumChange={setAlbum}
              coverPreview={coverPreview}
              onCoverSelect={handleCoverFileSelect}
              onCoverClear={handleRemoveCover}
              disabled={downloading}
              action={(
                <>
                  <IconButton
                    type="submit"
                    icon={Download}
                    label="Download"
                    variant="primary"
                    busy={submitting === 'download'}
                    disabled={downloading}
                  />
                  <IconButton
                    icon={ListPlus}
                    label="Add to queue"
                    onClick={() => void handleQueue()}
                    disabled={downloading}
                  />
                </>
              )}
            />

            <TrimRangeSection
              {...trim.trimRangeProps}
              disabled={downloading}
              canPlay={trim.trimRangeProps.canPlay && !downloading}
            />
          </form>
        </section>
      </div>

      <CoverCropModal {...cropModalProps} />
      <ConfirmDialog {...overwriteDialogProps} />
    </div>
  );
}
