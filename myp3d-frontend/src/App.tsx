import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import AlbumRoundedIcon from '@mui/icons-material/AlbumRounded';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import LibraryMusicRoundedIcon from '@mui/icons-material/LibraryMusicRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import MusicNoteRoundedIcon from '@mui/icons-material/MusicNoteRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { DownloadPage } from './pages/DownloadPage';
import { QueryPage } from './pages/QueryPage';
import { LibraryPage } from './pages/LibraryPage';
import { EditPage } from './pages/EditPage';
import { AlbumsPage } from './pages/AlbumsPage';
import { AlbumEditPage } from './pages/AlbumEditPage';
import { ToastProvider } from './components/messages/ToastProvider';
import './App.css';

function EditRoute() {
  const { songName } = useParams();
  const navigate = useNavigate();

  if (!songName) {
    return <Navigate to="/library" replace />;
  }

  const filename = (() => {
    try {
      return decodeURIComponent(songName);
    } catch {
      return songName;
    }
  })();

  return (
    <EditPage
      filename={filename}
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

  const albumKey = (() => {
    try {
      return decodeURIComponent(encodedAlbumKey);
    } catch {
      return encodedAlbumKey;
    }
  })();

  return (
    <AlbumEditPage
      albumKey={albumKey}
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
      to: '/download',
      label: 'Download',
      icon: <DownloadRoundedIcon fontSize="small" />,
      className: ({ isActive }: { isActive: boolean }) => getLinkClass(isActive),
    },
    {
      to: '/query',
      label: 'Query',
      icon: <SearchRoundedIcon fontSize="small" />,
      className: ({ isActive }: { isActive: boolean }) => getLinkClass(isActive),
    },
    {
      to: '/library',
      label: 'Library',
      icon: <LibraryMusicRoundedIcon fontSize="small" />,
      className: () => getLinkClass(isLibraryActive),
    },
    {
      to: '/albums',
      label: 'Albums',
      icon: <AlbumRoundedIcon fontSize="small" />,
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
      <div className="app-shell">
        <aside
          className={`sidebar ${isSidebarExpanded ? 'expanded' : 'collapsed'} ${
            isMobileSidebarOpen ? 'mobile-open' : ''
          }`}
        >
          <div className="sidebar-header">
            <h2 className="sidebar-brand">
              <MusicNoteRoundedIcon fontSize="small" className="sidebar-brand-icon" />
              <span>MP3D</span>
            </h2>
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={() => setIsSidebarExpanded((value) => !value)}
              aria-label={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              title={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {isSidebarExpanded ? (
                <ArrowBackIosNewIcon fontSize="small" className="sidebar-collapse-icon" />
              ) : (
                <ArrowForwardIosIcon fontSize="small" className="sidebar-collapse-icon" />
              )}
            </button>
          </div>

          <nav className="sidebar-nav" aria-label="Primary navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={item.className}
              >
                <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
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
          <header className="content-header">
            <button
              type="button"
              className="sidebar-mobile-btn"
              onClick={() => setIsMobileSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <MenuRoundedIcon fontSize="small" />
            </button>
          </header>

          <main className="content-main">
          <Routes>
            <Route path="/" element={<Navigate to="/download" replace />} />
            <Route path="/download" element={<DownloadPage />} />
            <Route path="/query" element={<QueryPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/details/:songName" element={<EditRoute />} />
            <Route path="/albums" element={<AlbumsPage />} />
            <Route path="/albums/:albumKey" element={<AlbumEditRoute />} />
            <Route path="*" element={<Navigate to="/download" replace />} />
          </Routes>
          </main>
        </section>
      </div>
    </ToastProvider>
  );
}

export default App;
