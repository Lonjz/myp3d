import { useRef } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { ImagePlus } from 'lucide-react';
import { cx } from '../../utils/formatters';

interface CoverEditButtonProps {
  label: string;
  src: string | null;
  placeholder: ReactNode;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
}

export function CoverEditButton({ label, src, placeholder, onFileChange, disabled, className }: CoverEditButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input type="file" accept="image/*" ref={inputRef} onChange={onFileChange} className="hidden-file-input" />
      <button
        type="button"
        className={cx('cover-preview', className)}
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label={label}
        title={label}
      >
        {src ? <img src={src} alt="" /> : placeholder}
        <span className="cover-preview__overlay" aria-hidden="true">
          <ImagePlus />
        </span>
      </button>
    </>
  );
}
