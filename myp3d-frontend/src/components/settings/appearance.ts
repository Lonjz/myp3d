import { readStoredValue } from '../../hooks/usePersistentState';

export const APPEARANCE_KEY = 'appearance';

export type ThemeId = 'glass' | 'amoled';
export type PaletteId = 'dusk' | 'ocean' | 'forest' | 'ember' | 'mono';
export type Density = 'comfortable' | 'compact';

export interface Appearance {
  theme: ThemeId;
  palette: PaletteId;
  accents: Record<ThemeId, string | null>;
  imageDim: number;
  imageBlur: number;
  density: Density;
}

export interface Palette {
  id: PaletteId;
  label: string;
  accent: string;
  accentAlt: string;
  background: string;
}

export const PALETTES: readonly Palette[] = [
  { id: 'dusk', label: 'Dusk', accent: '#ff9ec4', accentAlt: '#b9a2ff', background: '#17122b' },
  { id: 'ocean', label: 'Ocean', accent: '#6fd6e8', accentAlt: '#8fb4ff', background: '#0d1c2e' },
  { id: 'forest', label: 'Forest', accent: '#9fe0a8', accentAlt: '#d6dc8a', background: '#101f18' },
  { id: 'ember', label: 'Ember', accent: '#ffb27a', accentAlt: '#ff8a8a', background: '#24120f' },
  { id: 'mono', label: 'Mono', accent: '#e6e6ec', accentAlt: '#a9adb8', background: '#141518' },
];

const THEME_IDS: readonly ThemeId[] = ['glass', 'amoled'];
const DENSITIES: readonly Density[] = ['comfortable', 'compact'];
const AMOLED_ACCENT = '#1ed760';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const IMAGE_DIM_RANGE = { min: 20, max: 85 } as const;
export const IMAGE_BLUR_RANGE = { min: 0, max: 40 } as const;

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'glass',
  palette: 'dusk',
  accents: { glass: null, amoled: null },
  imageDim: 45,
  imageBlur: 0,
  density: 'comfortable',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function inRange(value: unknown, range: { min: number; max: number }, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, value));
}

function hexColor(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : null;
}

export function parseHexColor(text: string): string | null {
  const trimmed = text.trim();
  return hexColor(trimmed.startsWith('#') ? trimmed : `#${trimmed}`)?.toLowerCase() ?? null;
}

export function sanitizeAppearance(value: unknown): Appearance {
  const source = isRecord(value) ? value : {};
  const accents = isRecord(source.accents) ? source.accents : {};
  return {
    theme: oneOf(source.theme, THEME_IDS, DEFAULT_APPEARANCE.theme),
    palette: oneOf(source.palette, PALETTES.map((palette) => palette.id), DEFAULT_APPEARANCE.palette),
    accents: { glass: hexColor(accents.glass), amoled: hexColor(accents.amoled) },
    imageDim: inRange(source.imageDim, IMAGE_DIM_RANGE, DEFAULT_APPEARANCE.imageDim),
    imageBlur: inRange(source.imageBlur, IMAGE_BLUR_RANGE, DEFAULT_APPEARANCE.imageBlur),
    density: oneOf(source.density, DENSITIES, DEFAULT_APPEARANCE.density),
  };
}

export function parseAppearance(text: string): Appearance | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !THEME_IDS.includes(parsed.theme as ThemeId)) return null;
    return sanitizeAppearance(parsed);
  } catch {
    return null;
  }
}

export function readAppearance(): Appearance {
  return sanitizeAppearance(readStoredValue<unknown>(APPEARANCE_KEY, null));
}

function paletteOf(appearance: Appearance): Palette {
  return PALETTES.find((palette) => palette.id === appearance.palette) ?? PALETTES[0];
}

export function defaultAccent(appearance: Appearance): string {
  return appearance.theme === 'amoled' ? AMOLED_ACCENT : paletteOf(appearance).accent;
}

function isDarkColor(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.179;
}

function accentPair(appearance: Appearance): [string, string] {
  const custom = appearance.accents[appearance.theme];
  if (appearance.theme === 'amoled') {
    const accent = custom ?? AMOLED_ACCENT;
    return [accent, accent];
  }
  if (custom) return [custom, `color-mix(in srgb, ${custom} 62%, white)`];
  const palette = paletteOf(appearance);
  return [palette.accent, palette.accentAlt];
}

function setOptional(root: HTMLElement, name: string, value: string | null): void {
  if (value) root.style.setProperty(name, value);
  else root.style.removeProperty(name);
}

export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement;
  root.dataset.theme = appearance.theme;
  root.dataset.palette = appearance.palette;
  root.dataset.density = appearance.density;

  const [accent, accentAlt] = accentPair(appearance);
  root.style.setProperty('--color-accent', accent);
  root.style.setProperty('--color-accent-alt', accentAlt);
  setOptional(root, '--color-on-accent', isDarkColor(accent) ? '#fff' : null);
  setOptional(root, '--chart-series', appearance.accents[appearance.theme]);
  root.style.setProperty('--backdrop-image-dim', String(appearance.imageDim / 100));
  root.style.setProperty('--backdrop-image-blur', `${appearance.imageBlur}px`);

  const background = appearance.theme === 'amoled' ? '#000000' : paletteOf(appearance).background;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
}
