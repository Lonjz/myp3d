import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backend } from '../fakeBackend';
import { makeTrack } from '../factories';
import { renderApp } from '../render';

const field = (name: string) => screen.getByRole('combobox', { name }) as HTMLInputElement;

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
});
