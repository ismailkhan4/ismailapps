/**
 * POST /api/inquiry — the only on-demand route on the site.
 *
 * 1. Honeypot: a filled hidden field is treated as a bot (fake success, nothing stored).
 * 2. Cloudflare Turnstile: verified server-side; fails closed if not configured.
 * 3. Validation with the shared Zod schema.
 * 4. Store in D1, then email the founder and the lead (Resend).
 *    A database failure does not stop the emails; an email failure does not lose the
 *    stored inquiry. Only when both fail is the visitor told it did not go through.
 *
 * Responds with JSON for the enhanced form (Accept: application/json) and with
 * 303 redirects for a plain form post.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { HONEYPOT, TURNSTILE_FIELD, inquirySchema, type Inquiry } from '../../lib/inquiry';
import { confirmationMail, notificationMail, sendMail } from '../../lib/email';
import { purgeExpiredInquiries } from '../../lib/retention';

export const prerender = false;

const THANKS = '/contact/thanks';
const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function reply(wantsJson: boolean, status: number, body: Record<string, unknown>, redirectTo: string) {
  if (wantsJson) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...securityHeaders, 'Content-Type': 'application/json' },
    });
  }
  return new Response(null, { status: 303, headers: { ...securityHeaders, Location: redirectTo } });
}

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error('inquiry: TURNSTILE_SECRET_KEY not set, rejecting');
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
    console.error('inquiry: turnstile verification request failed');
    return false;
  }
}

async function store(id: string, i: Inquiry): Promise<boolean> {
  try {
    await env.DB.prepare(
      `INSERT INTO inquiries (id, name, email, company, need, stage, budget, timeline, description, link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, i.name, i.email, i.company ?? null, i.need, i.stage, i.budget, i.timeline, i.description, i.link ?? null)
      .run();
    return true;
  } catch (err) {
    console.error('inquiry: d1 insert failed', err instanceof Error ? err.message : 'unknown');
    return false;
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(wantsJson, 400, { ok: false, error: 'bad_request' }, '/contact?error=invalid');
  }

  // 1. Honeypot
  if (String(form.get(HONEYPOT) ?? '').trim() !== '') {
    return reply(wantsJson, 200, { ok: true, redirect: THANKS }, THANKS);
  }

  // 2. Turnstile
  const token = String(form.get(TURNSTILE_FIELD) ?? '');
  if (!token || !(await verifyTurnstile(token, request.headers.get('CF-Connecting-IP')))) {
    return reply(wantsJson, 403, { ok: false, error: 'verification' }, '/contact?error=verification');
  }

  // 3. Validation
  const parsed = inquirySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      errors[key] ??= issue.message;
    }
    return reply(wantsJson, 422, { ok: false, error: 'validation', errors }, '/contact?error=invalid');
  }
  const inquiry = parsed.data;
  const id = crypto.randomUUID();

  // 4. Store and notify. Each step is independent.
  const stored = await store(id, inquiry);
  const [notified, confirmed] = await Promise.all([
    sendMail(env, notificationMail(inquiry, id, env.NOTIFY_EMAIL)),
    sendMail(env, confirmationMail(inquiry, id, env.REPLY_TO_EMAIL)),
  ]);

  if (stored) {
    const ctx = locals.cfContext;
    const followUp = Promise.all([
      env.DB.prepare('UPDATE inquiries SET notified = ?, confirmed = ? WHERE id = ?')
        .bind(notified ? 1 : 0, confirmed ? 1 : 0, id)
        .run(),
      purgeExpiredInquiries(env.DB),
    ]).catch(() => console.error('inquiry: follow-up update failed'));
    if (ctx) ctx.waitUntil(followUp);
    else await followUp;
  }

  if (!stored && !notified) {
    console.error('inquiry: not stored and not delivered');
    return reply(wantsJson, 502, { ok: false, error: 'delivery' }, '/contact?error=delivery');
  }
  return reply(wantsJson, 200, { ok: true, redirect: THANKS }, THANKS);
};

export const ALL: APIRoute = () =>
  new Response('Method not allowed', { status: 405, headers: { ...securityHeaders, Allow: 'POST' } });
