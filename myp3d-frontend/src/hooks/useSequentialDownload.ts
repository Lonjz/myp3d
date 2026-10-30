import { useCallback, useRef, useState } from 'react';
import { mp3Api } from '../api/mp3Api';
import { useToast } from '../components/messages/toastContext';
import { startDownload } from '../utils/download';
import { trackCount } from '../utils/formatters';

interface DownloadProgress {
  done: number;
  total: number;
}

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  startDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

export function useSequentialDownload() {
  const { showSuccess, showError, showInfo } = useToast();
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const start = useCallback(async (filenames: string[]) => {
    if (controllerRef.current || filenames.length === 0) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    const total = filenames.length;
    let done = 0;
    let failed = 0;
    setProgress({ done, total });

    for (const filename of filenames) {
      try {
        const response = await fetch(mp3Api.getFileUrl(filename), { signal: controller.signal });
        if (!response.ok) throw new Error(response.statusText);
        saveBlob(await response.blob(), filename);
      } catch {
        if (controller.signal.aborted) break;
        failed += 1;
      }
      done += 1;
      setProgress({ done, total });
    }

    controllerRef.current = null;
    setProgress(null);

    if (controller.signal.aborted) {
      showInfo(`Stopped after ${trackCount(done - failed)}`);
    } else if (failed > 0) {
      showError(`${failed} of ${trackCount(total)} failed to download`);
    } else {
      showSuccess(`Downloaded ${trackCount(total)}`);
    }
  }, [showError, showInfo, showSuccess]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return { progress, start, cancel };
}
