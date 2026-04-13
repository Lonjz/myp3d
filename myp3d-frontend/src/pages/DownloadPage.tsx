import { useState } from 'react';
import { mp3Api } from '../api/mp3Api';
import type { DownloadRequest } from '../api/mp3Api';
import { CoverCropModal } from '../components/cover/CoverCropModal';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';
import { DownloadConfigSection } from '../components/download/DownloadConfigSection';
import { useToast } from '../components/messages/ToastProvider';

export function DownloadPage() {
  const [url, setUrl] = useState('');
  const [customFilename, setCustomFilename] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [loading, setLoading] = useState(false);
  const { showSuccess, showError, clearToast } = useToast();

  const {
    coverImageBase64,
    coverPreview,
    cropSource,
    crop,
    zoom,
    isCropModalOpen,
    isApplyingCrop,
    setCrop,
    setZoom,
    handleCropComplete,
    handleCoverFileSelect,
    handleApplyCrop,
    handleCancelCrop,
    handleRemoveCover,
    resetCoverState,
  } = useCoverImageCrop({
    onError: showError,
    onClearError: clearToast,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      showError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    clearToast();

    try {
      const request: DownloadRequest = {
        url: url.trim(),
        custom_filename: customFilename.trim() || undefined,
        title: title.trim() || undefined,
        artist: artist.trim() || undefined,
        album: album.trim() || undefined,
        cover_image_base64: coverImageBase64,
      };

      const result = await mp3Api.download(request);
      showSuccess(`Downloaded: ${result.filename}`);

      // Clear form
      setUrl('');
      setCustomFilename('');
      setTitle('');
      setArtist('');
      setAlbum('');
      resetCoverState();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setLoading(false);
    }
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

      <CoverCropModal
        isOpen={isCropModalOpen}
        cropSource={cropSource}
        crop={crop}
        zoom={zoom}
        isApplyingCrop={isApplyingCrop}
        zoomInputId="downloadCropZoom"
        onCropChange={setCrop}
        onZoomChange={setZoom}
        onCropComplete={handleCropComplete}
        onCancel={handleCancelCrop}
        onApply={handleApplyCrop}
      />
    </div>
  );
}
