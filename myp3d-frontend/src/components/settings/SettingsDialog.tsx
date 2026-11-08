import { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { usePresence } from '../../hooks/usePresence';
import { subscribeAppEvent } from '../../utils/appEvents';
import { isEditableTarget } from '../../utils/keyboard';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { IconButton } from '../ui/IconButton';
import { Modal } from '../ui/Modal';
import { SegmentedControl } from '../ui/SegmentedControl';
import type { SegmentOption } from '../ui/SegmentedControl';
import { useAppearance } from './appearanceContext';
import { AppearanceSection } from './AppearanceSection';
import { DataSection } from './DataSection';
import { ShortcutsSection } from './ShortcutsSection';

type SettingsTab = 'appearance' | 'data' | 'shortcuts';

const TAB_OPTIONS: readonly SegmentOption<SettingsTab>[] = [
  { value: 'appearance', label: 'Appearance', text: 'Appearance' },
  { value: 'data', label: 'Data', text: 'Data' },
  { value: 'shortcuts', label: 'Shortcuts', text: 'Shortcuts' },
];

interface SettingsPanelProps {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  closing: boolean;
  onClose: () => void;
}

function SettingsPanel({ tab, onTabChange, closing, onClose }: SettingsPanelProps) {
  const { reset } = useAppearance();
  const [confirmingReset, setConfirmingReset] = useState(false);

  const handleReset = () => {
    setConfirmingReset(false);
    void reset();
  };

  return (
    <Modal className="settings-dialog" closing={closing} locked={confirmingReset} onClose={onClose} label="Settings">
      <div className="settings-dialog__header">
        <SegmentedControl label="Settings section" options={TAB_OPTIONS} value={tab} onChange={onTabChange} />
        <IconButton icon={X} label="Close" variant="ghost" onClick={onClose} />
      </div>
      <div className="settings-dialog__body">
        {tab === 'appearance' && <AppearanceSection />}
        {tab === 'data' && <DataSection onReset={() => setConfirmingReset(true)} />}
        {tab === 'shortcuts' && <ShortcutsSection />}
      </div>
      <ConfirmDialog
        open={confirmingReset}
        icon={RotateCcw}
        title="Reset appearance?"
        confirmLabel="Reset"
        confirmIcon={RotateCcw}
        cancelLabel="Keep"
        cancelIcon={X}
        tone="danger"
        onConfirm={handleReset}
        onCancel={() => setConfirmingReset(false)}
      />
    </Modal>
  );
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = usePersistentState<SettingsTab>('settings:tab', 'appearance');
  const { mounted, closing } = usePresence(open);

  useEffect(() => subscribeAppEvent('show-settings', () => setOpen(true)), []);

  useEffect(
    () =>
      subscribeAppEvent('show-shortcuts', () => {
        setTab('shortcuts');
        setOpen(true);
      }),
    [setTab],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      event.preventDefault();
      if (open) {
        setOpen(false);
        return;
      }
      setTab('shortcuts');
      setOpen(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, setTab]);

  if (!mounted) return null;

  return <SettingsPanel tab={tab} onTabChange={setTab} closing={closing} onClose={() => setOpen(false)} />;
}
