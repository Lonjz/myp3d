import { useState } from 'react';
import type { RefObject } from 'react';
import { ExternalLink, Link, MonitorPlay } from 'lucide-react';
import type { SpotifyCandidate } from '../../api/spotifyApi';
import { formatDuration } from '../../utils/formatters';
import { isYouTubeUrl } from '../../utils/youtube';
import { IconField } from '../ui/IconField';
import { Popover } from '../ui/Popover';
import { ExplicitBadge, MatchDot } from './matchBadges';

interface MatchPickerBodyProps {
  candidates: SpotifyCandidate[];
  choice: SpotifyCandidate | null;
  onChoose: (candidate: SpotifyCandidate) => void;
  onChooseUrl: (url: string) => void;
  onClose: () => void;
}

interface MatchPickerProps extends MatchPickerBodyProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
}

export function MatchPicker({ anchorRef, open, onClose, ...body }: MatchPickerProps) {
  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      label="Choose a YouTube match"
      className="match-picker"
      align="end"
    >
      <MatchPickerBody onClose={onClose} {...body} />
    </Popover>
  );
}

function MatchPickerBody({ candidates, choice, onChoose, onChooseUrl, onClose }: MatchPickerBodyProps) {
  const [url, setUrl] = useState('');
  const urlValid = isYouTubeUrl(url);

  const submitUrl = () => {
    if (!urlValid) return;
    onChooseUrl(url.trim());
    onClose();
  };

  return (
    <>
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
    </>
  );
}
