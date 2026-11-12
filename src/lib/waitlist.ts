import { z } from 'astro/zod';
import { games, waitlistPlatforms } from './games';

/**
 * Game launch waitlists: shared by the form (src/components/games/GameWaitlist.astro)
 * and the route (src/pages/api/waitlist.ts). One email per game, nothing else.
 */
export const WAITLIST_HONEYPOT = 'company_website';
export const TURNSTILE_FIELD = 'cf-turnstile-response';

const gameSlugs = games.map((g) => g.slug) as [string, ...string[]];
const platformValues = waitlistPlatforms.map((p) => p.value) as [string, ...string[]];

export const waitlistSchema = z.object({
  game: z.enum(gameSlugs, 'Unknown game.'),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Please enter a valid email address.')),
  platform: z.enum(platformValues, 'Please choose where you want to play.'),
  age: z.literal('yes', { error: 'Please confirm you are 16 or older, or a parent or guardian.' }),
});

export type WaitlistEntry = z.infer<typeof waitlistSchema>;
