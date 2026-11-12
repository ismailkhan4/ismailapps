/**
 * POST /api/waitlist: game launch waitlists (same pattern as /api/inquiry).
 *
 * 1. Honeypot: a filled hidden field is treated as a bot (fake success, nothing stored).
 * 2. Cloudflare Turnstile: verified server-side; fails closed if the secret is missing.
 * 3. Validation with the shared Zod schema.
 * 4. Store in D1. Signing up twice for the same game is not an error: the existing row is kept.
 *
 * Responds with JSON for the enhanced form (Accept: application/json) and with 303 redirects
 * back to the game's waitlist section for a plain form post.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { TURNSTILE_FIELD, WAITLIST_HONEYPOT, waitlistSchema, type WaitlistEntry } from '../../lib/waitlist';
import { games } from '../../lib/games';

export const prerender = false;

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function reply(json: boolean, status: number, body: Record<string, unknown>, game: string, back: string) {
  if (json) return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
  const slug = games.some((g) => g.slug === game) ? game : '';
  const page = slug ? `/games/${slug}` : '/games';
  return new Response(null, { status: 303, headers: { ...headers, Location: `${page}?waitlist=${back}#waitlist` } });
}

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error('waitlist: TURNSTILE_SECRET_KEY not set, rejecting');
    return false;
  }
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    console.error('waitlist: turnstile verification request failed');
    return false;
  }
}

async function store(entry: WaitlistEntry): Promise<boolean> {
  try {
    await env.DB.prepare('INSERT INTO game_waitlist (id, game, email, platform) VALUES (?, ?, ?, ?) ON CONFLICT(game, email) DO NOTHING')
      .bind(crypto.randomUUID(), entry.game, entry.email, entry.platform)
      .run();
    return true;
  } catch (err) {
    console.error('waitlist: d1 insert failed', err instanceof Error ? err.message : 'unknown');
    return false;
  }
}

export const POST: APIRoute = async ({ request }) => {
  const json = (request.headers.get('accept') ?? '').includes('application/json');
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(json, 400, { ok: false, error: 'invalid' }, '', 'invalid');
  }
  const game = String(form.get('game') ?? '');

  if (String(form.get(WAITLIST_HONEYPOT) ?? '').trim() !== '') return reply(json, 200, { ok: true }, game, 'joined');

  const token = String(form.get(TURNSTILE_FIELD) ?? '');
  if (!token || !(await verifyTurnstile(token, request.headers.get('CF-Connecting-IP')))) {
    return reply(json, 403, { ok: false, error: 'verification' }, game, 'verification');
  }

  const parsed = waitlistSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? 'form')] ??= issue.message;
    return reply(json, 422, { ok: false, error: 'invalid', errors }, game, 'invalid');
  }

  if (!(await store(parsed.data))) return reply(json, 500, { ok: false, error: 'delivery' }, game, 'delivery');
  return reply(json, 200, { ok: true }, game, 'joined');
};
