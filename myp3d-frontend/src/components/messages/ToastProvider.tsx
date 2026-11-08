import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { UNREACHABLE_MESSAGE } from '../../api/mp3Api';
import { FeedbackToast, type FeedbackMessage } from './FeedbackToast';
import { ToastContext } from './toastContext';
import type { ToastContextValue } from './toastContext';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<FeedbackMessage | null>(null);

  const value = useMemo<ToastContextValue>(
    () => ({
      showSuccess: (text) => setMessage({ type: 'success', text }),
      showError: (text) => {
        if (text !== UNREACHABLE_MESSAGE) setMessage({ type: 'error', text });
      },
      showInfo: (text) => setMessage({ type: 'info', text }),
      clearToast: () => setMessage(null),
    }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      <FeedbackToast message={message} onClose={value.clearToast} />
      {children}
    </ToastContext.Provider>
  );
}
