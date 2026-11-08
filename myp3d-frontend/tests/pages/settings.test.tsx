import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { backgroundImage } from '../../src/utils/backgroundImage';
import { backend } from '../fakeBackend';
import { renderApp } from '../render';

vi.mock('../../src/utils/backgroundImage', () => ({
  backgroundImage: {
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn(),
  },
}));

const STORAGE_KEY = 'myp3d:appearance';
const IMAGE = new File(['image'], 'wallpaper.png', { type: 'image/png' });
const root = () => document.documentElement;
const accent = () => root().style.getPropertyValue('--color-accent');
const backdropImage = () => document.querySelector('.app-backdrop__image');

beforeEach(() => {
  vi.mocked(backgroundImage.load).mockReset().mockResolvedValue(null);
  vi.mocked(backgroundImage.save).mockReset().mockResolvedValue();
  vi.mocked(backgroundImage.clear).mockReset().mockResolvedValue();
});

function stored() {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
}

function settingsFile(contents: string) {
  return Object.assign(new File([contents], 'settings.json', { type: 'application/json' }), { text: () => Promise.resolve(contents) });
}

async function openSettings(user: ReturnType<typeof renderApp>['user']) {
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  return screen.findByRole('dialog', { name: 'Settings' });
}

async function openData(user: ReturnType<typeof renderApp>['user']) {
  const dialog = await openSettings(user);
  await user.click(within(dialog).getByRole('button', { name: 'Data' }));
  return dialog;
}

