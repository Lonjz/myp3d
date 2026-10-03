import { useEffect, useState } from 'react';
import { AudioLines, ChevronLeft, Menu, Search } from 'lucide-react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { QueryPage } from './pages/QueryPage';
import { LibraryPage } from './pages/LibraryPage';
import { EditPage } from './pages/EditPage';
import { AlbumsPage } from './pages/AlbumsPage';
import { AlbumEditPage } from './pages/AlbumEditPage';
import { ToastProvider } from './components/messages/ToastProvider';
import { IconButton } from './components/ui/IconButton';
import { AppBackdrop } from './components/shell/AppBackdrop';
import { KeepAliveRoutes } from './components/shell/KeepAliveRoutes';
import { PlayerBar } from './components/player/PlayerBar';
import { PlayerProvider } from './components/player/PlayerProvider';
import type { KeepAlivePage } from './components/shell/KeepAliveRoutes';
import { NAV_ITEMS } from './components/shell/navItems';
import { SpotlightProvider } from './components/spotlight/SpotlightProvider';
import { useSpotlight } from './components/spotlight/spotlightContext';
import { SPOTLIGHT_SHORTCUT_LABEL } from './components/spotlight/spotlightTypes';

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function EditRoute() {
  const { songName } = useParams();
  const navigate = useNavigate();

  if (!songName) {
    return <Navigate to="/library" replace />;
  }

  return (
    <EditPage
      filename={safeDecode(songName)}
      onBack={() => navigate('/library')}
    />
  );
}

function AlbumEditRoute() {
  const { albumKey: encodedAlbumKey } = useParams();
  const navigate = useNavigate();

  if (!encodedAlbumKey) {
    return <Navigate to="/albums" replace />;
  }

  return (
    <AlbumEditPage
      albumKey={safeDecode(encodedAlbumKey)}
      onBack={() => navigate('/albums')}
    />
  );
}

const KEEP_ALIVE_PAGES: KeepAlivePage[] = [
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/query', element: <QueryPage /> },
  { path: '/library', element: <LibraryPage /> },
  { path: '/albums', element: <AlbumsPage /> },
];

function SidebarSearchButton() {
  const { open } = useSpotlight();

  return (
    <button
      type="button"
      className="sidebar-search"
      aria-label="Search"
      aria-keyshortcuts="Control+K Meta+K"
      title={`Search (${SPOTLIGHT_SHORTCUT_LABEL})`}
      onClick={() => open()}
    >
      <Search aria-hidden="true" />
      <span className="sidebar-label">Search</span>
      <kbd className="sidebar-search__kbd">{SPOTLIGHT_SHORTCUT_LABEL}</kbd>
    </button>
  );
}

function HeaderSearchButton() {
  const { open } = useSpotlight();

  return (
    <IconButton
      icon={Search}
      label="Search"
      variant="ghost"
      className="content-header__search"
      onClick={() => open()}
    />
  );
}

function App() {
  const location = useLocation();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <ToastProvider>
      <SpotlightProvider>
        <PlayerProvider>
          <AppBackdrop />
          <div className="app-shell">
            <aside
              className={`sidebar glass ${isSidebarExpanded ? 'expanded' : 'collapsed'} ${
                isMobileSidebarOpen ? 'mobile-open' : ''
              }`}
            >
              <div className="sidebar-header">
                <span className="sidebar-brand">
                  <AudioLines aria-hidden="true" />
                  <span>MYP3D</span>
                </span>
                <IconButton
                  icon={ChevronLeft}
                  label={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
                  variant="ghost"
                  className="sidebar-collapse-btn"
                  onClick={() => setIsSidebarExpanded((value) => !value)}
                />
              </div>

              <SidebarSearchButton />

              <nav className="sidebar-nav" aria-label="Primary navigation">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={() => (item.isActive(location.pathname) ? 'sidebar-link active' : 'sidebar-link')}
                    title={item.label}
                  >
                    <item.icon aria-hidden="true" />
                    <span className="sidebar-label">{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </aside>

            {isMobileSidebarOpen && (
              <button
                type="button"
                aria-label="Close navigation"
                className="sidebar-overlay"
                onClick={() => setIsMobileSidebarOpen(false)}
              />
            )}

            <section className="app-content">
              <header className="content-header glass">
                <IconButton
                  icon={Menu}
                  label="Open navigation"
                  variant="ghost"
                  onClick={() => setIsMobileSidebarOpen(true)}
                />
                <HeaderSearchButton />
              </header>

              <main className="content-main">
                <KeepAliveRoutes pages={KEEP_ALIVE_PAGES}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/download" element={<Navigate to="/query" replace />} />
                    <Route path="/details/:songName" element={<EditRoute />} />
                    <Route path="/albums/:albumKey" element={<AlbumEditRoute />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </KeepAliveRoutes>
              </main>

              <PlayerBar />
            </section>
          </div>
        </PlayerProvider>
      </SpotlightProvider>
    </ToastProvider>
  );
}

export default App;
