import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backend } from '../fakeBackend';
import { makeTrack } from '../factories';
import { renderApp } from '../render';

describe('HealthPage', () => {
  it('lists every silent ending the scan returns', async () => {
    const short = makeTrack({ title: 'Dreams', filename: 'dreams.mp3' });
    const long = makeTrack({ title: 'Songbird', filename: 'songbird.mp3' });
    backend.seed({ tracks: [short, long], silent: [{ ...short, silence: 0.6 }, { ...long, silence: 4 }] });
    renderApp('/health');

    expect(await screen.findByLabelText('Silent ending: 0.6s')).toBeInTheDocument();
    expect(screen.getByLabelText('Silent ending: 4.0s')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Minimum silence' })).not.toBeInTheDocument();
  });
});
