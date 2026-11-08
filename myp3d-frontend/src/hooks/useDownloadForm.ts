import { useEffect, useRef, useState } from 'react';
import { Pencil, TriangleAlert, Undo2 } from 'lucide-react';
import { ApiError, mp3Api } from '../api/mp3Api';
import type { DownloadRequest } from '../api/mp3Api';
import { queueApi } from '../api/queueApi';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';
import { useToast } from '../components/messages/toastContext';
import { emitAppEvent, subscribeAppEvent } from '../utils/appEvents';
import { useDebouncedValue } from './useDebouncedValue';
import { errorMessage } from '../utils/formatters';

const FILENAME_CHECK_DELAY_MS = 300;

export type FilenameStatus = 'checking' | 'available' | 'taken' | null;

type SubmitAction = 'download' | 'queue';

const filenameExists = (name: string) =>
  mp3Api.getInfo(`${name}.mp3`).then(
    () => true,
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 404) return false;
      throw err;
    },
  );

export interface DownloadFormValues {
  url: string;
  customFilename: string;
  title: string;
  artist: string;
  album: string;
  cover?: string;
}

interface UseDownloadFormOptions {
  onSubmitted?: () => void;
  initialValues?: Partial<DownloadFormValues>;
}

export function useDownloadForm({ onSubmitted, initialValues }: UseDownloadFormOptions) {
  const [url, setUrl] = useState(initialValues?.url ?? '');
  const [customFilename, setCustomFilename] = useState(initialValues?.customFilename ?? '');
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [artist, setArtist] = useState(initialValues?.artist ?? '');
  const [album, setAlbum] = useState(initialValues?.album ?? '');
  const [submitting, setSubmitting] = useState<SubmitAction | null>(null);
  const [overwriteTarget, setOverwriteTarget] = useState<string | null>(null);
  const overwriteResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [filenameCheck, setFilenameCheck] = useState<{ name: string; version: number; taken: boolean | null } | null>(null);
  const [libraryVersion, setLibraryVersion] = useState(0);
  const { showSuccess, showError, clearToast } = useToast();

  const requestedFilename = customFilename.trim().toLowerCase();
  const debouncedFilename = useDebouncedValue(requestedFilename, FILENAME_CHECK_DELAY_MS);

  useEffect(() => subscribeAppEvent('library-changed', () => setLibraryVersion((version) => version + 1)), []);

  useEffect(() => {
    if (!debouncedFilename) return undefined;
    let cancelled = false;
    filenameExists(debouncedFilename).then(
      (taken) => {
        if (!cancelled) setFilenameCheck({ name: debouncedFilename, version: libraryVersion, taken });
      },
      () => {
        if (!cancelled) setFilenameCheck({ name: debouncedFilename, version: libraryVersion, taken: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [debouncedFilename, libraryVersion]);

  const filenameStatus: FilenameStatus = !requestedFilename
    ? null
    : filenameCheck?.name === requestedFilename && filenameCheck.version === libraryVersion
      ? filenameCheck.taken === null
        ? null
        : filenameCheck.taken
          ? 'taken'
          : 'available'
      : 'checking';

  const {
    cropModalProps,
    coverImageBase64,
    coverPreview,
    handleCoverFileSelect,
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

  const confirmOverwrite = (filename: string) =>
    new Promise<boolean>((resolve) => {
      overwriteResolverRef.current = resolve;
      setOverwriteTarget(filename);
    });

  const resolveOverwrite = (confirmed: boolean) => {
    overwriteResolverRef.current?.(confirmed);
    overwriteResolverRef.current = null;
    setOverwriteTarget(null);
  };

  const checkOverwrite = async (): Promise<boolean | null> => {
    if (!requestedFilename) return false;
    const exists = await filenameExists(requestedFilename);
    if (exists && !(await confirmOverwrite(`${requestedFilename}.mp3`))) return null;
    return exists;
  };

  const submit = async (
    action: SubmitAction,
    send: (request: DownloadRequest, overwrite: boolean) => Promise<string>,
    fallbackError: string,
    extra?: Partial<DownloadRequest>,
  ): Promise<boolean> => {
    let overwrite: boolean | null;
    try {
      overwrite = await checkOverwrite();
    } catch (err) {
      showError(errorMessage(err, fallbackError));
      return false;
    }
    if (overwrite === null) return false;

    setSubmitting(action);
    clearToast();

    try {
      const request: DownloadRequest = {
        url: url.trim(),
        custom_filename: requestedFilename || undefined,
        title: title.trim() || undefined,
        artist: artist.trim() || undefined,
        album: album.trim() || undefined,
        cover_image_base64: coverImageBase64,
        ...extra,
      };

      showSuccess(await send(request, overwrite));
      resetFields();
      onSubmitted?.();
      return true;
    } catch (err) {
      showError(errorMessage(err, fallbackError));
      return false;
    } finally {
      setSubmitting(null);
    }
  };

  const submitDownload = (extra?: Partial<DownloadRequest>) =>
    submit(
      'download',
      async (request, overwrite) => {
        const result = await mp3Api.download({ ...request, overwrite });
        emitAppEvent('library-changed');
        return `Downloaded: ${result.filename}`;
      },
      'Download failed',
      extra,
    );

  const queueDownload = (extra?: Partial<DownloadRequest>) =>
    submit(
      'queue',
      async (request, overwrite) => {
        await queueApi.add([{ ...request, overwrite }]);
        emitAppEvent('queue-changed');
        return `Queued: ${request.title || request.url}`;
      },
      'Failed to queue download',
      extra,
    );

  const overwriteDialogProps = {
    open: overwriteTarget !== null,
    icon: TriangleAlert,
    title: overwriteTarget ? `Overwrite "${overwriteTarget}"?` : '',
    cancelLabel: 'Keep',
    cancelIcon: Undo2,
    confirmLabel: 'Overwrite',
    confirmIcon: Pencil,
    tone: 'danger' as const,
    onCancel: () => resolveOverwrite(false),
    onConfirm: () => resolveOverwrite(true),
  };

  return {
    url,
    setUrl,
    customFilename,
    setCustomFilename,
    filenameStatus,
    title,
    setTitle,
    artist,
    setArtist,
    album,
    setAlbum,
    loading: submitting !== null,
    submitting,
    coverImageBase64,
    coverPreview,
    handleCoverFileSelect,
    handleRemoveCover,
    cropModalProps,
    overwriteDialogProps,
    checkOverwrite,
    submitDownload,
    queueDownload,
  };
}
