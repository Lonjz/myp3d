import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Link, MonitorPlay } from 'lucide-react';
import type { SpotifyCandidate } from '../../api/spotifyApi';
import { formatDuration } from '../../utils/formatters';
import { isYouTubeUrl } from '../../utils/youtube';
import { IconField } from '../ui/IconField';
import { ExplicitBadge, MatchDot } from './matchBadges';

const PICKER_WIDTH = 420;
const VIEWPORT_GAP = 12;

interface MatchPickerProps {
  anchorRef: RefObject<HTMLElement | null>;
  candidates: SpotifyCandidate[];
  choice: SpotifyCandidate | null;
  onChoose: (candidate: SpotifyCandidate) => void;
  onChooseUrl: (url: string) => void;
  onClose: () => void;
}

export function MatchPicker({ anchorRef, candidates, choice, onChoose, onChooseUrl, onClose }: MatchPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState('');
  const urlValid = isYouTubeUrl(url);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(PICKER_WIDTH, window.innerWidth - 2 * VIEWPORT_GAP);
    const left = Math.min(Math.max(VIEWPORT_GAP, rect.right - width), window.innerWidth - width - VIEWPORT_GAP);
    const height = panel.offsetHeight;
    const below = rect.bottom + 6;
    const top = below + height > window.innerHeight - VIEWPORT_GAP ? Math.max(VIEWPORT_GAP, rect.top - height - 6) : below;
    Object.assign(panel.style, { top: `${top}px`, left: `${left}px`, width: `${width}px`, visibility: 'visible' });
  }, [anchorRef]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchorRef, onClose]);

  const submitUrl = () => {
    if (!urlValid) return;
    onChooseUrl(url.trim());
    onClose();
  };

  return createPortal(
    <div ref={panelRef} className="match-picker glass" role="dialog" aria-label="Choose a YouTube match">
      {candidates.length > 0 ? (
        <ul className="match-picker__list">
          {candidates.map((candidate) => {
            const active = candidate.video_id === choice?.video_id;
            const sub = [candidate.artists.join(', '), candidate.duration ? formatDuration(candidate.duration) : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={candidate.video_id} className="match-picker__row">
                <button
                  type="button"
                  className={`match-picker__option ${active ? 'is-active' : ''}`.trim()}
                  aria-pressed={active}
                  onClick={() => {
                    onChoose(candidate);
                    onClose();
                  }}
                >
                  <span className="match-thumb" aria-hidden="true">
                    {candidate.thumbnail_url ? <img src={candidate.thumbnail_url} alt="" loading="lazy" /> : <MonitorPlay />}
                  </span>
                  <span className="music-row__text">
                    <span className="music-row__title" title={candidate.title}>{candidate.title}</span>
                    <span className="music-row__sub" title={sub}>{sub}</span>
                  </span>
                  {candidate.explicit && <ExplicitBadge />}
                  <MatchDot score={candidate.score} />
                </button>
                <a
                  className="icon-btn icon-btn--ghost icon-btn--sm"
                  href={candidate.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open on YouTube"
                  title="Open on YouTube"
                >
                  <ExternalLink aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
      <IconField
        icon={Link}
        label="YouTube URL"
        className={url && !urlValid ? 'is-invalid' : undefined}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submitUrl();
          }
        }}
        aria-invalid={Boolean(url) && !urlValid}
        spellCheck={false}
      />
    </div>,
    document.body,
  );
}
