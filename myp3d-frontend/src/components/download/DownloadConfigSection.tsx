import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, DiscAlbum, FileAudio, Link, LoaderCircle, MicVocal, Type } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CoverUploadSquare } from '../cover/CoverUploadSquare';
import { IconField } from '../ui/IconField';
import type { FilenameStatus } from '../../hooks/useDownloadForm';
import { normalizeFilenameInput } from '../../utils/filenames';

const FILENAME_STATUS: Record<Exclude<FilenameStatus, null>, { icon: LucideIcon; label: string }> = {
  checking: { icon: LoaderCircle, label: 'Checking file name' },
  available: { icon: CircleCheck, label: 'File name available' },
  taken: { icon: CircleAlert, label: 'File name taken' },
};

function FilenameStatusIcon({ status }: { status: FilenameStatus }) {
  if (!status) return null;
  const { icon: Icon, label } = FILENAME_STATUS[status];
  return (
    <span className={`filename-status filename-status--${status}`} role="status" aria-label={label} title={label}>
      <Icon aria-hidden="true" />
    </span>
  );
}

interface DownloadConfigSectionProps {
  idPrefix?: string;
  disabled?: boolean;
  url: string;
  onUrlChange: (value: string) => void;
  customFilename: string;
  onCustomFilenameChange: (value: string) => void;
  filenameStatus?: FilenameStatus;
  title: string;
  onTitleChange: (value: string) => void;
  artist: string;
  onArtistChange: (value: string) => void;
  album: string;
  onAlbumChange: (value: string) => void;
  coverPreview: string | null;
  onCoverSelect: (file: File) => void;
  onCoverClear: () => void;
  action?: ReactNode;
}

export function DownloadConfigSection({
  idPrefix = '',
  disabled = false,
  url,
  onUrlChange,
  customFilename,
  onCustomFilenameChange,
  filenameStatus = null,
  title,
  onTitleChange,
  artist,
  onArtistChange,
  album,
  onAlbumChange,
  coverPreview,
  onCoverSelect,
  onCoverClear,
  action,
}: DownloadConfigSectionProps) {
  return (
    <div className="download-config-grid">
      <div className="download-cover">
        <CoverUploadSquare
          inputId={`${idPrefix}coverImage`}
          previewUrl={coverPreview}
          disabled={disabled}
          onSelectFile={onCoverSelect}
          onClear={onCoverClear}
        />
      </div>

      <div className="download-url-row">
        <IconField
          icon={Link}
          label="YouTube URL"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          disabled={disabled}
        />
        {action}
      </div>

      <IconField
        icon={Type}
        label="Title"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        disabled={disabled}
      />
      <IconField
        icon={MicVocal}
        label="Artist"
        value={artist}
        onChange={(event) => onArtistChange(event.target.value)}
        disabled={disabled}
      />
      <IconField
        icon={DiscAlbum}
        label="Album"
        value={album}
        onChange={(event) => onAlbumChange(event.target.value)}
        disabled={disabled}
      />
      <IconField
        icon={FileAudio}
        label="File name"
        className={filenameStatus === 'taken' ? 'is-taken' : undefined}
        value={customFilename}
        onChange={(event) => onCustomFilenameChange(normalizeFilenameInput(event.target.value))}
        aria-invalid={filenameStatus === 'taken'}
        disabled={disabled}
        trailing={<FilenameStatusIcon status={filenameStatus} />}
      />
    </div>
  );
}
