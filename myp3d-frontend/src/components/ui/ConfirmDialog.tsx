import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  icon: LucideIcon;
  title: string;
  confirmLabel: string;
  confirmIcon: LucideIcon;
  cancelLabel: string;
  cancelIcon: LucideIcon;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  icon: Icon,
  title,
  confirmLabel,
  confirmIcon: ConfirmIcon,
  cancelLabel,
  cancelIcon: CancelIcon,
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="confirm-layer">
      <div className="confirm-scrim" onMouseDown={onCancel} />
      <div
        className={`confirm-dialog glass confirm-dialog--${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <span className="confirm-dialog__icon">
          <Icon aria-hidden="true" />
        </span>
        <h2 id="confirm-dialog-title" className="confirm-dialog__title">
          {title}
        </h2>
        <div className="confirm-dialog__actions">
          <button ref={cancelRef} type="button" className="confirm-btn" onClick={onCancel}>
            <CancelIcon aria-hidden="true" />
            {cancelLabel}
          </button>
          <button type="button" className={`confirm-btn confirm-btn--${tone}`} onClick={onConfirm}>
            <ConfirmIcon aria-hidden="true" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
