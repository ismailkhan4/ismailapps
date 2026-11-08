/**
 * Worker entry: Astro handles every request; the cron trigger in wrangler.jsonc
 * runs the 24-month inquiry retention job once a day.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { purgeExpiredInquiries } from './lib/retention';

export default {
  fetch: handle,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      purgeExpiredInquiries(env.DB).then(
        (n) => console.log(`retention: deleted ${n} inquiries older than 24 months`),
        (err: unknown) => console.error('retention: purge failed', err instanceof Error ? err.message : 'unknown'),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
