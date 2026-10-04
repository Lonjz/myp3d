import { useEffect, useRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Check, Minus } from 'lucide-react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  indeterminate?: boolean;
}

export function Checkbox({ label, indeterminate = false, className, ...props }: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const Mark = indeterminate ? Minus : Check;

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <span className={['checkbox', className].filter(Boolean).join(' ')}>
      <input ref={inputRef} type="checkbox" aria-label={label} title={label} {...props} />
      <Mark className="checkbox__mark" aria-hidden="true" strokeWidth={3} />
    </span>
  );
}
