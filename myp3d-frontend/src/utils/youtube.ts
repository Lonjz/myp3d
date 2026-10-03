const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];

export function getVideoIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '');
    }
    return parsed.searchParams.get('v') || '';
  } catch {
    return '';
  }
}

export function isYouTubeUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.replace(/^(www|m|music)\./, '');
    return YOUTUBE_HOSTS.includes(host) && Boolean(getVideoIdFromUrl(parsed.href));
  } catch {
    return false;
  }
}

export function getYouTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}
