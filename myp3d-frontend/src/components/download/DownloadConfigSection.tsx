import type { ReactNode } from 'react';
import { DiscAlbum, FileAudio, Link, MicVocal, Type } from 'lucide-react';
import { CoverUploadSquare } from '../cover/CoverUploadSquare';
import { IconField } from '../ui/IconField';

interface DownloadConfigSectionProps {
  idPrefix?: string;
  disabled?: boolean;
  url: string;
  onUrlChange: (value: string) => void;
  customFilename: string;
  onCustomFilenameChange: (value: string) => void;
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
        value={customFilename}
        onChange={(event) => onCustomFilenameChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
