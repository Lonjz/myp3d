import { describe, expect, it } from 'vitest';
import { normalizeFilenameInput, stripMp3Extension } from '../../src/utils/filenames';
import { formatBytes, formatDuration, formatHours, formatTrackSubtitle } from '../../src/utils/formatters';
import { matchScore } from '../../src/utils/matchScore';
import { extractTrackLinks, hasSpotifyLink } from '../../src/utils/spotify';
import { getVideoIdFromUrl, isYouTubeUrl } from '../../src/utils/youtube';

describe('formatters', () => {
  it('formats sizes and lengths', () => {
    expect([formatBytes(512), formatBytes(2048), formatBytes(5 * 1024 * 1024)]).toEqual(['512 B', '2.0 KB', '5.0 MB']);
    expect([formatDuration(65), formatDuration(3725), formatDuration(9.5), formatDuration(null)]).toEqual(['1:05', '1:02:05', '0:09.5', '-']);
    expect([formatHours(1800), formatHours(5400)]).toEqual(['30 min', '1.5 hrs']);
    expect(formatTrackSubtitle('Artist', null)).toBe('Artist');
    expect(formatTrackSubtitle('Artist', 'Album')).toBe('Artist · Album');
  });
});

describe('filenames', () => {
  it('keeps only lowercase letters, numbers and spaces', () => {
    expect(normalizeFilenameInput('Héllo, World! 2')).toBe('hllo world 2');
    expect(stripMp3Extension('song.MP3')).toBe('song');
  });
});

describe('matchScore', () => {
  it('ranks exact, prefix, word and substring matches', () => {
    const score = (query: string) => matchScore(query, ['Instant Crush', 'Daft Punk']);
    expect(matchScore('Reckoner', ['reckoner'])).toBe(0);
    expect(score('instant')!).toBeLessThan(score('crush')!);
    expect(score('crush')!).toBeLessThan(score('stant')!);
    expect(score('instant xyz')).toBeNull();
    expect(score('   ')).toBeNull();
    expect(matchScore('daft', ['Daft Punk', 'x'])!).toBeLessThan(matchScore('daft', ['x', 'Daft Punk'])!);
  });
});

describe('links', () => {
  it('recognises YouTube links', () => {
    expect(getVideoIdFromUrl('https://youtu.be/abc123')).toBe('abc123');
    expect(getVideoIdFromUrl('https://www.youtube.com/watch?v=xyz&t=3')).toBe('xyz');
    expect(isYouTubeUrl('https://music.youtube.com/watch?v=xyz')).toBe(true);
    expect(isYouTubeUrl('https://www.youtube.com/')).toBe(false);
    expect(isYouTubeUrl('not a url')).toBe(false);
  });

  it('recognises Spotify links', () => {
    const id = '4uLU6hMCjMI75M1A2tKUQC';
    expect(hasSpotifyLink(`https://open.spotify.com/intl-de/album/${id}`)).toBe(true);
    expect(hasSpotifyLink('https://open.spotify.com/artist/x')).toBe(false);
    expect(extractTrackLinks(`spotify:track:${id} https://open.spotify.com/track/${id}?si=1`)).toEqual([`https://open.spotify.com/track/${id}`]);
  });
});
