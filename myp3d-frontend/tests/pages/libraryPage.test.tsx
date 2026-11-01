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

  it('keeps the selection after adding to a playlist', async () => {
    seedLibrary();
    const { user } = renderApp('/library');
    await user.click(await screen.findByRole('checkbox', { name: 'Select Reckoner' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Dreams' }));
    await user.click(await screen.findByRole('button', { name: 'Add to playlist' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add 2 tracks to a playlist' });
    await user.type(within(dialog).getByRole('textbox', { name: 'New playlist' }), 'Road Trip');
    await user.click(within(dialog).getByRole('button', { name: 'Create playlist' }));

    await waitFor(() => expect(backend.store.playlists.map((playlist) => playlist.name)).toEqual(['Road Trip']));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Select Reckoner' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Dreams' })).toBeChecked();
  });

  it('keeps the selection with fresh tags after a bulk edit', async () => {
    seedLibrary();
    const { user } = renderApp('/library');
    await user.click(await screen.findByRole('checkbox', { name: 'Select Dreams' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Songbird' }));
    await user.click(await screen.findByRole('button', { name: 'Edit selected' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit 2 tracks' });
    const artist = within(dialog).getByRole('textbox', { name: 'Artist' });
    await user.clear(artist);
    await user.type(artist, 'Stevie Nicks');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Select Dreams' })).toBeChecked();
    await waitFor(() => expect(backend.requestsTo('GET', '/mp3s/all').length).toBeGreaterThan(0));
    await user.click(await screen.findByRole('button', { name: 'Edit selected' }));
    const reopened = await screen.findByRole('dialog', { name: 'Edit 2 tracks' });
    expect(within(reopened).getByRole('textbox', { name: 'Artist' })).toHaveValue('Stevie Nicks');
  });
});
