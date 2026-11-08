import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backend } from '../fakeBackend';
import { albumKeyOf, makeTrack } from '../factories';
import { renderApp } from '../render';

const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: /save/i });

describe('EditPage', () => {
  it('saves edited tags', async () => {
    backend.seed({ tracks: [makeTrack({ title: 'The Chain', filename: 'the chain.mp3' })] });
    const { user } = renderApp('/details/the chain.mp3');

    await screen.findByDisplayValue('The Chain');
    await user.clear(field('Artist'));
    await user.type(field('Artist'), 'Daft Punk');
    await user.click(saveButton());

    await waitFor(() => expect(backend.store.tracks[0].artist).toBe('Daft Punk'));
    const [put] = backend.requestsTo('PUT', '/mp3s/the chain.mp3/metadata');
    expect(put.body).toMatchObject({ title: 'The Chain', artist: 'Daft Punk' });
  });

  it('clears a tag when its field is emptied', async () => {
    backend.seed({ tracks: [makeTrack({ title: 'The Chain', filename: 'the chain.mp3' })] });
    const { user } = renderApp('/details/the chain.mp3');

    await screen.findByDisplayValue('Rumours');
    await user.clear(field('Album'));
    await user.click(saveButton());

    await waitFor(() => expect(backend.requestsTo('PUT', '/mp3s/the chain.mp3/metadata')).toHaveLength(1));
    const [put] = backend.requestsTo('PUT', '/mp3s/the chain.mp3/metadata');
    expect(put.body).toMatchObject({ title: 'The Chain', album: '' });
  });

  it('shows the new title in the sidebar after saving', async () => {
    backend.seed({ tracks: [makeTrack({ title: 'Old Name', filename: 'song.mp3' })] });
    const { user } = renderApp('/details/song.mp3');

    await screen.findByDisplayValue('Old Name');
    const sidebar = within(document.querySelector('.details-sidebar') as HTMLElement);
    await sidebar.findByText('1 / 1');
    await user.clear(field('Title'));
    await user.type(field('Title'), 'New Name');
    await user.click(saveButton());

    expect(await sidebar.findByText('New Name')).toBeInTheDocument();
    expect(sidebar.queryByText('Old Name')).not.toBeInTheDocument();
  });

  it('renames the file and goes back to the library', async () => {
    backend.seed({ tracks: [makeTrack({ title: 'The Chain', filename: 'the chain.mp3' })] });
    const { user, router } = renderApp('/details/the chain.mp3');

    await screen.findByDisplayValue('The Chain');
    await user.clear(field('File name'));
    await user.type(field('File name'), 'Deep Water!');
    expect(field('File name').value).toBe('deep water');
    await user.click(saveButton());

    await waitFor(() => expect(backend.store.tracks[0].filename).toBe('deep water.mp3'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'), { timeout: 3000 });
  });

  it('shows a missing track', async () => {
    renderApp('/details/missing.mp3');
    expect(await screen.findByRole('status', { name: 'Track not found' })).toBeInTheDocument();
  });

  it('never saves one track onto another while switching', async () => {
    backend.seed({
      tracks: [makeTrack({ title: 'First', filename: 'first.mp3' }), makeTrack({ title: 'Second', filename: 'second.mp3' })],
    });
    const { user, router } = renderApp('/details/first.mp3');
    await screen.findByDisplayValue('First');

    const release = backend.hold('GET', '/mp3s/second.mp3/info');
    await act(() => router.navigate('/details/second.mp3'));
    if (!saveButton().hasAttribute('disabled')) await user.click(saveButton());
    release();

    await waitFor(() => expect(backend.requestsTo('GET', '/mp3s/second.mp3/info')).toHaveLength(1));
    expect(backend.requestsTo('PUT', '/mp3s/second.mp3')).toEqual([]);
    expect(backend.store.tracks.map((track) => track.title)).toEqual(['First', 'Second']);
    expect(await screen.findByDisplayValue('Second')).toBeInTheDocument();
  });
});

describe('AlbumEditPage and PlaylistEditPage', () => {
  it('keep Save off until something changes and save to the right album', async () => {
    backend.seed({ tracks: [makeTrack({ album: 'Rumours' }), makeTrack({ album: 'In Rainbows' })] });
    const { user, router } = renderApp(`/albums/${albumKeyOf('Rumours')}`);
    await screen.findByDisplayValue('Rumours');
    expect(saveButton()).toBeDisabled();

    const release = backend.hold('GET', `/albums/${albumKeyOf('In Rainbows')}`);
    await act(() => router.navigate(`/albums/${albumKeyOf('In Rainbows')}`));
    expect(saveButton()).toBeDisabled();
    release();
    await screen.findByDisplayValue('In Rainbows');

    await user.type(field('Album name'), ' II');
    await user.click(saveButton());
    await waitFor(() => expect(backend.requestsTo('PUT', `/albums/${albumKeyOf('In Rainbows')}`)).toHaveLength(1));
    expect(backend.requestsTo('PUT', `/albums/${albumKeyOf('Rumours')}`)).toEqual([]);
  });

  it('shows a missing playlist', async () => {
    renderApp('/playlists/0123456789abcdef0123456789abcdef');
    expect(await screen.findByRole('status', { name: 'Playlist not found' })).toBeInTheDocument();
  });
});
