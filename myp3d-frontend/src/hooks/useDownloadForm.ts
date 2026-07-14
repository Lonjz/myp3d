import { useState } from 'react';
import { mp3Api } from '../api/mp3Api';
import type { DownloadRequest } from '../api/mp3Api';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';
import { useToast } from '../components/messages/ToastProvider';

interface UseDownloadFormOptions {
  zoomInputId: string;
  onDownloaded?: () => void;
}

export function useDownloadForm({ zoomInputId, onDownloaded }: UseDownloadFormOptions) {
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
  } = useCoverImageCrop({ onError: showError, onClearError: clearToast });

  const resetFields = () => {
    setUrl('');
    setCustomFilename('');
    setTitle('');
    setArtist('');
    setAlbum('');
    resetCoverState();
  };

  const submitDownload = async (extra?: Partial<DownloadRequest>): Promise<boolean> => {
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
        ...extra,
      };

      const result = await mp3Api.download(request);
      showSuccess(`Downloaded: ${result.filename}`);
      resetFields();
      onDownloaded?.();
      return true;
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Download failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Ready to spread into <CoverCropModal />.
  const cropModalProps = {
    isOpen: isCropModalOpen,
    cropSource,
    crop,
    zoom,
    isApplyingCrop,
    zoomInputId,
    onCropChange: setCrop,
    onZoomChange: setZoom,
    onCropComplete: handleCropComplete,
    onCancel: handleCancelCrop,
    onApply: handleApplyCrop,
  };

  return {
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
    resetFields,
  };
}
