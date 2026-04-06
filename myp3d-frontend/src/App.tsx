import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { DownloadPage } from './pages/DownloadPage';
import { QueryPage } from './pages/QueryPage';
import { LibraryPage } from './pages/LibraryPage';
import { EditPage } from './pages/EditPage';
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

function App() {
  const location = useLocation();
  const isLibraryActive =
    location.pathname === '/library' || location.pathname.startsWith('/details/');

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
        </div>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/download" replace />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/query" element={<QueryPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/details/:songName" element={<EditRoute />} />
          <Route path="*" element={<Navigate to="/download" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
