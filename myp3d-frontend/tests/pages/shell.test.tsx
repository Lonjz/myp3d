import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { backend } from '../fakeBackend';
import { makeQueueItem, makeTrack } from '../factories';
import { renderApp } from '../render';

describe('app shell', () => {
  it('shows one offline banner and clears it when the backend returns', async () => {
    backend.seed({ tracks: [makeTrack({ title: 'Dreams' })] });
    backend.down();
    renderApp('/library');
    await screen.findByText('Offline');
    expect(screen.getAllByText('Offline')).toHaveLength(1);
    expect(screen.getByText('Offline').closest('[role="alert"]')).not.toBeNull();

    backend.up();
    await waitFor(() => expect(screen.queryByText('Offline')).not.toBeInTheDocument(), { timeout: 4000 });
    expect(await screen.findByRole('checkbox', { name: 'Select Dreams' })).toBeInTheDocument();
  });

  it('skips entrance animations when returning to a page', async () => {
    backend.seed({ tracks: [makeTrack({ title: 'Dreams' })] });
    const entrance = { effect: { getComputedTiming: () => ({ endTime: 460 }) }, finish: vi.fn() };
    const looping = { effect: { getComputedTiming: () => ({ endTime: Infinity }) }, finish: vi.fn() };
    const getAnimations = vi.spyOn(Element.prototype, 'getAnimations').mockReturnValue([entrance, looping] as unknown as Animation[]);
    const { router } = renderApp('/library');
    await screen.findByRole('checkbox', { name: 'Select Dreams' });
    expect(entrance.finish).not.toHaveBeenCalled();

    await act(() => router.navigate('/dashboard'));
    await waitFor(() => expect(document.querySelector('.dashboard')).not.toBeNull(), { timeout: 5000 });
    await act(() => router.navigate('/library'));

    expect(entrance.finish).toHaveBeenCalledTimes(1);
    expect(looping.finish).not.toHaveBeenCalled();
    getAnimations.mockRestore();
  });

  it('shows a page for unknown addresses', async () => {
    const { user, router } = renderApp('/nowhere');
    expect(await screen.findByRole('status', { name: 'Page not found' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to the dashboard' }));
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it('lists the keyboard shortcuts on ?', async () => {
    const { user } = renderApp('/dashboard');
    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Play or pause')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument());
  });

  it('saves the edit page with Ctrl+S', async () => {
    backend.seed({ tracks: [makeTrack({ title: 'The Chain', filename: 'the chain.mp3' })] });
    const { user } = renderApp('/details/the chain.mp3');
    await screen.findByDisplayValue('The Chain');
    await user.keyboard('{Control>}s{/Control}');
    expect(backend.requestsTo('PUT', '/mp3s/the chain.mp3/metadata')).toEqual([]);

    await user.type(screen.getByRole('textbox', { name: 'Artist' }), ' II');
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(backend.requestsTo('PUT', '/mp3s/the chain.mp3/metadata')).toHaveLength(1));
  });
});

describe('downloads', () => {
  it('cancels the running download', async () => {
    backend.seed({ queue: [makeQueueItem({ title: 'Busy Song', status: 'running', progress: 0.4 })] });
    const { user } = renderApp('/downloads');
    await user.click(await screen.findByRole('button', { name: 'Cancel download' }));
    await waitFor(() => expect(backend.requestsTo('POST', '/queue/1/cancel')).toHaveLength(1));
  });
});
