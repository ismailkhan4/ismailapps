import type { ImageMetadata } from 'astro';
import koimereCover from '../assets/games/koimere-cover.png';
import lamplightCover from '../assets/games/lamplight/cover.jpg';

/**
 * Our games, for /games and each game's page. Status is honest: "in-development" until it reaches players,
 * "testing" while only invited testers have it, "live" once a public store page exists.
 * Covers are real frames from the game's own renderer, never mock-ups.
 */
export interface Game {
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  status: 'in-development' | 'testing' | 'live';
  platforms: string[];
  cover: ImageMetadata;
  coverAlt: string;
  /** Store and legal pages, once they exist. Never invent a store URL. */
  links?: { privacy?: string; terms?: string; store?: string };
}

export const statusLabel = (s: Game['status']) =>
  s === 'live' ? 'Live' : s === 'testing' ? 'Closed testing' : 'In development';

export const games: Game[] = [
  {
    slug: 'koimere',
    name: 'Koimere',
    tagline: 'A koi pond puzzle game',
    summary: 'Turn the stream, feed the koi who ask, and dig the old mill pond out of the sand, one stretch at a time.',
    status: 'in-development',
    platforms: ['iPhone', 'Android', 'Web'],
    cover: koimereCover,
    coverAlt: 'Koi swimming between lily pads in Koimere, seen from above',
  },
  {
    slug: 'lamplight',
    name: 'Lamplight',
    tagline: 'A light-up tile puzzle',
    summary: 'Turn the tiles to light the lamps, and bring a dark city back to life, one street at a time.',
    status: 'testing',
    platforms: ['Android'],
    cover: lamplightCover,
    coverAlt: 'The Lamplight logo, a glowing lantern, beside the lit streets and clock tower of the Old Harbour at night',
    links: {
      privacy: '/games/lamplight/privacy-policy',
      terms: '/games/lamplight/terms-and-conditions',
    },
  },
];

/** Waitlist platform choices, shared by the form and the API route. */
export const waitlistPlatforms = [
  { value: 'iphone', label: 'iPhone' },
  { value: 'android', label: 'Android' },
  { value: 'web', label: 'Web' },
  { value: 'any', label: 'Any of these' },
] as const;
