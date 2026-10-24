import { useEffect } from 'react';
import { usePlayer } from '../player/playerContext';

const APP_TITLE = 'myp3d';

export function DocumentTitle() {
  const { currentTrack, state } = usePlayer();
  const name = currentTrack ? currentTrack.title || currentTrack.filename : '';
  const artist = currentTrack?.artist ?? '';

  useEffect(() => {
    document.title = state.isPlaying && name ? `▶ ${artist ? `${name} · ${artist}` : name}` : APP_TITLE;
  }, [state.isPlaying, name, artist]);

  return null;
}
