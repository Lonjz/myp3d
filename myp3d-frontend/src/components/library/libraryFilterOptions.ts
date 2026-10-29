import { Clock, CopyX, DiscAlbum, FileAudio, Image, ListFilter, ListMusic, MicVocal, Music, Star, Type } from 'lucide-react';
import type { MP3DurationRange, MP3FilterBy, MP3Issue } from '../../api/mp3Api';
import type { IconOption } from '../ui/InlineSelect';

export const SCOPE_OPTIONS: IconOption<MP3FilterBy>[] = [
  { value: 'all', label: 'All', icon: ListFilter },
  { value: 'title', label: 'Title', icon: Music },
  { value: 'artist', label: 'Artist', icon: MicVocal },
  { value: 'album', label: 'Album', icon: DiscAlbum },
  { value: 'filename', label: 'File name', icon: FileAudio },
];

export const DURATION_OPTIONS: IconOption<Exclude<MP3DurationRange, 'any'>>[] = [
  { value: 'under-2', label: '< 2', icon: Clock },
  { value: '2-3', label: '2–3', icon: Clock },
  { value: '3-4', label: '3–4', icon: Clock },
  { value: '4-5', label: '4–5', icon: Clock },
  { value: '5-7', label: '5–7', icon: Clock },
  { value: 'over-7', label: '7+', icon: Clock },
];

export const ISSUE_OPTIONS: IconOption<Exclude<MP3Issue, 'any'>>[] = [
  { value: 'title', label: 'Missing title', icon: Type },
  { value: 'artist', label: 'Missing artist', icon: MicVocal },
  { value: 'album', label: 'Missing album', icon: DiscAlbum },
  { value: 'cover', label: 'Missing cover art', icon: Image },
  { value: 'duplicate', label: 'Duplicates', icon: CopyX },
  { value: 'playlist', label: 'Not in a playlist', icon: ListMusic },
];

export const FAVORITE_OPTIONS: IconOption<'favorites'>[] = [{ value: 'favorites', label: 'Favourites', icon: Star }];
