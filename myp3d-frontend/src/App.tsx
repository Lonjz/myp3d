import { lazy, Suspense, useState } from 'react';
import { AudioLines, ChevronLeft, Menu, Search, Settings } from 'lucide-react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ToastProvider } from './components/messages/ToastProvider';
import { DownloadQueueProvider } from './components/downloads/DownloadQueueProvider';
import { useDownloadQueue } from './components/downloads/downloadQueueContext';
import { IconButton } from './components/ui/IconButton';
import { AppBackdrop } from './components/shell/AppBackdrop';
import { DocumentTitle } from './components/shell/DocumentTitle';
import { KeepAliveRoutes } from './components/shell/KeepAliveRoutes';
import { TrackActionsProvider } from './components/library/TrackActionsProvider';
import { PlayerBar } from './components/player/PlayerBar';
import { PlayerProvider } from './components/player/PlayerProvider';
import type { KeepAlivePage } from './components/shell/KeepAliveRoutes';
import { NAV_ITEMS } from './components/shell/navItems';
import { SpotlightProvider } from './components/spotlight/SpotlightProvider';
import { useSpotlight } from './components/spotlight/spotlightContext';
import { SPOTLIGHT_SHORTCUT_LABEL } from './components/spotlight/spotlightTypes';
import { usePresence } from './hooks/usePresence';
import { Spinner } from './components/ui/Spinner';
import { BackendStatus } from './components/shell/BackendStatus';
import { ErrorBoundary } from './components/shell/ErrorBoundary';
import { AppearanceProvider } from './components/settings/AppearanceProvider';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { emitAppEvent } from './utils/appEvents';
import { NotFoundPage } from './pages/NotFoundPage';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const QueryPage = lazy(() => import('./pages/QueryPage').then((module) => ({ default: module.QueryPage })));
const LibraryPage = lazy(() => import('./pages/LibraryPage').then((module) => ({ default: module.LibraryPage })));
const EditPage = lazy(() => import('./pages/EditPage').then((module) => ({ default: module.EditPage })));
const AlbumsPage = lazy(() => import('./pages/AlbumsPage').then((module) => ({ default: module.AlbumsPage })));
const AlbumEditPage = lazy(() => import('./pages/AlbumEditPage').then((module) => ({ default: module.AlbumEditPage })));
const PlaylistsPage = lazy(() => import('./pages/PlaylistsPage').then((module) => ({ default: module.PlaylistsPage })));
const PlaylistEditPage = lazy(() => import('./pages/PlaylistEditPage').then((module) => ({ default: module.PlaylistEditPage })));
const SyncPage = lazy(() => import('./pages/SyncPage').then((module) => ({ default: module.SyncPage })));
const MusicPage = lazy(() => import('./pages/MusicPage').then((module) => ({ default: module.MusicPage })));
const DownloadsPage = lazy(() => import('./pages/DownloadsPage').then((module) => ({ default: module.DownloadsPage })));
const SpotifyPage = lazy(() => import('./pages/SpotifyPage').then((module) => ({ default: module.SpotifyPage })));
const ExportPage = lazy(() => import('./pages/ExportPage').then((module) => ({ default: module.ExportPage })));
const HealthPage = lazy(() => import('./pages/HealthPage').then((module) => ({ default: module.HealthPage })));

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

function PlaylistEditRoute() {
  const { playlistId } = useParams();
  const navigate = useNavigate();

  if (!playlistId) {
    return <Navigate to="/playlists" replace />;
  }

  return (
    <PlaylistEditPage
      playlistId={safeDecode(playlistId)}
      onBack={() => navigate('/playlists')}
    />
  );
}

const KEEP_ALIVE_PAGES: KeepAlivePage[] = [
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/query', element: <QueryPage /> },
  { path: '/spotify', element: <SpotifyPage /> },
  { path: '/downloads', element: <DownloadsPage /> },
  { path: '/library', element: <LibraryPage /> },
  { path: '/albums', element: <AlbumsPage /> },
  { path: '/playlists', element: <PlaylistsPage /> },
  { path: '/health', element: <HealthPage /> },
  { path: '/export', element: <ExportPage /> },
  { path: '/sync', element: <SyncPage /> },
  { path: '/music', element: <MusicPage /> },
];

const FILL_PATHS = new Set(['/library', '/albums', '/playlists', '/music', '/downloads', '/spotify', '/health']);

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

function DownloadsActivity() {
  const { active } = useDownloadQueue();
  if (!active) return null;
  return <span className="sidebar-link__activity" role="status" aria-label="Downloading" />;
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
  const sidebarOverlay = usePresence(isMobileSidebarOpen);
  const [sidebarPathname, setSidebarPathname] = useState(location.pathname);
  const isFillPage = FILL_PATHS.has(location.pathname.replace(/(.)\/+$/, '$1'));

  if (sidebarPathname !== location.pathname) {
    setSidebarPathname(location.pathname);
    setIsMobileSidebarOpen(false);
  }

  return (
    <ToastProvider>
      <SpotlightProvider>
        <PlayerProvider>
          <TrackActionsProvider>
            <DownloadQueueProvider>
              <AppearanceProvider>
                <DocumentTitle />
                <AppBackdrop />
                <BackendStatus />
                <SettingsDialog />
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
                          className={() => (item.isActive(location.pathname) ? 'sidebar-link is-active' : 'sidebar-link')}
                          title={item.label}
                        >
                          <item.icon aria-hidden="true" />
                          <span className="sidebar-label">{item.label}</span>
                          {item.to === '/downloads' && <DownloadsActivity />}
                        </NavLink>
                      ))}
                    </nav>

                    <button
                      type="button"
                      className="sidebar-link sidebar-settings"
                      aria-label="Settings"
                      title="Settings"
                      onClick={() => emitAppEvent('show-settings')}
                    >
                      <Settings aria-hidden="true" />
                      <span className="sidebar-label">Settings</span>
                    </button>
                  </aside>

                  {sidebarOverlay.mounted && (
                    <button
                      type="button"
                      aria-label="Close navigation"
                      className="sidebar-overlay motion-fade"
                      data-state={sidebarOverlay.closing ? 'closed' : 'open'}
                      onClick={() => setIsMobileSidebarOpen(false)}
                    />
                  )}

                  <section className={isFillPage ? 'app-content app-content--fill' : 'app-content'}>
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
                      <ErrorBoundary resetKey={location.pathname}>
                        <Suspense fallback={<Spinner />}>
                          <KeepAliveRoutes pages={KEEP_ALIVE_PAGES}>
                            <Routes>
                              <Route path="/" element={<Navigate to="/dashboard" replace />} />
                              <Route path="/download" element={<Navigate to="/query" replace />} />
                              <Route path="/details/:songName" element={<EditRoute />} />
                              <Route path="/albums/:albumKey" element={<AlbumEditRoute />} />
                              <Route path="/playlists/:playlistId" element={<PlaylistEditRoute />} />
                              <Route path="*" element={<NotFoundPage />} />
                            </Routes>
                          </KeepAliveRoutes>
                        </Suspense>
                      </ErrorBoundary>
                    </main>

                    <PlayerBar />
                  </section>
                </div>
              </AppearanceProvider>
            </DownloadQueueProvider>
          </TrackActionsProvider>
        </PlayerProvider>
      </SpotlightProvider>
    </ToastProvider>
  );
}

export default App;
