import { CoverCropModal } from '../components/cover/CoverCropModal';
import { DownloadConfigSection } from '../components/download/DownloadConfigSection';
import { useToast } from '../components/messages/ToastProvider';
import { useDownloadForm } from '../hooks/useDownloadForm';

export function DownloadPage() {
  const { showError } = useToast();

  const {
    url,
    setUrl,
    customFilename,
    setCustomFilename,
    title,
    setTitle,
    artist,
    setArtist,
    album,
    setAlbum,
    loading,
    coverPreview,
    handleCoverFileSelect,
    handleRemoveCover,
    cropModalProps,
    submitDownload,
  } = useDownloadForm({ zoomInputId: 'downloadCropZoom' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      showError('Please enter a YouTube URL');
      return;
    }
    await submitDownload();
  };

  return (
    <div className="page">
      <h1>Download MP3</h1>
      <form onSubmit={handleSubmit} className="download-form">
        <DownloadConfigSection
          url={url}
          onUrlChange={setUrl}
          customFilename={customFilename}
          onCustomFilenameChange={setCustomFilename}
          title={title}
          onTitleChange={setTitle}
          artist={artist}
          onArtistChange={setArtist}
          album={album}
          onAlbumChange={setAlbum}
          coverPreview={coverPreview}
          onCoverSelect={handleCoverFileSelect}
          onCoverClear={handleRemoveCover}
          disabled={loading}
        />

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Downloading...' : 'Download MP3'}
        </button>
      </form>

      <CoverCropModal {...cropModalProps} />
    </div>
  );
}
