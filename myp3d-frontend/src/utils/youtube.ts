const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];
const IFRAME_API_SCRIPT_ID = 'youtube-iframe-api';

export interface YouTubePlayer {
  destroy?: () => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
}

interface YouTubePlayerOptions {
  videoId: string;
  height: string;
  width: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady: () => void;
    onStateChange: (event: { data: number }) => void;
    onError: () => void;
  };
}

interface YouTubeApi {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
}

type YouTubeWindow = Window & {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

let iframeApi: Promise<YouTubeApi> | null = null;

export function loadYouTubeApi(): Promise<YouTubeApi> {
  const youtubeWindow = window as YouTubeWindow;
  if (youtubeWindow.YT?.Player) return Promise.resolve(youtubeWindow.YT);
  if (iframeApi) return iframeApi;

  iframeApi = new Promise<YouTubeApi>((resolve, reject) => {
    if (!document.getElementById(IFRAME_API_SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = IFRAME_API_SCRIPT_ID;
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('Failed to load YouTube preview'));
      document.body.appendChild(script);
    }

    const previousReady = youtubeWindow.onYouTubeIframeAPIReady;
    youtubeWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      const ready = youtubeWindow.YT;
      if (ready?.Player) {
        resolve(ready);
      } else {
        reject(new Error('YouTube preview unavailable'));
      }
    };
  });

  return iframeApi;
}

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
