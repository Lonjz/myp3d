import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { FeedbackToast, type FeedbackMessage } from './FeedbackToast';

interface ToastContextValue {
  showSuccess: (text: string) => void;
  showError: (text: string) => void;
  showInfo: (text: string) => void;
  clearToast: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<FeedbackMessage | null>(null);

  const showSuccess = useCallback((text: string) => {
    setMessage({ type: 'success', text });
  }, []);

  const showError = useCallback((text: string) => {
    setMessage({ type: 'error', text });
  }, []);

  const showInfo = useCallback((text: string) => {
    setMessage({ type: 'info', text });
  }, []);

  const clearToast = useCallback(() => {
    setMessage(null);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      showSuccess,
      showError,
      showInfo,
      clearToast,
    }),
    [showSuccess, showError, showInfo, clearToast],
  );

  return (
    <ToastContext.Provider value={value}>
      <FeedbackToast message={message} onClose={clearToast} />
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
