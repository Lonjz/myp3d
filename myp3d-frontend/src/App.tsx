import { useState } from 'react';
import { DownloadPage } from './pages/DownloadPage';
import { LibraryPage } from './pages/LibraryPage';
import { EditPage } from './pages/EditPage';
import './App.css';

type Page = 'download' | 'library' | { type: 'edit'; filename: string };

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('download');

  const renderPage = () => {
    if (currentPage === 'download') {
      return <DownloadPage />;
    }
    if (currentPage === 'library') {
      return <LibraryPage onEdit={(filename) => setCurrentPage({ type: 'edit', filename })} />;
    }
    if (typeof currentPage === 'object' && currentPage.type === 'edit') {
      return <EditPage filename={currentPage.filename} onBack={() => setCurrentPage('library')} />;
    }
    return null;
  };

  return (
    <div className="app">
      <nav className="navbar">
        <h2>🎵 MP3 Downloader</h2>
        <div className="nav-links">
          <button
            className={currentPage === 'download' ? 'active' : ''}
            onClick={() => setCurrentPage('download')}
          >
            Download
          </button>
          <button
            className={currentPage === 'library' || (typeof currentPage === 'object') ? 'active' : ''}
            onClick={() => setCurrentPage('library')}
          >
            Library
          </button>
        </div>
      </nav>
      <main>{renderPage()}</main>
    </div>
  );
}

export default App;
