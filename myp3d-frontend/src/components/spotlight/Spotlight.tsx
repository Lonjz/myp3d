import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, CornerDownLeft, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePresence } from '../../hooks/usePresence';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import type { MenuAction } from '../ui/ContextMenu';
import { useSpotlightResults } from './useSpotlightResults';
import type { SpotlightItem, SpotlightSource } from './spotlightTypes';

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
  const [session, setSession] = useState(0);
  const { mounted, closing } = usePresence(open);

  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) setSession((value) => value + 1);
  }

  if (!mounted) return null;

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
  const [browsing, setBrowsing] = useState(false);
  const [actionsFor, setActionsFor] = useState<SpotlightItem | null>(null);
  const [activeAction, setActiveAction] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const ranItemRef = useRef(false);

  const { sections, items, loading } = useSpotlightResults(query, sources, browsing);
  const foundIndex = items.findIndex((item) => item.id === activeId);
  const activeIndex = foundIndex >= 0 ? foundIndex : 0;
  const activeItem = items[activeIndex] ?? null;
  const actions = actionsFor?.actions ?? [];
  const hasResults = (query.trim().length > 0 || browsing) && items.length > 0;
  const bodyOpen = hasResults || actionsFor !== null;
  const highlighted = actionsFor ? activeAction : activeIndex;
  const previewItem = actionsFor ?? activeItem;

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
    listRef.current?.querySelector(`#${optionId(highlighted)}`)?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, items.length, actionsFor]);

  const updateQuery = (value: string) => {
    setQuery(value);
    setActiveId(null);
    setActionsFor(null);
  };

  const openActions = (item: SpotlightItem) => {
    if (!item.actions?.length) return false;
    setActiveId(item.id);
    setActionsFor(item);
    setActiveAction(0);
    return true;
  };

  const closeActions = () => setActionsFor(null);

  const runItem = (item: SpotlightItem, useQuickAction = false) => {
    ranItemRef.current = true;
    onClose();
    const quickAction = useQuickAction ? item.actions?.[0] : undefined;
    if (quickAction) {
      quickAction.run();
      return;
    }
    item.run({ navigate, close: onClose, query });
  };

  const runAction = (action: MenuAction) => {
    ranItemRef.current = true;
    onClose();
    action.run();
  };

  const handleActionsKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveAction((index) => (index + delta + actions.length) % actions.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const action = actions[activeAction];
      if (action) runAction(action);
      return;
    }

    if (event.key === 'Escape' || event.key === 'ArrowLeft' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      closeActions();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;

    if (actionsFor) {
      handleActionsKeyDown(event);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!hasResults) {
        if (event.key === 'ArrowDown' && !query.trim()) setBrowsing(true);
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (activeIndex + delta + items.length) % items.length;
      setActiveId(items[nextIndex].id);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      if (hasResults && activeItem && !event.shiftKey) openActions(activeItem);
      return;
    }

    if (event.key === 'ArrowRight') {
      const input = event.currentTarget;
      const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
      if (hasResults && activeItem && atEnd && openActions(activeItem)) event.preventDefault();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (hasResults && activeItem) runItem(activeItem, event.shiftKey);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (query) {
        updateQuery('');
      } else if (browsing) {
        setBrowsing(false);
      } else {
        onClose();
      }
    }
  };

  return (
    <div className="spotlight-layer" data-state={closing ? 'closed' : 'open'}>
      <div className="spotlight-scrim motion-fade" onMouseDown={onClose} />
      <div className="spotlight glass motion-pop" role="dialog" aria-modal="true" aria-label="Spotlight">
        <div className="spotlight-bar">
          <Search className="spotlight-bar__icon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="spotlight-input"
            type="text"
            role="combobox"
            aria-label="Search"
            aria-expanded={bodyOpen}
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={bodyOpen ? optionId(highlighted) : undefined}
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
          ) : (
            <IconButton
              icon={ChevronDown}
              label={browsing ? 'Hide commands' : 'Show commands'}
              variant="ghost"
              size="sm"
              className={browsing ? 'spotlight-browse is-open' : 'spotlight-browse'}
              aria-expanded={browsing}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setActionsFor(null);
                setBrowsing((value) => !value);
              }}
            />
          )}
        </div>

        <div className={bodyOpen ? 'spotlight-body is-open' : 'spotlight-body'}>
          <div className="spotlight-body__inner">
            <div className="spotlight-results">
              <div ref={listRef} id={LISTBOX_ID} className="spotlight-list" role="listbox" aria-label="Results">
                {actionsFor ? (
                  <div className="spotlight-section" role="group" aria-labelledby="spotlight-section-item-actions">
                    <div id="spotlight-section-item-actions" className="spotlight-section__header">
                      <button
                        type="button"
                        className="spotlight-actions__back"
                        aria-label="Back"
                        title="Back"
                        tabIndex={-1}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={closeActions}
                      >
                        <ChevronLeft aria-hidden="true" />
                      </button>
                      <span className="spotlight-actions__title">{actionsFor.title}</span>
                    </div>
                    {actions.map((action, index) => {
                      const isActive = index === activeAction;
                      return (
                        <div
                          key={action.id}
                          id={optionId(index)}
                          className={['spotlight-row', isActive ? 'is-active' : '', action.danger ? 'is-danger' : '']
                            .filter(Boolean)
                            .join(' ')}
                          role="option"
                          aria-selected={isActive}
                          onMouseMove={() => {
                            if (!isActive) setActiveAction(index);
                          }}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => runAction(action)}
                        >
                          <SpotlightArt icon={action.icon} className="spotlight-row__art" />
                          <span className="spotlight-row__text">
                            <span className="spotlight-row__title">{action.label}</span>
                          </span>
                          <CornerDownLeft className="spotlight-row__enter" aria-hidden="true" />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  sections.map(({ section, items: sectionItems }) => {
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
                          const quickAction = item.actions?.[0];
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
                              onContextMenu={(event) => {
                                event.preventDefault();
                                openActions(item);
                              }}
                            >
                              <SpotlightArt src={item.thumbnail} icon={item.icon} className="spotlight-row__art" />
                              <span className="spotlight-row__text">
                                <span className="spotlight-row__title">{item.title}</span>
                                {item.subtitle && <span className="spotlight-row__subtitle">{item.subtitle}</span>}
                              </span>
                              {quickAction && (
                                <button
                                  type="button"
                                  className="spotlight-row__secondary"
                                  aria-label={`${quickAction.label} (Shift+Enter)`}
                                  title={`${quickAction.label} (Shift+Enter)`}
                                  tabIndex={-1}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    runItem(item, true);
                                  }}
                                >
                                  <quickAction.icon aria-hidden="true" />
                                </button>
                              )}
                              {quickAction && (
                                <button
                                  type="button"
                                  className="spotlight-row__more"
                                  aria-label="Actions (Tab)"
                                  title="Actions (Tab)"
                                  tabIndex={-1}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openActions(item);
                                  }}
                                >
                                  <ChevronRight aria-hidden="true" />
                                </button>
                              )}
                              <CornerDownLeft className="spotlight-row__enter" aria-hidden="true" />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="spotlight-preview" aria-hidden="true">
                {previewItem && <SpotlightPreviewPane key={previewItem.id} item={previewItem} />}
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
    <div className="spotlight-preview__content motion-fade">
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
