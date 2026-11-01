import { Activity, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

export interface KeepAlivePage {
  path: string;
  element: ReactNode;
}

interface KeepAliveRoutesProps {
  pages: KeepAlivePage[];
  children: ReactNode;
}

export function KeepAliveRoutes({ pages, children }: KeepAliveRoutesProps) {
  const { pathname: rawPathname } = useLocation();
  const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/+$/, '') : rawPathname;
  const activePath = pages.some((page) => page.path === pathname) ? pathname : null;
  const [visited, setVisited] = useState<string[]>(() => (activePath ? [activePath] : []));
  const scrollPositions = useRef(new Map<string, number>());
  const currentPathRef = useRef(pathname);
  const pageNodes = useRef(new Map<string, HTMLDivElement>());
  const shownPaths = useRef(new Set<string>());

  if (activePath && !visited.includes(activePath)) {
    setVisited([...visited, activePath]);
  }

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    const handleScroll = () => {
      scrollPositions.current.set(currentPathRef.current, window.scrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    currentPathRef.current = pathname;
    window.scrollTo(0, scrollPositions.current.get(pathname) ?? 0);
  }, [pathname]);

  useLayoutEffect(() => {
    if (!activePath) return;
    if (!shownPaths.current.has(activePath)) {
      shownPaths.current.add(activePath);
      return;
    }
    pageNodes.current
      .get(activePath)
      ?.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
      .forEach((animation) => animation.finish());
  }, [activePath]);

  return (
    <>
      {pages
        .filter((page) => visited.includes(page.path))
        .map((page) => (
          <Activity key={page.path} mode={page.path === activePath ? 'visible' : 'hidden'}>
            <div
              className="keep-alive-page"
              ref={(node) => {
                if (node) pageNodes.current.set(page.path, node);
                else pageNodes.current.delete(page.path);
              }}
            >
              {page.element}
            </div>
          </Activity>
        ))}
      {activePath ? null : children}
    </>
  );
}
