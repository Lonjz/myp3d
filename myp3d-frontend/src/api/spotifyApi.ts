import { apiFetch, jsonInit } from './mp3Api';

export interface SpotifyTrackRef {
  id: string;
  name: string;
  subtitle: string;
  duration: number | null;
  explicit: boolean;
  album: string | null;
  cover_url: string | null;
}

export interface SpotifyResolveResult {
  tracks: SpotifyTrackRef[];
  truncated: boolean;
  skipped: number;
}

export interface SpotifyTrack {
  id: string;
  url: string;
  name: string;
  artists: string[];
  album: string | null;
  duration: number | null;
  explicit: boolean;
  cover_url: string | null;
}

export interface SpotifyCandidate {
  video_id: string;
  url: string;
  title: string;
  artists: string[];
  album: string | null;
  duration: number | null;
  thumbnail_url: string | null;
  explicit: boolean | null;
  kind: 'song' | 'video';
  score: number;
}

export interface SpotifyTrackMatch {
  track: SpotifyTrack;
  title: string;
  artist: string | null;
  filename: string | null;
  in_library: boolean;
  candidates: SpotifyCandidate[];
}

export const spotifyApi = {
  resolve(text: string): Promise<SpotifyResolveResult> {
    return apiFetch('/spotify/resolve', jsonInit('POST', { text }), 'Failed to read the Spotify links');
  },

  matchTrack(id: string, album?: string | null): Promise<SpotifyTrackMatch> {
    const query = album ? `?${new URLSearchParams({ album }).toString()}` : '';
    return apiFetch(`/spotify/tracks/${encodeURIComponent(id)}${query}`, undefined, 'Failed to match the song');
  },
};
