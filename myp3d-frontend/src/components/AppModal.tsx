import { useEffect, type ReactNode } from 'react';

interface AppModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}

export function AppModal({ open, title, children, actions, onClose }: AppModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="app-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="app-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="app-modal-title">{title}</h3>
        <div className="app-modal-body">{children}</div>
        <div className="app-modal-actions">{actions}</div>
      </div>
    </div>
  );
}
