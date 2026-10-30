import { useId, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { usePresence } from '../../hooks/usePresence';
import { Modal } from './Modal';

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
  const titleId = useId();
  const { mounted, closing } = usePresence(open);
  const [shownTitle, setShownTitle] = useState(title);

  if (open && title !== shownTitle) {
    setShownTitle(title);
  }

  if (!mounted) return null;

  return (
    <Modal
      className={`confirm-dialog confirm-dialog--${tone}`}
      closing={closing}
      onClose={onCancel}
      role="alertdialog"
      labelledBy={titleId}
      initialFocus={cancelRef}
    >
        <span className="confirm-dialog__icon">
          <Icon aria-hidden="true" />
        </span>
        <h2 id={titleId} className="confirm-dialog__title">
          {shownTitle}
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
    </Modal>
  );
}
