const SPOTIFY_LINK = /(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?|spotify:)(?:track|album|playlist)[/:][A-Za-z0-9]{22}/;
const SPOTIFY_TRACK = /(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/g;

export function hasSpotifyLink(value: string): boolean {
  return SPOTIFY_LINK.test(value);
}

export function extractTrackLinks(text: string): string[] {
  const ids = new Set([...text.matchAll(SPOTIFY_TRACK)].map((match) => match[1]));
  return [...ids].map((id) => `https://open.spotify.com/track/${id}`);
}
