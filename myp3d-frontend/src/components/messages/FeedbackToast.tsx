import { useEffect } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLingering } from '../../hooks/usePresence';

export type FeedbackMessage = {
  type: 'success' | 'error' | 'info';
  text: string;
};

interface FeedbackToastProps {
  message: FeedbackMessage | null;
  onClose: () => void;
}

const AUTO_HIDE_MS = 4200;

const MESSAGE_ICONS: Record<FeedbackMessage['type'], { icon: LucideIcon; label: string }> = {
  success: { icon: CircleCheck, label: 'Success' },
  error: { icon: CircleAlert, label: 'Error' },
  info: { icon: Info, label: 'Info' },
};

export function FeedbackToast({ message, onClose }: FeedbackToastProps) {
  const { value: shown, closing } = useLingering(message);

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(onClose, AUTO_HIDE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [message, onClose]);

  if (!shown) {
    return null;
  }

  const { icon: StatusIcon, label } = MESSAGE_ICONS[shown.type];

  return (
    <div className="drop-message-layer" aria-live={shown.type === 'error' ? 'assertive' : 'polite'}>
      <div
        key={`${shown.type}:${shown.text}`}
        className={`drop-message drop-message--${shown.type} glass motion-pop`}
        role={shown.type === 'error' ? 'alert' : 'status'}
        data-state={closing ? 'closed' : 'open'}
      >
        <StatusIcon className="drop-message__icon" aria-label={label} />
        <span className="drop-message__text">{shown.text}</span>
        <button
          type="button"
          className="drop-message__close"
          onClick={onClose}
          aria-label="Dismiss notification"
          title="Dismiss"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
