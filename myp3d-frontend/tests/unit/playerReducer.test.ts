import { describe, expect, it } from 'vitest';
import { initialPlayerState, playerReducer, restorePlayerState } from '../../src/components/player/playerReducer';
import type { PlayerState } from '../../src/components/player/playerReducer';
import { makeTrack, makeTracks } from '../factories';

const names = (state: PlayerState) => state.queue.map((track) => track.title);
const playing = (count: number, startIndex = 0, overrides: Partial<PlayerState> = {}) =>
  playerReducer({ ...initialPlayerState, ...overrides }, { type: 'playTracks', tracks: makeTracks(count), startIndex, seed: 1 });

describe('playerReducer', () => {
  it('plays a list from the chosen track', () => {
    const state = playing(3, 1);
    expect(names(state)).toEqual(['Song 1', 'Song 2', 'Song 3']);
    expect(state.index).toBe(1);
    expect(state.isPlaying).toBe(true);
  });

  it('shuffles around the chosen track and restores the order', () => {
    const state = playing(6, 2, { shuffle: true });
    expect(state.queue[0].title).toBe('Song 3');
    expect([...names(state)].sort()).toEqual(['Song 1', 'Song 2', 'Song 3', 'Song 4', 'Song 5', 'Song 6']);

    const restored = playerReducer(state, { type: 'toggleShuffle', seed: 1 });
    expect(names(restored)).toEqual(['Song 1', 'Song 2', 'Song 3', 'Song 4', 'Song 5', 'Song 6']);
    expect(restored.index).toBe(2);
  });

  it('stops at the end unless repeating', () => {
    const last = playerReducer(playing(2, 1), { type: 'ended' });
    expect(last.isPlaying).toBe(false);
    const repeating = playerReducer(playing(2, 1, { repeat: 'all' }), { type: 'ended' });
    expect([repeating.index, repeating.isPlaying]).toEqual([0, true]);
  });

  it('cycles repeat modes', () => {
    const modes = ['all', 'one', 'off'].map((_, step, all) =>
      all.slice(0, step + 1).reduce<PlayerState>((state) => playerReducer(state, { type: 'cycleRepeat' }), initialPlayerState).repeat,
    );
    expect(modes).toEqual(['all', 'one', 'off']);
  });

  it('plays next right after the current track', () => {
    const state = playerReducer(playing(3, 0), { type: 'playNext', track: makeTrack({ title: 'Inserted' }) });
    expect(names(state)).toEqual(['Song 1', 'Inserted', 'Song 2', 'Song 3']);
  });

  it('removes tracks around the current one', () => {
    const before = playerReducer(playing(3, 2), { type: 'remove', index: 0 });
    expect([names(before), before.index]).toEqual([['Song 2', 'Song 3'], 1]);
    const current = playerReducer(playing(2, 1), { type: 'remove', index: 1 });
    expect([current.index, current.isPlaying]).toEqual([0, false]);
    expect(playerReducer(playing(1), { type: 'remove', index: 0 }).index).toBe(-1);
  });

  it('follows renames and deletions in the library', () => {
    const state = playing(3, 1);
    const renamed = { ...state.queue[1], filename: 'renamed.mp3', title: 'Renamed' };
    expect(names(playerReducer(state, { type: 'trackUpdated', oldFilename: state.queue[1].filename, track: renamed }))).toEqual(['Song 1', 'Renamed', 'Song 3']);

    const synced = playerReducer(state, { type: 'syncLibrary', tracks: [state.queue[1], state.queue[2]] });
    expect([names(synced), synced.index]).toEqual([['Song 2', 'Song 3'], 0]);
  });

  it('clamps volume and unmutes when raised', () => {
    const muted = playerReducer(initialPlayerState, { type: 'toggleMute' });
    expect(playerReducer(muted, { type: 'setVolume', volume: 3 })).toMatchObject({ volume: 1, muted: false });
    expect(playerReducer(muted, { type: 'setVolume', volume: 0 })).toMatchObject({ volume: 0, muted: true });
  });

  it('restores saved state defensively', () => {
    expect(restorePlayerState(null)).toEqual(initialPlayerState);
    const restored = restorePlayerState({ queue: [makeTrack(), { bad: true } as never], index: 7, volume: 4, repeat: 'sideways' as never });
    expect(restored).toMatchObject({ index: 0, volume: 1, repeat: 'off', isPlaying: false });
    expect(restored.queue).toHaveLength(1);
  });
});
