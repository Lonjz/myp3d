import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { backend } from '../fakeBackend';
import { makeQueueItem } from '../factories';
import { renderApp } from '../render';

let plays = 0;

class FakePlayer {
  constructor(_: HTMLElement, options: { events: { onReady: () => void } }) {
    queueMicrotask(() => options.events.onReady());
  }
  getDuration = () => 200;
  getCurrentTime = () => 0;
  seekTo = () => undefined;
  pauseVideo = () => undefined;
  playVideo = () => {
    plays += 1;
  };
  destroy = () => undefined;
}

describe('DownloadsPage', () => {
  afterEach(() => {
    delete (window as { YT?: unknown }).YT;
    plays = 0;
  });

  it('saves a new trim for a queued download', async () => {
    Object.assign(window, { YT: { Player: FakePlayer } });
    const item = makeQueueItem({ title: 'Landslide', start_time: 5, end_time: 150 });
    backend.seed({ queue: [item] });
    const { user } = renderApp('/downloads');

    await user.click(await screen.findByText('Landslide'));
    const start = await screen.findByRole('slider', { name: 'Trim start time' });
    await waitFor(() => expect(start).toBeEnabled());
    expect(start).toHaveValue('5');
    fireEvent.change(start, { target: { value: '12' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(backend.requestsTo('PATCH', `/queue/${item.id}`)).toHaveLength(1));
    const [patch] = backend.requestsTo('PATCH', `/queue/${item.id}`);
    expect(patch.body).toMatchObject({ start_time: 12, end_time: 150 });
  });

  it('clears the trim when the range covers the whole video', async () => {
    Object.assign(window, { YT: { Player: FakePlayer } });
    const item = makeQueueItem({ title: 'Landslide', start_time: 5, end_time: 150 });
    backend.seed({ queue: [item] });
    const { user } = renderApp('/downloads');

    await user.click(await screen.findByText('Landslide'));
    const start = await screen.findByRole('slider', { name: 'Trim start time' });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.change(start, { target: { value: '0' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Trim end time' }), { target: { value: '200' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(backend.requestsTo('PATCH', `/queue/${item.id}`)).toHaveLength(1));
    const [patch] = backend.requestsTo('PATCH', `/queue/${item.id}`);
    expect(patch.body).toMatchObject({ start_time: null, end_time: null });
  });

  it('trims the silence without playing', async () => {
    Object.assign(window, { YT: { Player: FakePlayer } });
    const item = makeQueueItem({ title: 'Landslide' });
    backend.seed({ queue: [item] });
    const { user } = renderApp('/downloads');

    await user.click(await screen.findByText('Landslide'));
    const start = await screen.findByRole('slider', { name: 'Trim start time' });
    await waitFor(() => expect(start).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Trim silence' }));

    await waitFor(() => expect(start).toHaveValue('1.5'));
    expect(screen.getByRole('slider', { name: 'Trim end time' })).toHaveValue('197.5');
    expect(plays).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(backend.requestsTo('PATCH', `/queue/${item.id}`)).toHaveLength(1));
    const [patch] = backend.requestsTo('PATCH', `/queue/${item.id}`);
    expect(patch.body).toMatchObject({ start_time: 1.5, end_time: 197.5 });
  });
});
