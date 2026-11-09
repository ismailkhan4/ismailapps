/**
 * Outbound email through Resend's HTTP API (no SDK: smaller Worker, one request each).
 * Every value from the form is escaped before it is placed in HTML.
 */
import { budgets, labelFor, needs, stages, timelines, type Inquiry } from './inquiry';
import { site } from './site';

type Mail = { to: string; subject: string; text: string; html: string; replyTo: string; idempotencyKey: string };
type MailEnv = { RESEND_API_KEY?: string; FROM_EMAIL: string };

export async function sendMail(env: MailEnv, mail: Mail): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.warn('email: RESEND_API_KEY not set, skipping send');
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': mail.idempotencyKey,
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [mail.to],
      reply_to: mail.replyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
  });
  if (!res.ok) console.error(`email: resend responded ${res.status}`);
  return res.ok;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

function rows(i: Inquiry): [string, string][] {
  return [
    ['Name', i.name],
    ['Email', i.email],
    ['Company', i.company ?? '—'],
    ['Needs', labelFor(needs, i.need)],
    ['Stage', labelFor(stages, i.stage)],
    ['Budget', labelFor(budgets, i.budget)],
    ['Timeline', labelFor(timelines, i.timeline)],
    ['Link', i.link ?? '—'],
  ];
}

const shell = (body: string) => `<!doctype html><html><body style="margin:0;padding:24px;background:#F2F3EF;font-family:Helvetica,Arial,sans-serif;color:#121412">
<div style="max-width:560px;margin:0 auto;background:#FAFAF8;border:1px solid #D3D6D0;border-radius:12px;padding:28px">${body}</div></body></html>`;

const table = (i: Inquiry) =>
  `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows(i)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #D3D6D0;color:#555A54;width:110px;vertical-align:top">${k}</td><td style="padding:8px 0;border-bottom:1px solid #D3D6D0">${escape(v)}</td></tr>`,
    )
    .join('')}</table>`;

/** To the founder: everything needed to reply. Reply-to is the lead. */
export function notificationMail(i: Inquiry, id: string, to: string): Mail {
  const text = `${rows(i)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n\n${i.description}\n\nInquiry id: ${id}`;
  return {
    to,
    replyTo: i.email,
    subject: `New inquiry: ${labelFor(needs, i.need)} · ${i.name}`,
    idempotencyKey: `${id}-notify`,
    text,
    html: shell(
      `<p style="margin:0 0 4px;font-family:monospace;font-size:12px;color:#555A54">new inquiry · ${escape(id)}</p>
<h1 style="margin:0 0 20px;font-size:22px">${escape(i.name)} · ${escape(labelFor(needs, i.need))}</h1>${table(i)}
<p style="margin:20px 0 0;white-space:pre-wrap;font-size:15px;line-height:1.55">${escape(i.description)}</p>`,
    ),
  };
}

/** To the lead: a short confirmation with a copy of what they sent and the booking link. */
export function confirmationMail(i: Inquiry, id: string, replyTo: string): Mail {
  const first = i.name.split(/\s+/)[0] ?? i.name;
  const text = `Hi ${first},

Thanks for telling us about your project. Ismail reads every inquiry himself and will reply by email, usually with a few questions.

If you would like to talk sooner, you can book a call: ${site.calUrl}

What you sent us:
${rows(i)
  .map(([k, v]) => `${k}: ${v}`)
  .join('\n')}

${i.description}

IsmailApps · ${site.url}
You can reply to this email to reach us.`;
  return {
    to: i.email,
    replyTo,
    subject: 'We have your project details',
    idempotencyKey: `${id}-confirm`,
    text,
    html: shell(
      `<p style="margin:0 0 16px;font-size:20px;font-weight:600">Thanks, ${escape(first)}.</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.55">Ismail reads every inquiry himself and will reply by email, usually with a few questions.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.55">If you would like to talk sooner, <a href="${site.calUrl}" style="color:#0B6B3A">book a call</a>.</p>
<p style="margin:0 0 8px;font-family:monospace;font-size:12px;color:#555A54">what you sent us</p>${table(i)}
<p style="margin:16px 0 0;white-space:pre-wrap;font-size:14px;line-height:1.55;color:#555A54">${escape(i.description)}</p>
<p style="margin:24px 0 0;font-size:13px;color:#555A54">IsmailApps · <a href="${site.url}" style="color:#555A54">ismailapps.com</a> · reply to this email to reach us.</p>`,
    ),
  };
}
