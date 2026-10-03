export function NowPlayingIndicator({ playing }: { playing: boolean }) {
  return (
    <span className={playing ? 'now-playing is-playing' : 'now-playing'} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
