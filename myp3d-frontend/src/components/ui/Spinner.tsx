import { LoaderCircle } from 'lucide-react';

export function Spinner({ inline = false }: { inline?: boolean }) {
  return (
    <div className={inline ? 'spinner spinner--inline' : 'spinner'} role="status" aria-label="Loading">
      <LoaderCircle aria-hidden="true" size={inline ? 16 : 28} />
    </div>
  );
}
