import { useCallback } from 'react';
import { mp3Api } from '../api/mp3Api';
import { useToast } from '../components/messages/toastContext';
import { emitAppEvent } from '../utils/appEvents';
import { errorMessage } from '../utils/formatters';

export function useClearCache(): () => Promise<void> {
  const { showSuccess, showError } = useToast();

  return useCallback(async () => {
    try {
      await mp3Api.clearServerCache();
    } catch (err) {
      showError(errorMessage(err, 'Failed to clear cache'));
      return;
    }
    emitAppEvent('library-changed');
    showSuccess('Cache cleared');
  }, [showError, showSuccess]);
}
