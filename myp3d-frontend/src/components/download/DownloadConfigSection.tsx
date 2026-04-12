import { CoverUploadSquare } from '../cover/CoverUploadSquare';

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
}: DownloadConfigSectionProps) {
  const withPrefix = (name: string) => `${idPrefix}${name}`;

  return (
    <div className="download-config-shell">
      <div className="form-group download-url-row">
        <label htmlFor={withPrefix('url')}>YouTube URL *</label>
        <input
          id={withPrefix('url')}
          type="text"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          disabled={disabled}
        />
      </div>

      <div className="download-config-grid">
        <div className="download-meta-column">
          <div className="form-group">
            <label htmlFor={withPrefix('customFilename')}>Custom Filename (optional)</label>
            <input
              id={withPrefix('customFilename')}
              type="text"
              value={customFilename}
              onChange={(event) => onCustomFilenameChange(event.target.value)}
              placeholder="my-song"
              disabled={disabled}
            />
          </div>

          <div className="form-group">
            <label htmlFor={withPrefix('title')}>Title</label>
            <input
              id={withPrefix('title')}
              type="text"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Song Title"
              disabled={disabled}
            />
          </div>

          <div className="form-group">
            <label htmlFor={withPrefix('artist')}>Artist</label>
            <input
              id={withPrefix('artist')}
              type="text"
              value={artist}
              onChange={(event) => onArtistChange(event.target.value)}
              placeholder="Artist Name"
              disabled={disabled}
            />
          </div>

          <div className="form-group">
            <label htmlFor={withPrefix('album')}>Album</label>
            <input
              id={withPrefix('album')}
              type="text"
              value={album}
              onChange={(event) => onAlbumChange(event.target.value)}
              placeholder="Album Name"
              disabled={disabled}
            />
          </div>
        </div>

        <div className="download-cover-column">
          <CoverUploadSquare
            inputId={withPrefix('coverImage')}
            label="Cover Image (optional)"
            previewUrl={coverPreview}
            disabled={disabled}
            onSelectFile={onCoverSelect}
            onClear={onCoverClear}
            emptyText="Click to upload cover"
            helpText="Image is cropped to 500x500."
          />
        </div>
      </div>
    </div>
  );
}
