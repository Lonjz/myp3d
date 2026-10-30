import { useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../../hooks/useDialog';

interface ModalProps {
  className: string;
  closing: boolean;
  locked?: boolean;
  onClose: () => void;
  role?: 'dialog' | 'alertdialog';
  label?: string;
  labelledBy?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function Modal({ className, closing, locked = false, onClose, role = 'dialog', label, labelledBy, initialFocus, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef, { onClose, locked: locked || closing, initialFocus });

  return createPortal(
    <div className="confirm-layer" data-state={closing ? 'closed' : 'open'}>
      <div className="confirm-scrim motion-fade" onMouseDown={locked || closing ? undefined : onClose} />
      <div
        ref={panelRef}
        className={`${className} glass motion-pop`}
        role={role}
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
