import type { RefObject } from 'react';
import { MonitorPlay } from 'lucide-react';
import { getYouTubeThumbnailUrl } from '../../utils/youtube';

interface YouTubePreviewProps {
  videoId: string;
  thumbnailUrl?: string | null;
  containerRef: RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  previewError: string | null;
}

export function YouTubePreview({ videoId, thumbnailUrl, containerRef, isPlaying, previewError }: YouTubePreviewProps) {
  if (!videoId) {
    return (
      <div className="query-empty-player" aria-label="No preview">
        <MonitorPlay aria-hidden="true" />
      </div>
    );
  }
  if (previewError) return <div className="query-empty-player">{previewError}</div>;
  return (
    <div className="query-player-outer">
      <div className="query-player-wrap" ref={containerRef}></div>
      {!isPlaying && <img className="query-player-thumb-overlay" src={thumbnailUrl || getYouTubeThumbnailUrl(videoId)} alt="" />}
    </div>
  );
}
