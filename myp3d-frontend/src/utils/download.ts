export function startDownload(href: string, filename?: string): void {
  const link = document.createElement('a');
  link.href = href;
  if (filename) link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
