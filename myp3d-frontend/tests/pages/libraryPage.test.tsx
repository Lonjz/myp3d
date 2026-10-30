import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backend } from '../fakeBackend';
import { makeTrack } from '../factories';
import { renderApp } from '../render';

const rowTitles = () => screen.getAllByRole('checkbox', { name: /^Select (?!all$)/ }).map((box) => box.getAttribute('aria-label')!.replace('Select ', ''));

function seedLibrary() {
  backend.seed({
    tracks: [
      makeTrack({ title: 'Dreams', artist: 'Fleetwood Mac', album: 'Rumours' }),
      makeTrack({ title: 'Reckoner', artist: 'Radiohead', album: 'In Rainbows' }),
      makeTrack({ title: 'Songbird', artist: 'Fleetwood Mac', album: 'Rumours' }),
    ],
  });
}

describe('LibraryPage', () => {
  it('lists the library', async () => {
    seedLibrary();
    renderApp('/library');
    await screen.findByRole('button', { name: 'Play Reckoner' });
    expect(rowTitles()).toEqual(expect.arrayContaining(['Dreams', 'Reckoner', 'Songbird']));
  });

  it('searches as you type', async () => {
    seedLibrary();
    const { user } = renderApp('/library');
    await screen.findByRole('button', { name: 'Play Reckoner' });

    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'fleetwood');
    await waitFor(() => expect(rowTitles().sort()).toEqual(['Dreams', 'Songbird']));
    expect(backend.requestsTo('GET', '/mp3s/paged').at(-1)!.path).toContain('search=fleetwood');
  });

  it('selects rows and deletes them', async () => {
    seedLibrary();
    const { user } = renderApp('/library');
    await user.click(await screen.findByRole('checkbox', { name: 'Select Reckoner' }));
    await user.click(await screen.findByRole('button', { name: 'Delete selected' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(backend.store.tracks.map((track) => track.title)).toEqual(['Dreams', 'Songbird']));
  });
});
