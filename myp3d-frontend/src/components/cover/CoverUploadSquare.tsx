import { useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';

interface CoverUploadSquareProps {
  inputId: string;
  previewUrl: string | null;
  disabled?: boolean;
  onSelectFile: (file: File) => void;
  onClear: () => void;
}

export function CoverUploadSquare({
  inputId,
  previewUrl,
  disabled = false,
  onSelectFile,
  onClear,
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
    <div className="cover-upload-square-wrap">
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        disabled={disabled}
        className="hidden-file-input"
      />

      <button
        type="button"
        className={`cover-upload-square ${previewUrl ? 'has-image' : ''}`}
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label={previewUrl ? 'Change cover' : 'Add cover'}
        title={previewUrl ? 'Change cover' : 'Add cover'}
      >
        {previewUrl ? <img src={previewUrl} alt="" /> : <ImagePlus aria-hidden="true" />}
      </button>

      {previewUrl && (
        <IconButton
          icon={X}
          label="Remove cover"
          size="sm"
          className="cover-clear-btn"
          onClick={(event) => {
            event.stopPropagation();
            onClear();
          }}
          disabled={disabled}
        />
      )}
    </div>
  );
}
