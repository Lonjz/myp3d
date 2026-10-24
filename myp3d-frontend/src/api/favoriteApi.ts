import { apiFetch } from './mp3Api';

const favoritePath = (filename: string) => `/favorites/${encodeURIComponent(filename)}`;

export const favoriteApi = {
  list(): Promise<string[]> {
    return apiFetch('/favorites', undefined, 'Failed to load favourites');
  },

  add(filename: string): Promise<{ success: boolean }> {
    return apiFetch(favoritePath(filename), { method: 'PUT' }, 'Failed to favourite');
  },

  remove(filename: string): Promise<{ success: boolean }> {
    return apiFetch(favoritePath(filename), { method: 'DELETE' }, 'Failed to unfavourite');
  },
};
