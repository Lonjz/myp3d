import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backend } from '../fakeBackend';
import { makePlaylist, makeTrack } from '../factories';
import { renderApp } from '../render';

const TITLES = ['Dreams', 'Reckoner', 'Songbird', 'Everlong'];

function seedPlaylist() {
  const tracks = TITLES.map((title) => makeTrack({ title }));
  const playlist = makePlaylist({ name: 'Mix', filenames: tracks.map((track) => track.filename) });
  backend.seed({ tracks, playlists: [playlist] });
  return playlist;
}

const rowTitles = () => screen.getAllByRole('checkbox', { name: /^Select (?!all$)/ }).map((box) => box.getAttribute('aria-label')!.replace('Select ', ''));
const savedTitles = () => backend.store.playlists[0].filenames.map((filename) => backend.store.tracks.find((track) => track.filename === filename)!.title);

async function openPlaylist() {
  const playlist = seedPlaylist();
  const view = renderApp(`/playlists/${playlist.id}`);
  await screen.findByRole('checkbox', { name: 'Select Dreams' });
  return view;
}

describe('PlaylistEditPage', () => {
  it('shows the new name in the sidebar after saving', async () => {
    const { user } = await openPlaylist();
    const sidebar = within(document.querySelector('.details-sidebar') as HTMLElement);
    await sidebar.findByText('1 / 1');

    await user.clear(screen.getByRole('textbox', { name: 'Playlist name' }));
    await user.type(screen.getByRole('textbox', { name: 'Playlist name' }), 'Road Trip');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await sidebar.findByText('Road Trip')).toBeInTheDocument();
    expect(sidebar.queryByText('Mix')).not.toBeInTheDocument();
  });

  it('removes the selected tracks', async () => {
    const { user } = await openPlaylist();
    await user.click(screen.getByRole('checkbox', { name: 'Select Reckoner' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Everlong' }));
    await user.click(await screen.findByRole('button', { name: 'Remove from playlist' }));

    expect(rowTitles()).toEqual(['Dreams', 'Songbird']);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(savedTitles()).toEqual(['Dreams', 'Songbird']));
  });

  it('selects a range with shift-click and moves it to the top', async () => {
    const { user } = await openPlaylist();
    await user.click(screen.getByRole('checkbox', { name: 'Select Songbird' }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Select Everlong' }));
    await user.keyboard('{/Shift}');
    await user.click(await screen.findByRole('button', { name: 'Move to top' }));

    expect(rowTitles()).toEqual(['Songbird', 'Everlong', 'Dreams', 'Reckoner']);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(savedTitles()).toEqual(['Songbird', 'Everlong', 'Dreams', 'Reckoner']));
  });

  it('moves the selected tracks to the bottom', async () => {
    const { user } = await openPlaylist();
    await user.click(screen.getByRole('checkbox', { name: 'Select Dreams' }));
    await user.click(await screen.findByRole('button', { name: 'Move to bottom' }));

    expect(rowTitles()).toEqual(['Reckoner', 'Songbird', 'Everlong', 'Dreams']);
  });

  it('filters the rows, turns off reordering and selects only what is shown', async () => {
    const { user } = await openPlaylist();
    await user.type(screen.getByRole('textbox', { name: 'Filter' }), 'song');

    expect(rowTitles()).toEqual(['Songbird']);
    expect(screen.getByRole('button', { name: 'Move Songbird' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(await screen.findByRole('button', { name: 'Remove from playlist' }));
    await user.click(await screen.findByRole('button', { name: 'Clear filter' }));

    expect(rowTitles()).toEqual(['Dreams', 'Reckoner', 'Everlong']);
  });
});
