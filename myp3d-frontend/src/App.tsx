import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AudioLines, ChevronLeft, DiscAlbum, LayoutDashboard, ListMusic, Menu, MonitorPlay } from 'lucide-react';
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

function App() {
  const location = useLocation();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  const isLibraryActive =
    location.pathname === '/library' || location.pathname.startsWith('/details/');
  const isAlbumsActive = location.pathname === '/albums' || location.pathname.startsWith('/albums/');

  const getLinkClass = (active: boolean) => (active ? 'sidebar-link active' : 'sidebar-link');

  const navItems = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard aria-hidden="true" />,
      className: ({ isActive }: { isActive: boolean }) => getLinkClass(isActive),
    },
    {
      to: '/query',
      label: 'Query',
      icon: <MonitorPlay aria-hidden="true" />,
      className: ({ isActive }: { isActive: boolean }) => getLinkClass(isActive),
    },
    {
      to: '/library',
      label: 'Library',
      icon: <ListMusic aria-hidden="true" />,
      className: () => getLinkClass(isLibraryActive),
    },
    {
      to: '/albums',
      label: 'Albums',
      icon: <DiscAlbum aria-hidden="true" />,
      className: () => getLinkClass(isAlbumsActive),
    },
  ] as Array<{
    to: string;
    label: string;
    icon: ReactNode;
    className: ((state: { isActive: boolean }) => string) | (() => string);
  }>;

  return (
    <ToastProvider>
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

          <nav className="sidebar-nav" aria-label="Primary navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={item.className}
                title={item.label}
              >
                {item.icon}
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
          </header>

          <main className="content-main">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/download" element={<Navigate to="/query" replace />} />
            <Route path="/query" element={<QueryPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/details/:songName" element={<EditRoute />} />
            <Route path="/albums" element={<AlbumsPage />} />
            <Route path="/albums/:albumKey" element={<AlbumEditRoute />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </main>
        </section>
      </div>
    </ToastProvider>
  );
}

export default App;
