import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backend } from '../fakeBackend';
import { makeTrack, makeYouTubeResult } from '../factories';
import { renderApp } from '../render';

const field = (name: string) => screen.getByRole('combobox', { name }) as HTMLInputElement;
const textbox = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;
const SEARCH = 'Search songs or paste a playlist';
const COVER = 'https://lh3.googleusercontent.com/money=w544-h544-l90-rj';

describe('QueryPage', () => {
  it('suggests artists from the library', async () => {
    backend.seed({ tracks: [makeTrack({ artist: 'Fleetwood Mac' }), makeTrack({ artist: 'Frank Ocean' })] });
    const { user } = renderApp('/query');

    await waitFor(() => expect(backend.requestsTo('GET', '/mp3s/names')).toHaveLength(1));
    await user.type(field('Artist'), 'fle');
    await user.click(await screen.findByRole('option', { name: /Fleetwood Mac/ }));

    expect(field('Artist').value).toBe('Fleetwood Mac');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('fills every tag from a YouTube Music song', async () => {
    backend.seed({ songs: [{ title: 'Money Trees (feat. Jay Rock)', artist: 'Kendrick Lamar', album: 'good kid, m.A.A.d city' }] });
    const { user } = renderApp('/query');

    await user.type(field('Title'), 'money');
    await screen.findByRole('option', { name: /Money Trees/ });
    await user.keyboard('{ArrowDown}{Enter}');

    expect(field('Title').value).toBe('Money Trees (feat. Jay Rock)');
    expect(field('Artist').value).toBe('Kendrick Lamar');
    expect(field('Album').value).toBe('good kid, m.A.A.d city');
    expect(backend.requestsTo('GET', '/youtube/songs').length).toBeGreaterThan(0);
  });

  it('lists a playlist link and queues the songs not in the library', async () => {
    backend.seed({
      ytPlaylists: {
        PLmix: {
          title: 'Road Trip',
          unavailable: 1,
          tracks: [
            makeYouTubeResult({ title: 'Owned', in_library: true }),
            makeYouTubeResult({ title: 'Nights', cover_url: COVER }),
            makeYouTubeResult({ title: 'Ivy' }),
          ],
        },
      },
    });
    const { user } = renderApp('/query');

    await user.type(textbox(SEARCH), 'https://music.youtube.com/playlist?list=PLmix{Enter}');
    expect(await screen.findByText('Road Trip')).toBeInTheDocument();
    expect(screen.getByLabelText('1 unavailable song skipped')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Queue Owned' })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Add 2 songs to the queue' }));
    await waitFor(() => expect(backend.requestsTo('POST', '/queue')).toHaveLength(1));
    const [post] = backend.requestsTo('POST', '/queue');
    expect((post.body as { items: unknown[] }).items).toEqual([
      expect.objectContaining({ title: 'Nights', custom_filename: 'nights', cover_url: COVER }),
      expect.objectContaining({ title: 'Ivy', custom_filename: 'ivy' }),
    ]);
    expect(await screen.findAllByLabelText('Queued')).toHaveLength(2);
  });

  it('fills tags, file name and cover from a song and downloads with them', async () => {
    backend.seed({
      youtube: [makeYouTubeResult({ title: 'Money Trees (feat. Jay Rock)', artist: 'Kendrick Lamar', album: 'good kid, m.A.A.d city', filename: 'money trees', cover_url: COVER })],
    });
    const { user } = renderApp('/query');

    await user.type(textbox(SEARCH), 'money trees{Enter}');
    await user.click(await screen.findByRole('button', { name: /Money Trees/ }));

    expect(field('Title').value).toBe('Money Trees (feat. Jay Rock)');
    expect(field('Artist').value).toBe('Kendrick Lamar');
    expect(textbox('File name').value).toBe('money trees');
    expect(screen.getByRole('button', { name: 'Change cover' }).querySelector('img')).toHaveAttribute('src', COVER);

    await user.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(backend.requestsTo('POST', '/download')).toHaveLength(1));
    expect(backend.requestsTo('POST', '/download')[0].body).toMatchObject({ custom_filename: 'money trees', cover_url: COVER });
  });

  it('shows an artist, opens one of their albums and goes back', async () => {
    backend.seed({
      ytArtists: {
        'Daft Punk': {
          name: 'Daft Punk',
          songs: [makeYouTubeResult({ title: 'One More Time', artist: 'Daft Punk' })],
          releases: [{ browse_id: 'MPREb_discovery', title: 'Discovery', year: '2001', kind: 'album', thumbnail_url: null, in_library: true }],
        },
      },
      ytAlbums: { MPREb_discovery: { title: 'Discovery', unavailable: 0, tracks: [makeYouTubeResult({ title: 'Aerodynamic', artist: 'Daft Punk' })] } },
    });
    const { user } = renderApp('/query?artist=Daft%20Punk');

    expect(await screen.findByRole('button', { name: /One More Time/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Albums and singles' }));
    expect(screen.getByLabelText('Album in library')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Discovery/ }));
    expect(await screen.findByRole('button', { name: /Aerodynamic/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to Daft Punk' }));
    expect(await screen.findByRole('button', { name: /Discovery/ })).toBeInTheDocument();
    expect(backend.requestsTo('GET', '/youtube/artist')).toHaveLength(1);
  });

  it('offers a retry when similar songs fail to load', async () => {
    backend.seed({ ytSimilar: { 'nights.mp3': { title: 'Nights', unavailable: 0, tracks: [makeYouTubeResult({ title: 'Pink + White' })] } } });
    backend.fail('GET', '/youtube/similar', 502, "Couldn't reach YouTube Music");
    const { user } = renderApp('/query?similar=nights.mp3');

    expect(await screen.findByRole('status', { name: "Couldn't reach YouTube Music" })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: /Pink \+ White/ })).toBeInTheDocument();
    expect(screen.getByTitle('Similar to Nights')).toBeInTheDocument();
  });
});
