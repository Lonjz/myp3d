import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AudioLines, DatabaseBackup, DatabaseZap, FileDown, FileUp, Laptop, RotateCcw } from 'lucide-react';
import { systemApi } from '../../api/systemApi';
import { useClearCache } from '../../hooks/useClearCache';
import { useDetail } from '../../hooks/useDetail';
import { startDownload } from '../../utils/download';
import { useToast } from '../messages/toastContext';
import { LoadFailed } from '../ui/EmptyState';
import { IconButton } from '../ui/IconButton';
import { parseAppearance } from './appearance';
import { useAppearance } from './appearanceContext';
import { SettingsRow } from './SettingsRow';

const SETTINGS_FILENAME = 'myp3d-settings.json';
const SYSTEM_KEY = 'system';
const PLACEHOLDER = '–';
const noop = () => undefined;

export function DataSection({ onReset }: { onReset: () => void }) {
  const { appearance, replace } = useAppearance();
  const { showSuccess, showError } = useToast();
  const clearCache = useClearCache();
  const [clearing, setClearing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const system = useDetail(SYSTEM_KEY, () => systemApi.info(), noop, noop);

  const handleClearCache = async () => {
    setClearing(true);
    await clearCache();
    setClearing(false);
  };

  const handleExport = () => {
    const json = encodeURIComponent(JSON.stringify(appearance, null, 2));
    startDownload(`data:application/json;charset=utf-8,${json}`, SETTINGS_FILENAME);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    let contents: string;
    try {
      contents = await file.text();
    } catch {
      showError(`Couldn't read ${file.name}`);
      return;
    }
    const imported = parseAppearance(contents);
    if (!imported) {
      showError('Not a settings file');
      return;
    }
    replace(imported);
    showSuccess('Settings imported');
  };

  return (
    <div className="settings-section">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden-file-input"
        aria-label="Settings file"
        onChange={(event) => void handleImport(event)}
      />
      <SettingsRow icon={DatabaseBackup} label="Back up database" hint="Playlists, favourites and the queue">
        <IconButton icon={DatabaseBackup} label="Back up database" onClick={systemApi.downloadBackup} />
      </SettingsRow>
      <SettingsRow icon={DatabaseZap} label="Clear cache" hint="Refreshes covers and library data">
        <IconButton icon={DatabaseZap} label="Clear cache" busy={clearing} disabled={clearing} onClick={() => void handleClearCache()} />
      </SettingsRow>
      <SettingsRow icon={FileDown} label="Export settings" hint="Saves your appearance to a file">
        <IconButton icon={FileDown} label="Export settings" onClick={handleExport} />
      </SettingsRow>
      <SettingsRow icon={FileUp} label="Import settings" hint="Loads appearance from a file">
        <IconButton icon={FileUp} label="Import settings" onClick={() => fileInputRef.current?.click()} />
      </SettingsRow>
      <SettingsRow icon={RotateCcw} label="Reset appearance" hint="Back to defaults, removes the picture">
        <IconButton icon={RotateCcw} label="Reset appearance" variant="danger" onClick={onReset} />
      </SettingsRow>

      <h3 className="settings-heading">About</h3>

      {system.failed ? (
        <LoadFailed compact label="Couldn't load app details" onRetry={() => void system.reload()} />
      ) : (
        <>
          <SettingsRow icon={AudioLines} label="App version">
            <span className="settings-value">{system.detail?.version ?? PLACEHOLDER}</span>
          </SettingsRow>
          <SettingsRow icon={Laptop} label="Device name" hint="How other devices see this one">
            <span className="settings-value">{system.detail?.device_name ?? PLACEHOLDER}</span>
          </SettingsRow>
        </>
      )}
    </div>
  );
}
