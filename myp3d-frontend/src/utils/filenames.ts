export function normalizeFilenameInput(value: string): string {
  return value.replace(/[^a-z0-9 ]/gi, '').toLowerCase();
}

export function stripMp3Extension(filename: string): string {
  return filename.replace(/\.mp3$/i, '');
}
