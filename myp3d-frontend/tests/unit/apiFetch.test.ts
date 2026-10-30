import { describe, expect, it } from 'vitest';
import { ApiError, apiFetch, isUnreachable, mp3Api, UNREACHABLE_MESSAGE } from '../../src/api/mp3Api';
import { backend } from '../fakeBackend';
import { makeTrack } from '../factories';

describe('apiFetch', () => {
  it('returns JSON', async () => {
    backend.seed({ tracks: [makeTrack({ filename: 'a.mp3' })] });
    expect((await mp3Api.getInfo('a.mp3')).filename).toBe('a.mp3');
  });

  it('carries the status and detail of failed requests', async () => {
    const error = await mp3Api.getInfo('missing.mp3').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: 'MP3 file not found' });
    expect(isUnreachable(error)).toBe(false);
  });

  it('turns network failures into one readable error', async () => {
    backend.down();
    const error = await apiFetch('/stats', undefined, 'x').catch((err: unknown) => err);
    expect(isUnreachable(error)).toBe(true);
    expect((error as Error).message).toBe(UNREACHABLE_MESSAGE);
  });
});
