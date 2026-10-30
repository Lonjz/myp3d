import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backend } from '../fakeBackend';
import { makeTrack } from '../factories';
import { renderApp } from '../render';

describe('Spotlight', () => {
  it('opens with Ctrl+K and closes with Escape', async () => {
    const { user } = renderApp('/dashboard');
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Spotlight' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Spotlight' })).not.toBeInTheDocument());
  });

  it('opens with / outside text fields', async () => {
    const { user } = renderApp('/dashboard');
    await user.keyboard('/');
    expect(await screen.findByRole('dialog', { name: 'Spotlight' })).toBeInTheDocument();
  });

  it('finds library songs and jumps to pages', async () => {
    backend.seed({ tracks: [makeTrack({ title: 'Dreams', artist: 'Fleetwood Mac' })] });
    const { user, router } = renderApp('/dashboard');
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Spotlight' });

    await user.type(within(dialog).getByRole('combobox', { name: 'Search' }), 'dream');
    expect(await within(dialog).findByRole('option', { name: /Dreams/ })).toBeInTheDocument();

    await user.clear(within(dialog).getByRole('combobox', { name: 'Search' }));
    await user.type(within(dialog).getByRole('combobox', { name: 'Search' }), 'playlists');
    await user.click(await within(dialog).findByRole('option', { name: /^Playlists/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/playlists'));
  });
});
