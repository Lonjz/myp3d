import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import { useSpotlightResults } from './useSpotlightResults';
import type { SpotlightItem, SpotlightSource } from './spotlightTypes';

const CLOSE_DURATION_MS = 160;
const LISTBOX_ID = 'spotlight-listbox';

const optionId = (index: number) => `spotlight-option-${index}`;

interface SpotlightProps {
  open: boolean;
  initialQuery: string;
  sources: SpotlightSource[];
  onClose: () => void;
}

export function Spotlight({ open, initialQuery, sources, onClose }: SpotlightProps) {
  const [previousOpen, setPreviousOpen] = useState(open);
  const [closing, setClosing] = useState(false);
  const [session, setSession] = useState(0);

  if (open !== previousOpen) {
    setPreviousOpen(open);
    setClosing(!open);
    if (open) setSession((value) => value + 1);
  }

  useEffect(() => {
    if (!closing) return undefined;
    const timer = window.setTimeout(() => setClosing(false), CLOSE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  if (!open && !closing) return null;

  return createPortal(
    <SpotlightPanel
      key={session}
      closing={closing}
      initialQuery={initialQuery}
      sources={sources}
      onClose={onClose}
    />,
    document.body,
  );
}

interface SpotlightPanelProps {
  closing: boolean;
  initialQuery: string;
  sources: SpotlightSource[];
  onClose: () => void;
}

function SpotlightPanel({ closing, initialQuery, sources, onClose }: SpotlightPanelProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [activeId, setActiveId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const ranItemRef = useRef(false);

  const { sections, items, loading } = useSpotlightResults(query, sources);
  const foundIndex = items.findIndex((item) => item.id === activeId);
  const activeIndex = foundIndex >= 0 ? foundIndex : 0;
  const activeItem = items[activeIndex] ?? null;
  const hasResults = query.trim().length > 0 && items.length > 0;

  useLayoutEffect(() => {
    const previous = document.activeElement;
    returnFocusRef.current = previous instanceof HTMLElement ? previous : null;
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!closing || ranItemRef.current) return;
    const target = returnFocusRef.current;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, [closing]);

  useEffect(() => {
    listRef.current?.querySelector(`#${optionId(activeIndex)}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, items.length]);

  const updateQuery = (value: string) => {
    setQuery(value);
    setActiveId(null);
  };

  const runItem = (item: SpotlightItem, useSecondary = false) => {
    ranItemRef.current = true;
    onClose();
    const action = useSecondary && item.secondary ? item.secondary.run : item.run;
    action({ navigate, close: onClose, query });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length === 0) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (activeIndex + delta + items.length) % items.length;
      setActiveId(items[nextIndex].id);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeItem) runItem(activeItem, event.shiftKey);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (query) {
        updateQuery('');
      } else {
        onClose();
      }
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
    }
  };

  return (
    <div className="spotlight-layer" data-state={closing ? 'closing' : 'open'}>
      <div className="spotlight-scrim" onMouseDown={onClose} />
      <div className="spotlight glass" role="dialog" aria-modal="true" aria-label="Spotlight">
        <div className="spotlight-bar">
          <Search className="spotlight-bar__icon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="spotlight-input"
            type="text"
            role="combobox"
            aria-label="Search"
            aria-expanded={hasResults}
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={hasResults ? optionId(activeIndex) : undefined}
            placeholder="Search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading ? (
            <span className="spotlight-bar__status">
              <Spinner inline />
            </span>
          ) : query ? (
            <IconButton
              icon={X}
              label="Clear"
              variant="ghost"
              size="sm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => updateQuery('')}
            />
          ) : null}
        </div>

        <div className={hasResults ? 'spotlight-body is-open' : 'spotlight-body'}>
          <div className="spotlight-body__inner">
            <div className="spotlight-results">
              <div ref={listRef} id={LISTBOX_ID} className="spotlight-list" role="listbox" aria-label="Results">
                {sections.map(({ section, items: sectionItems }) => {
                  const SectionIcon = section.icon;
                  const headingId = `spotlight-section-${section.id}`;
                  return (
                    <div key={section.id} className="spotlight-section" role="group" aria-labelledby={headingId}>
                      <div id={headingId} className="spotlight-section__header">
                        <SectionIcon aria-hidden="true" />
                        <span>{section.label}</span>
                      </div>
                      {sectionItems.map((item) => {
                        const index = items.indexOf(item);
                        const isActive = index === activeIndex;
                        return (
                          <div
                            key={item.id}
                            id={optionId(index)}
                            className={isActive ? 'spotlight-row is-active' : 'spotlight-row'}
                            role="option"
                            aria-selected={isActive}
                            onMouseMove={() => {
                              if (!isActive) setActiveId(item.id);
                            }}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => runItem(item)}
                          >
                            <SpotlightArt src={item.thumbnail} icon={item.icon} className="spotlight-row__art" />
                            <span className="spotlight-row__text">
                              <span className="spotlight-row__title">{item.title}</span>
                              {item.subtitle && <span className="spotlight-row__subtitle">{item.subtitle}</span>}
                            </span>
                            {item.secondary && (
                              <button
                                type="button"
                                className="spotlight-row__secondary"
                                aria-label={`${item.secondary.label} (Shift+Enter)`}
                                title={`${item.secondary.label} (Shift+Enter)`}
                                tabIndex={-1}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  runItem(item, true);
                                }}
                              >
                                <item.secondary.icon aria-hidden="true" />
                              </button>
                            )}
                            <CornerDownLeft className="spotlight-row__enter" aria-hidden="true" />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div className="spotlight-preview" aria-hidden="true">
                {activeItem && <SpotlightPreviewPane key={activeItem.id} item={activeItem} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpotlightArt({ src, icon: Icon, className }: { src?: string; icon: LucideIcon; className: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;

  return (
    <span className={className}>
      {showImage ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailedSrc(src ?? null)} />
      ) : (
        <Icon aria-hidden="true" />
      )}
    </span>
  );
}

function SpotlightPreviewPane({ item }: { item: SpotlightItem }) {
  const preview = item.preview;
  const meta = preview?.meta ?? [];

  return (
    <div className="spotlight-preview__content">
      <SpotlightArt
        src={preview?.art}
        icon={item.icon}
        className={preview?.wide ? 'spotlight-preview__art is-wide' : 'spotlight-preview__art'}
      />
      <div className="spotlight-preview__title">{item.title}</div>
      {meta.length === 0 && item.subtitle && <div className="spotlight-preview__subtitle">{item.subtitle}</div>}
      {meta.length > 0 && (
        <dl className="spotlight-preview__meta">
          {meta.map((entry) => {
            const MetaIcon = entry.icon;
            return (
              <div key={entry.label} className="spotlight-preview__row" title={entry.label}>
                <dt>
                  <MetaIcon aria-hidden="true" />
                  <span className="sr-only">{entry.label}</span>
                </dt>
                <dd>{entry.value}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
