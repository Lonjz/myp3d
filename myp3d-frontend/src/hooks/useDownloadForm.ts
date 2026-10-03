import { useState } from 'react';
import { mp3Api } from '../api/mp3Api';
import type { DownloadRequest } from '../api/mp3Api';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';
import { useToast } from '../components/messages/ToastProvider';
import { emitAppEvent } from '../utils/appEvents';

export interface DownloadFormValues {
  url: string;
  customFilename: string;
  title: string;
  artist: string;
  album: string;
  cover?: string;
}

interface UseDownloadFormOptions {
  zoomInputId: string;
  onDownloaded?: () => void;
  initialValues?: Partial<DownloadFormValues>;
}

export function useDownloadForm({ zoomInputId, onDownloaded, initialValues }: UseDownloadFormOptions) {
  const [url, setUrl] = useState(initialValues?.url ?? '');
  const [customFilename, setCustomFilename] = useState(initialValues?.customFilename ?? '');
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [artist, setArtist] = useState(initialValues?.artist ?? '');
  const [album, setAlbum] = useState(initialValues?.album ?? '');
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
  } = useCoverImageCrop({ onError: showError, onClearError: clearToast, initialCover: initialValues?.cover });

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
      emitAppEvent('library-changed');
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
    coverImageBase64,
    coverPreview,
    handleCoverFileSelect,
    handleRemoveCover,
    cropModalProps,
    submitDownload,
    resetFields,
  };
}