describe('settings', () => {
  it('opens from the sidebar and closes with Escape', async () => {
    const { user } = renderApp('/dashboard');
    await openSettings(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument());
  });

  it('opens from Spotlight', async () => {
    const { user } = renderApp('/dashboard');
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('settings');
    await user.click(await screen.findByRole('option', { name: /Settings/ }));
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  });

  it('switches to AMOLED and restores it after a reload', async () => {
    const meta = document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
    onTestFinished(() => meta.remove());
    const { user, unmount } = renderApp('/dashboard');
    const dialog = await openSettings(user);
    await user.click(within(dialog).getByRole('button', { name: 'AMOLED' }));
    expect(document.documentElement.dataset.theme).toBe('amoled');
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#1ed760');
    expect(meta.content).toBe('#000000');
    expect(stored().theme).toBe('amoled');

    unmount();
    document.documentElement.dataset.theme = 'glass';
    renderApp('/dashboard');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('amoled'));
  });

  it('applies a palette and its accent', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openSettings(user);
    await user.click(within(dialog).getByRole('button', { name: 'Ocean' }));
    expect(root().dataset.palette).toBe('ocean');
    expect(accent()).toBe('#6fd6e8');
  });

  it('keeps a separate custom accent for each theme', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openSettings(user);
    fireEvent.change(within(dialog).getByLabelText('Accent colour'), { target: { value: '#ffcc00' } });
    expect(accent()).toBe('#ffcc00');

    await user.click(within(dialog).getByRole('button', { name: 'AMOLED' }));
    expect(accent()).toBe('#1ed760');

    await user.click(within(dialog).getByRole('button', { name: 'Glass' }));
    expect(accent()).toBe('#ffcc00');

    await user.click(within(dialog).getByRole('button', { name: 'Reset accent' }));
    expect(accent()).toBe('#ff9ec4');
  });

  it('takes a hex code with or without the hash', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openSettings(user);
    const field = within(dialog).getByLabelText('Accent colour');
    expect(field).toHaveValue('ff9ec4');

    await user.clear(field);
    await user.type(field, 'ABCDEF');
    expect(accent()).toBe('#abcdef');

    await user.clear(field);
    await user.paste('#123abc');
    expect(accent()).toBe('#123abc');
  });

  it('keeps the current accent while a hex code is incomplete and restores it on blur', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openSettings(user);
    const field = within(dialog).getByLabelText('Accent colour');

    await user.clear(field);
    await user.type(field, 'zz12');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(accent()).toBe('#ff9ec4');

    await user.tab();
    expect(field).toHaveValue('ff9ec4');
    expect(field).toHaveAttribute('aria-invalid', 'false');
  });

  it('shows the accent of the current theme in the hex field', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openSettings(user);
    await user.click(within(dialog).getByRole('button', { name: 'AMOLED' }));
    expect(within(dialog).getByLabelText('Accent colour')).toHaveValue('1ed760');
  });

  it('picking a palette replaces a custom glass accent', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openSettings(user);
    fireEvent.change(within(dialog).getByLabelText('Accent colour'), { target: { value: '#ffcc00' } });
    await user.click(within(dialog).getByRole('button', { name: 'Forest' }));
    expect(accent()).toBe('#9fe0a8');
  });

  it('uses light text on a dark accent', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openSettings(user);
    fireEvent.change(within(dialog).getByLabelText('Accent colour'), { target: { value: '#102040' } });
    expect(root().style.getPropertyValue('--color-on-accent')).toBe('#fff');
    fireEvent.change(within(dialog).getByLabelText('Accent colour'), { target: { value: '#ffcc00' } });
    expect(root().style.getPropertyValue('--color-on-accent')).toBe('');
  });

  it('saves a background image and enables the dim and blur controls', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openSettings(user);
    expect(within(dialog).getByRole('slider', { name: 'Background dim' })).toBeDisabled();

    await user.upload(within(dialog).getByLabelText('Background image file'), IMAGE);

    await waitFor(() => expect(backdropImage()).not.toBeNull());
    expect(backgroundImage.save).toHaveBeenCalledWith(IMAGE);
    fireEvent.change(within(dialog).getByRole('slider', { name: 'Background dim' }), { target: { value: '70' } });
    expect(root().style.getPropertyValue('--backdrop-image-dim')).toBe('0.7');
    fireEvent.change(within(dialog).getByRole('slider', { name: 'Background blur' }), { target: { value: '12' } });
    expect(root().style.getPropertyValue('--backdrop-image-blur')).toBe('12px');
  });

  it('restores the saved image on load and hides it on AMOLED', async () => {
    vi.mocked(backgroundImage.load).mockResolvedValue(IMAGE);
    const { user } = renderApp('/dashboard');
    await waitFor(() => expect(backdropImage()).not.toBeNull());

    const dialog = await openSettings(user);
    await user.click(within(dialog).getByRole('button', { name: 'AMOLED' }));

    expect(backdropImage()).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Change background image' })).toBeDisabled();
  });

  it('keeps the glass controls visible but locked on AMOLED', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openSettings(user);
    expect(within(dialog).getByRole('button', { name: 'Ocean' })).toBeEnabled();

    await user.click(within(dialog).getByRole('button', { name: 'AMOLED' }));

    expect(within(dialog).getByRole('button', { name: 'Ocean' })).toBeDisabled();
    expect(within(dialog).getByText('Switch the theme to Glass to use these')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Accent colour')).toBeEnabled();
  });

  it('removes the background image', async () => {
    vi.mocked(backgroundImage.load).mockResolvedValue(IMAGE);
    const { user } = renderApp('/dashboard');
    await waitFor(() => expect(backdropImage()).not.toBeNull());

    const dialog = await openSettings(user);
    await user.click(within(dialog).getByRole('button', { name: 'Remove background image' }));

    await waitFor(() => expect(backdropImage()).toBeNull());
    expect(backgroundImage.clear).toHaveBeenCalledTimes(1);
  });

  it('refuses a file that is not an image', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openSettings(user);
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(within(dialog).getByLabelText('Background image file'), { target: { files: [file] } });
    expect(await screen.findByText('Choose an image file')).toBeInTheDocument();
    expect(backgroundImage.save).not.toHaveBeenCalled();
  });

  it('reports a background image that could not be saved', async () => {
    vi.mocked(backgroundImage.save).mockRejectedValue(new Error('quota'));
    const { user } = renderApp('/dashboard');
    const dialog = await openSettings(user);
    await user.upload(within(dialog).getByLabelText('Background image file'), IMAGE);
    expect(await screen.findByText('Failed to save the background image')).toBeInTheDocument();
    expect(backdropImage()).toBeNull();
  });

  it('applies and remembers the row density', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openSettings(user);
    await user.click(within(dialog).getByRole('button', { name: 'Compact rows' }));
    expect(document.documentElement.dataset.density).toBe('compact');
    expect(stored().density).toBe('compact');
  });

  it('falls back field by field when the stored settings are corrupt', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'neon', density: 'compact', imageDim: 'x', accents: { glass: 'url(evil)' } }));
    renderApp('/dashboard');
    expect(document.documentElement.dataset.theme).toBe('glass');
    expect(document.documentElement.dataset.density).toBe('compact');
    expect(stored().accents.glass).toBeNull();
    expect(stored().imageDim).toBe(45);
  });

  it('falls back to the defaults when the stored settings are not JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{nope');
    renderApp('/dashboard');
    expect(document.documentElement.dataset.theme).toBe('glass');
  });

  it('clears the server cache', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openData(user);
    await user.click(within(dialog).getByRole('button', { name: 'Clear cache' }));
    await waitFor(() => expect(backend.requestsTo('POST', '/cache/clear')).toHaveLength(1));
    expect(await screen.findByText('Cache cleared')).toBeInTheDocument();
  });

  it('imports a settings file', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openData(user);
    await user.upload(within(dialog).getByLabelText('Settings file'), settingsFile(JSON.stringify({ theme: 'glass', density: 'compact' })));
    await waitFor(() => expect(document.documentElement.dataset.density).toBe('compact'));
  });

  it('rejects a file that is not a settings export', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openData(user);
    await user.upload(within(dialog).getByLabelText('Settings file'), settingsFile('[1, 2]'));
    expect(await screen.findByText('Not a settings file')).toBeInTheDocument();
    expect(document.documentElement.dataset.density).toBe('comfortable');
  });

  it('shows the app details', async () => {
    const { user } = renderApp('/dashboard');
    const dialog = await openData(user);
    expect(await within(dialog).findByText('This PC')).toBeInTheDocument();
    expect(within(dialog).getByText('1.0.0')).toBeInTheDocument();
  });

  it('retries app details that failed to load', async () => {
    backend.fail('GET', '/system/info');
    const { user } = renderApp('/dashboard');
    const dialog = await openData(user);
    await within(dialog).findByRole('status', { name: "Couldn't load app details" });
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(await within(dialog).findByText('This PC')).toBeInTheDocument();
  });

  it('resets only after confirming, and Escape closes just the confirmation', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ density: 'compact' }));
    const { user } = renderApp('/dashboard');
    const dialog = await openData(user);

    await user.click(within(dialog).getByRole('button', { name: 'Reset appearance' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(document.documentElement.dataset.density).toBe('compact');

    await user.click(within(dialog).getByRole('button', { name: 'Reset appearance' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(document.documentElement.dataset.density).toBe('comfortable'));
    await waitFor(() => expect(backgroundImage.clear).toHaveBeenCalledTimes(1));
  });
});
