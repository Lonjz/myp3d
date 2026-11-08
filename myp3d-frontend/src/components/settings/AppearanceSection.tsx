import { useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Focus, Hash, Image, ImagePlus, Pipette, RotateCcw, Rows2, Rows4, SunDim, SunMoon, SwatchBook, Table, Trash2 } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { IconField } from '../ui/IconField';
import type { SegmentOption } from '../ui/SegmentedControl';
import { SegmentedControl } from '../ui/SegmentedControl';
import { IMAGE_BLUR_RANGE, IMAGE_DIM_RANGE, PALETTES, defaultAccent, parseHexColor } from './appearance';
import type { Density, Palette, ThemeId } from './appearance';
import { useAppearance } from './appearanceContext';
import { SettingsRow } from './SettingsRow';

const THEME_OPTIONS: readonly SegmentOption<ThemeId>[] = [
  { value: 'glass', label: 'Glass', text: 'Glass' },
  { value: 'amoled', label: 'AMOLED', text: 'AMOLED' },
];

const DENSITY_OPTIONS: readonly SegmentOption<Density>[] = [
  { value: 'comfortable', label: 'Comfortable rows', icon: Rows2 },
  { value: 'compact', label: 'Compact rows', icon: Rows4 },
];

function PaletteSwatch({ palette, active, onSelect }: { palette: Palette; active: boolean; onSelect: () => void }) {
  const style = { '--swatch-from': palette.accent, '--swatch-to': palette.accentAlt } as CSSProperties;

  return (
    <button
      type="button"
      className={active ? 'settings-swatch is-active' : 'settings-swatch'}
      style={style}
      aria-label={palette.label}
      aria-pressed={active}
      title={palette.label}
      onClick={onSelect}
    />
  );
}

function AccentField({ value, onCommit }: { value: string; onCommit: (accent: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parseHexColor(draft) === null;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
    const accent = parseHexColor(event.target.value);
    if (accent) onCommit(accent);
  };

  return (
    <IconField
      icon={Hash}
      label="Accent colour"
      className={invalid ? 'settings-accent is-invalid' : 'settings-accent'}
      placeholder="RRGGBB"
      value={draft ?? value.slice(1)}
      maxLength={7}
      spellCheck={false}
      autoComplete="off"
      aria-invalid={invalid}
      onChange={handleChange}
      onBlur={() => setDraft(null)}
      trailing={<span className="settings-accent__preview" style={{ background: value }} aria-hidden="true" />}
    />
  );
}

interface RangeSliderProps {
  label: string;
  range: { min: number; max: number };
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

function RangeSlider({ label, range, value, disabled, onChange }: RangeSliderProps) {
  const style = { '--progress': `${((value - range.min) / (range.max - range.min)) * 100}%` } as CSSProperties;

  return (
    <input
      type="range"
      className="seek-slider"
      aria-label={label}
      title={label}
      min={range.min}
      max={range.max}
      step={1}
      value={value}
      disabled={disabled}
      style={style}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

export function AppearanceSection() {
  const { appearance, update, imageUrl, setImage, removeImage } = useAppearance();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isGlass = appearance.theme === 'glass';
  const customAccent = appearance.accents[appearance.theme];

  const setAccent = (accent: string | null) => {
    update({ accents: { ...appearance.accents, [appearance.theme]: accent } });
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void setImage(file);
  };

  return (
    <div className="settings-section">
      <SettingsRow icon={SunMoon} label="Theme" hint="The look of the whole app">
        <SegmentedControl
          label="Theme"
          options={THEME_OPTIONS}
          value={appearance.theme}
          onChange={(theme) => update({ theme })}
        />
      </SettingsRow>

      <SettingsRow icon={Pipette} label="Accent" hint="Buttons, sliders and highlights">
        {customAccent && <IconButton icon={RotateCcw} label="Reset accent" variant="ghost" size="sm" onClick={() => setAccent(null)} />}
        <AccentField value={customAccent ?? defaultAccent(appearance)} onCommit={setAccent} />
      </SettingsRow>

      <SettingsRow icon={Table} label="Track rows" hint="Spacing in song tables">
        <SegmentedControl
          label="Track rows"
          options={DENSITY_OPTIONS}
          value={appearance.density}
          onChange={(density) => update({ density })}
        />
      </SettingsRow>

      <h3 className="settings-heading">
        Glass
        {!isGlass && <span className="settings-heading__note">Switch the theme to Glass to use these</span>}
      </h3>

      <fieldset className="settings-group" aria-label="Glass" disabled={!isGlass}>
        <SettingsRow icon={SwatchBook} label="Palette" hint="Backdrop and accent colours">
          {PALETTES.map((palette) => (
            <PaletteSwatch
              key={palette.id}
              palette={palette}
              active={appearance.palette === palette.id}
              onSelect={() => update({ palette: palette.id, accents: { ...appearance.accents, glass: null } })}
            />
          ))}
        </SettingsRow>

        <SettingsRow icon={Image} label="Background image" hint="Your own picture behind the glass">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden-file-input"
            aria-label="Background image file"
            onChange={handleImageChange}
          />
          {imageUrl && <span className="settings-image" style={{ backgroundImage: `url("${imageUrl}")` }} aria-hidden="true" />}
          {imageUrl && <IconButton icon={Trash2} label="Remove background image" variant="ghost" onClick={() => void removeImage()} />}
          <IconButton
            icon={ImagePlus}
            label={imageUrl ? 'Change background image' : 'Choose background image'}
            onClick={() => fileInputRef.current?.click()}
          />
        </SettingsRow>

        <SettingsRow icon={SunDim} label="Background dim" hint="Darkens the picture">
          <RangeSlider
            label="Background dim"
            range={IMAGE_DIM_RANGE}
            value={appearance.imageDim}
            disabled={!imageUrl}
            onChange={(imageDim) => update({ imageDim })}
          />
        </SettingsRow>

        <SettingsRow icon={Focus} label="Background blur" hint="Softens the picture">
          <RangeSlider
            label="Background blur"
            range={IMAGE_BLUR_RANGE}
            value={appearance.imageBlur}
            disabled={!imageUrl}
            onChange={(imageBlur) => update({ imageBlur })}
          />
        </SettingsRow>
      </fieldset>
    </div>
  );
}
