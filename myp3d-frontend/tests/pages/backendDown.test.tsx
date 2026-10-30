import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backend } from '../fakeBackend';
import { makeQueueItem, makeTrack } from '../factories';
import { renderApp } from '../render';

describe('when the backend is unreachable', () => {
  it('the dashboard offers a retry that recovers', async () => {
    backend.down();
    const { user } = renderApp('/dashboard');
    const retry = await screen.findByRole('button', { name: /retry/i }, { timeout: 3000 });
    backend.up();
    await user.click(retry);
    await waitFor(() => expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument(), { timeout: 3000 });
  });

  it('the downloads page offers a retry', async () => {
    backend.seed({ queue: [makeQueueItem({ title: 'Waiting Song' })] });
    backend.down();
    const { user } = renderApp('/downloads');
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
    backend.up();
    await user.click(retry);
    expect(await screen.findByText('Waiting Song')).toBeInTheDocument();
  });

  it.each([
    ['/library', "Couldn't load the library"],
    ['/albums', "Couldn't load albums"],
    ['/playlists', "Couldn't load playlists"],
    ['/details/Song.mp3', "Couldn't load the song"],
    ['/albums/some-album', "Couldn't load the album"],
    ['/playlists/1', "Couldn't load the playlist"],
  ])('%s shows the shared retry card', async (path, label) => {
    backend.down();
    renderApp(path);
    expect(await screen.findByRole('status', { name: label })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('says so once in the banner instead of a toast', async () => {
    backend.down();
    renderApp('/library');
    expect(await screen.findByRole('alert')).toHaveAttribute('title', expect.stringMatching(/can't reach/i));
    expect(screen.queryByText(/can't reach/i)).not.toBeInTheDocument();
  });

  it('the library recovers on retry', async () => {
    backend.seed({ tracks: [makeTrack({ title: 'Back Again' })] });
    backend.down();
    const { user } = renderApp('/library');
    const retry = await screen.findByRole('button', { name: 'Retry' });
    backend.up();
    await user.click(retry);
    expect(await screen.findByText('Back Again')).toBeInTheDocument();
  });
});

describe('a missing item', () => {
  it('reads as not found, not as a failed load', async () => {
    renderApp('/details/Gone.mp3');
    expect(await screen.findByRole('status', { name: 'Track not found' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});

describe('the download form', () => {
  it('does not call a name free when it could not check', async () => {
    const { user } = renderApp('/query');
    backend.down();
    await user.type(await screen.findByRole('textbox', { name: /file name/i }), 'some song');
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByTitle(/available/i)).not.toBeInTheDocument();
  });
});
