import { useRef } from 'react';

interface CoverUploadSquareProps {
  inputId: string;
  label: string;
  previewUrl: string | null;
  disabled?: boolean;
  onSelectFile: (file: File) => void;
  onClear: () => void;
  emptyText?: string;
  helpText?: string;
}

export function CoverUploadSquare({
  inputId,
  label,
  previewUrl,
  disabled = false,
  onSelectFile,
  onClear,
  emptyText = 'Click to upload cover',
  helpText,
}: CoverUploadSquareProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    onSelectFile(file);
    event.target.value = '';
  };

  return (
    <div className="cover-upload-panel">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        disabled={disabled}
        className="hidden-file-input"
      />

      <div className="cover-upload-square-wrap">
        <button
          type="button"
          className={`cover-upload-square ${previewUrl ? 'has-image' : ''}`}
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          aria-label={previewUrl ? 'Change cover image' : 'Upload cover image'}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="Selected cover" />
          ) : (
            <span className="cover-upload-placeholder">{emptyText}</span>
          )}
        </button>

        {previewUrl && (
          <button
            type="button"
            className="cover-clear-btn"
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
            disabled={disabled}
            aria-label="Clear selected cover"
            title="Clear cover"
          >
            ×
          </button>
        )}
      </div>

      {helpText && <p className="input-help cover-upload-help">{helpText}</p>}
    </div>
  );
}
