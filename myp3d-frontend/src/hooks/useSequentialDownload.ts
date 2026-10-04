import { useCallback, useRef, useState } from 'react';
import { mp3Api } from '../api/mp3Api';
import { useToast } from '../components/messages/ToastProvider';

interface DownloadProgress {
  done: number;
  total: number;
}

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

const plural = (count: number) => `${count} track${count === 1 ? '' : 's'}`;

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
      showInfo(`Stopped after ${plural(done - failed)}`);
    } else if (failed > 0) {
      showError(`${failed} of ${plural(total)} failed to download`);
    } else {
      showSuccess(`Downloaded ${plural(total)}`);
    }
  }, [showError, showInfo, showSuccess]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return { progress, start, cancel };
}
