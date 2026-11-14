import type { CSSProperties } from 'react';
import { CircleAlert, CircleCheck, Library, ListMusic, ListPlus, MonitorPlay } from 'lucide-react';
import type { YouTubeSearchResult } from '../../api/mp3Api';
import { countOf, cx, formatDuration, formatTrackSubtitle } from '../../utils/formatters';
import { selectionCycle } from '../../utils/selectionCycle';
import { ExplicitBadge } from '../spotify/matchBadges';
import { Checkbox } from '../ui/Checkbox';
import { CountButton } from '../ui/IconButton';
import { resultKey } from './useQueryResults';
import type { useQueryResults } from './useQueryResults';

interface QueryResultsProps {
  list: ReturnType<typeof useQueryResults>;
  activeKey: string | null;
  onPick: (result: YouTubeSearchResult) => void;
}

function SourceLabel({ list }: Pick<QueryResultsProps, 'list'>) {
  const { source } = list;
  if (source?.kind !== 'playlist') return <span className="query-results-source" />;
  const skipped = `${countOf(source.unavailable, 'unavailable song')} skipped`;
  return (
    <span className="query-results-source" title={source.title}>
      <ListMusic aria-hidden="true" />
      <span className="query-results-source__title">{source.title}</span>
      {source.unavailable > 0 && (
        <span className="query-results-source__alert" title={skipped} aria-label={skipped}>
          <CircleAlert aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

export function QueryResults({ list, activeKey, onPick }: QueryResultsProps) {
  const { results, selected, queued, queueing, setSelected, setRowSelected, queueSelected } = list;
  const selectable = results.filter((result) => !queued.has(resultKey(result)));
  const cycle = selectionCycle(
    selectable,
    (result) => !result.in_library,
    (result) => selected.has(resultKey(result)),
  );

  if (results.length === 0) return null;

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
    </>
  );
}
