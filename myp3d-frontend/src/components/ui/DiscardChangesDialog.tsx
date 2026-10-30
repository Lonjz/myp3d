import { Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import type { Blocker } from 'react-router-dom';
import { ConfirmDialog } from './ConfirmDialog';

export function DiscardChangesDialog({ blocker }: { blocker: Blocker }) {
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      icon={TriangleAlert}
      title="Discard changes?"
      cancelLabel="Stay"
      cancelIcon={Undo2}
      confirmLabel="Discard"
      confirmIcon={Trash2}
      tone="danger"
      onCancel={() => blocker.reset?.()}
      onConfirm={() => blocker.proceed?.()}
    />
  );
}
