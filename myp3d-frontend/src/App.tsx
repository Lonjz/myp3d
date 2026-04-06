import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { DownloadPage } from './pages/DownloadPage';
import { QueryPage } from './pages/QueryPage';
import { LibraryPage } from './pages/LibraryPage';
import { EditPage } from './pages/EditPage';
import { AlbumsPage } from './pages/AlbumsPage';
import { AlbumEditPage } from './pages/AlbumEditPage';
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
  const isLibraryActive =
    location.pathname === '/library' || location.pathname.startsWith('/details/');
  const isAlbumsActive = location.pathname === '/albums' || location.pathname.startsWith('/albums/');

  return (
    <div className="app">
      <nav className="navbar">
        <h2>🎵 MP3 Downloader</h2>
        <div className="nav-links">
          <NavLink
            to="/download"
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            Download
          </NavLink>
          <NavLink
            to="/query"
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            Query
          </NavLink>
          <NavLink
            to="/library"
            className={isLibraryActive ? 'active' : ''}
          >
            Library
          </NavLink>
          <NavLink
            to="/albums"
            className={isAlbumsActive ? 'active' : ''}
          >
            Albums
          </NavLink>
        </div>
      </nav>
      <main>
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
    </div>
  );
}

export default App;
