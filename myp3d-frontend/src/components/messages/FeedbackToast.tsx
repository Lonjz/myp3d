import { useEffect, useRef } from 'react';
import CloseIcon from '@mui/icons-material/Close';

export type FeedbackMessage = {
  type: 'success' | 'error' | 'info';
  text: string;
};

interface FeedbackToastProps {
  message: FeedbackMessage | null;
  onClose: () => void;
  autoHideMs?: number;
}

const MESSAGE_LABELS: Record<FeedbackMessage['type'], string> = {
  success: 'Success',
  error: 'Error',
  info: 'Info',
};

export function FeedbackToast({
  message,
  onClose,
  autoHideMs = 4200,
}: FeedbackToastProps) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onCloseRef.current();
    }, autoHideMs);

    return () => window.clearTimeout(timeoutId);
  }, [message, autoHideMs]);

  if (!message) {
    return null;
  }

  return (
    <div className="drop-message-layer" aria-live={message.type === 'error' ? 'assertive' : 'polite'}>
      <div
        key={`${message.type}:${message.text}`}
        className={`drop-message drop-message--${message.type}`}
        role={message.type === 'error' ? 'alert' : 'status'}
      >
        <span className="drop-message__label">{MESSAGE_LABELS[message.type]}</span>
        <span className="drop-message__text">{message.text}</span>
        <button
          type="button"
          className="drop-message__close"
          onClick={onClose}
          aria-label="Dismiss notification"
          title="Dismiss"
        >
          <CloseIcon fontSize="inherit" />
        </button>
      </div>
    </div>
  );
}
