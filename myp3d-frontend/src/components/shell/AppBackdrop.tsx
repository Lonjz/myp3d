import { useAppearance } from '../settings/appearanceContext';

export function AppBackdrop() {
  const { appearance, imageUrl } = useAppearance();
  const showImage = appearance.theme === 'glass' && imageUrl !== null;

  return (
    <div className="app-backdrop" aria-hidden="true">
      <div className="app-backdrop__aurora" />
      {showImage && (
        <>
          <div className="app-backdrop__image motion-fade" style={{ backgroundImage: `url("${imageUrl}")` }} />
          <div className="app-backdrop__dim" />
        </>
      )}
    </div>
  );
}
