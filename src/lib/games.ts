import type { ImageMetadata } from 'astro';
import millbrookCover from '../assets/games/millbrook-cover.png';

/**
 * Our games, for /games and each game's page. Status is honest: "in-development" until a store page exists.
 * Covers are real frames from the game's own renderer, never mock-ups.
 */
export interface Game {
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  status: 'in-development' | 'live';
  platforms: string[];
  cover: ImageMetadata;
  coverAlt: string;
}

export const games: Game[] = [
  {
    slug: 'millbrook',
    name: 'Millbrook',
    tagline: 'A koi pond puzzle game',
    summary: 'Turn the stream, feed the koi who ask, and dig the old mill pond out of the sand, one stretch at a time.',
    status: 'in-development',
    platforms: ['iPhone', 'Android', 'Web'],
    cover: millbrookCover,
    coverAlt: 'Koi swimming between lily pads in Millbrook, seen from above',
  },
];

/** Waitlist platform choices, shared by the form and the API route. */
export const waitlistPlatforms = [
  { value: 'iphone', label: 'iPhone' },
  { value: 'android', label: 'Android' },
  { value: 'web', label: 'Web' },
  { value: 'any', label: 'Any of these' },
] as const;
