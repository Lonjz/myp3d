export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
}

export function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const totalSeconds = Math.max(0, Math.round(value * 10) / 10);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secondsRaw = totalSeconds % 60;
  const secondsWhole = Math.floor(secondsRaw);
  const fractional = Math.round((secondsRaw - secondsWhole) * 10);
  const secondsLabel = fractional
    ? `${String(secondsWhole).padStart(2, '0')}.${fractional}`
    : String(secondsWhole).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${secondsLabel}`;
  }
  return `${minutes}:${secondsLabel}`;
}
