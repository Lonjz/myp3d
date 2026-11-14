import type { CSSProperties } from 'react';
import { ArrowLeft, CircleAlert, CircleCheck, DiscAlbum, Library, ListMusic, ListPlus, MicVocal, MonitorPlay, Music, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { YouTubeRelease, YouTubeSearchResult } from '../../api/mp3Api';
import { countOf, cx, formatDuration, formatTrackSubtitle } from '../../utils/formatters';
import { selectionCycle } from '../../utils/selectionCycle';
import { ExplicitBadge } from '../spotify/matchBadges';
import { Checkbox } from '../ui/Checkbox';
import { LoadFailed } from '../ui/EmptyState';
import { CountButton, IconButton } from '../ui/IconButton';
import { SegmentedControl } from '../ui/SegmentedControl';
import { resultKey } from './useQueryResults';
import type { ArtistTab, QuerySource, useQueryResults } from './useQueryResults';

type QueryResultsList = ReturnType<typeof useQueryResults>;

interface QueryResultsProps {
  list: QueryResultsList;
  activeKey: string | null;
  onPick: (result: YouTubeSearchResult) => void;
}

const ARTIST_TABS = [
  { value: 'songs', label: 'Songs', icon: Music },
  { value: 'releases', label: 'Albums and singles', icon: DiscAlbum },
] as const;

const RELEASE_KINDS = { album: 'Album', single: 'Single', ep: 'EP' } as const;

function describeSource(source: QuerySource | null): { icon: LucideIcon; title: string; hint: string; unavailable: number } | null {
  switch (source?.kind) {
    case 'playlist':
      return { icon: ListMusic, title: source.title, hint: source.title, unavailable: source.unavailable };
    case 'album':
      return { icon: DiscAlbum, title: source.title, hint: source.title, unavailable: source.unavailable };
    case 'artist':
      return { icon: MicVocal, title: source.artist.name, hint: source.artist.name, unavailable: 0 };
    case 'similar':
      return { icon: Sparkles, title: source.title, hint: `Similar to ${source.title}`, unavailable: 0 };
    default:
      return null;
  }
}

function SourceLabel({ list }: { list: QueryResultsList }) {
  const { source, backToArtist } = list;
  const described = describeSource(source);
  if (!described) return <span className="query-results-source" />;
  const { icon: Icon, title, hint, unavailable } = described;
  const skipped = `${countOf(unavailable, 'unavailable song')} skipped`;
  return (
    <span className="query-results-source" title={hint}>
      {source?.kind === 'album' && source.from ? (
        <IconButton icon={ArrowLeft} label={`Back to ${source.from.name}`} variant="ghost" size="sm" onClick={backToArtist} />
      ) : (
        <Icon aria-hidden="true" />
      )}
      <span className="query-results-source__title">{title}</span>
      {unavailable > 0 && (
        <span className="query-results-source__alert" title={skipped} aria-label={skipped}>
          <CircleAlert aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

function ReleaseRows({ releases, onOpen }: { releases: YouTubeRelease[]; onOpen: (browseId: string) => void }) {
  return (
    <div className="query-results-list">
      {releases.map((release, index) => {
        const subtitle = [RELEASE_KINDS[release.kind], release.year].filter(Boolean).join(' · ');
        return (
          <div key={release.browse_id} className="query-result-row" style={{ '--row': index } as CSSProperties}>
            <button type="button" className="query-result-item" onClick={() => onOpen(release.browse_id)}>
              <div className="query-result-thumb-wrap is-square">
                {release.thumbnail_url ? (
                  <img className="query-result-thumb" src={release.thumbnail_url} alt="" loading="lazy" />
                ) : (
                  <div className="query-result-thumb query-result-thumb-placeholder"><DiscAlbum aria-hidden="true" /></div>
                )}
              </div>
              <div className="query-result-text">
                <span className="query-result-title">{release.title}</span>
                <span className="query-result-subtitle">{subtitle}</span>
                {release.in_library && (
                  <span className="query-result-meta">
                    <span className="query-result-flag" title="Album in library" aria-label="Album in library">
                      <Library aria-hidden="true" />
                    </span>
                  </span>
                )}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SongRows({ list, activeKey, onPick }: QueryResultsProps) {
  const { results, selected, queued, setRowSelected } = list;
  return (
    <div className="query-results-list">
      {results.map((result, index) => {
        const key = resultKey(result);
        const isQueued = queued.has(key);
        const subtitle = formatTrackSubtitle(result.artist, result.album) || 'Unknown Artist';
        return (
          <div key={key} className={cx('query-result-row', isQueued && 'is-queued')} style={{ '--row': index } as CSSProperties}>
            <Checkbox
              label={`Queue ${result.title}`}
              checked={selected.has(key)}
              onChange={(event) => setRowSelected(key, event.target.checked)}
              disabled={isQueued}
            />
            <button
              type="button"
              className={cx('query-result-item', activeKey === result.video_id && 'is-active')}
              onClick={() => onPick(result)}
            >
              <div className={cx('query-result-thumb-wrap', result.kind === 'song' && 'is-square')}>
                {result.thumbnail_url ? (
                  <img className="query-result-thumb" src={result.thumbnail_url} alt="" loading="lazy" />
                ) : (
                  <div className="query-result-thumb query-result-thumb-placeholder"><MonitorPlay aria-hidden="true" /></div>
                )}
              </div>
              <div className="query-result-text">
                <span className="query-result-title">{result.title}</span>
                <span className="query-result-subtitle" title={subtitle}>{subtitle}</span>
                <span className="query-result-meta">
                  {result.duration ? <span className="query-result-duration">{formatDuration(result.duration)}</span> : null}
                  {result.explicit && <ExplicitBadge />}
                  {result.in_library && (
                    <span className="query-result-flag" title="Already in library" aria-label="Already in library">
                      <Library aria-hidden="true" />
                    </span>
                  )}
                  {isQueued && (
                    <span className="query-result-flag is-queued" title="Queued" aria-label="Queued">
                      <CircleCheck aria-hidden="true" />
                    </span>
                  )}
                </span>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function QueryResults({ list, activeKey, onPick }: QueryResultsProps) {
  const { results, source, tab, failure, selected, queued, queueing, setTab, setSelected, queueSelected, openAlbum } = list;
  const selectable = results.filter((result) => !queued.has(resultKey(result)));
  const cycle = selectionCycle(
    selectable,
    (result) => !result.in_library,
    (result) => selected.has(resultKey(result)),
  );
  const artist = source?.kind === 'artist' ? source.artist : null;

  if (failure) return <LoadFailed label={failure.label} onRetry={failure.retry} compact />;
  if (results.length === 0 && !artist?.releases.length) return null;

  const showReleases = artist !== null && tab === 'releases';

  return (
    <>
      <div className="query-results-header">
        <Checkbox
          label={cycle.label}
          checked={cycle.allSelected}
          indeterminate={cycle.selectedCount > 0 && !cycle.allSelected}
          onChange={() => setSelected(new Set(cycle.next.map(resultKey)))}
          disabled={selectable.length === 0}
        />
        <SourceLabel list={list} />
        {artist && <SegmentedControl<ArtistTab> label="Show" options={ARTIST_TABS} value={tab} onChange={setTab} small />}
        <CountButton
          icon={ListPlus}
          count={cycle.selectedCount}
          busy={queueing}
          onClick={() => void queueSelected()}
          disabled={queueing || cycle.selectedCount === 0}
          title="Add to queue"
          label={`Add ${countOf(cycle.selectedCount, 'song')} to the queue`}
        />
      </div>

      {showReleases ? (
        <ReleaseRows releases={artist.releases} onOpen={(browseId) => void openAlbum(browseId)} />
      ) : (
        <SongRows list={list} activeKey={activeKey} onPick={onPick} />
      )}
    </>
  );
}
