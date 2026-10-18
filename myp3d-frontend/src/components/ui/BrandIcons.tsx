import { forwardRef, useId } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import { siApplemusic, siSpotify } from 'simple-icons';
import type { SimpleIcon } from 'simple-icons';

const GLYPH_TRANSFORM = 'translate(12 12) scale(0.8333) translate(-12 -12)';

interface BrandShape {
  icon: SimpleIcon;
  outline: ReactNode;
  inner: ReactNode;
}

function createBrandIcon({ icon, outline, inner }: BrandShape): LucideIcon {
  const BrandIcon = forwardRef<SVGSVGElement, Omit<LucideProps, 'ref'>>(({ size = 24, className, ...props }, ref) => {
    const maskId = `brand-${useId().replace(/[^\w-]/g, '')}`;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={['lucide', className].filter(Boolean).join(' ')}
        {...props}
      >
        {outline}
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <g stroke="none" transform={GLYPH_TRANSFORM}>
            {inner}
            <path d={icon.path} fill="black" />
          </g>
        </mask>
        <rect width="24" height="24" fill="currentColor" stroke="none" mask={`url(#${maskId})`} />
      </svg>
    );
  });
  BrandIcon.displayName = icon.title;
  return BrandIcon;
}

export const SpotifyIcon = createBrandIcon({
  icon: siSpotify,
  outline: <circle cx="12" cy="12" r="10" />,
  inner: <circle cx="12" cy="12" r="9.6" fill="white" />,
});

export const AppleMusicIcon = createBrandIcon({
  icon: siApplemusic,
  outline: <rect x="2" y="2" width="20" height="20" rx="5.5" />,
  inner: <rect x="2.6" y="2.6" width="18.8" height="18.8" rx="4.6" fill="white" />,
});
