# ismailapps.com

The IsmailApps website. Astro 7 (TypeScript strict), Tailwind CSS v4, deployed to Cloudflare Workers.
The specification lives in `~/ideas/ismailapps-website/docs/SPECIFICATION.md`.

## Requirements

- Node **22.23.4+** (`nvm use`, reads `.nvmrc`)
- pnpm 10 (`corepack enable` or `npm i -g pnpm@10`)

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Dev server at http://localhost:4321 (runs in Cloudflare's `workerd` runtime) |
| `pnpm check` | Type-check `.astro` and `.ts` files |
| `pnpm build` | **Production** build. Fails if any placeholder content remains |
| `pnpm build:preview` | Preview build. Placeholders allowed and listed |
| `pnpm preview` | Serve the last build locally in `workerd` |

## Placeholders

Facts the founder has not supplied yet (prices, hours, legal name and address, Cal.com link, social links…)
render through `<Placeholder label="…" />`: a hatched, clearly marked stand-in. The build integration in
`integrations/placeholder-guard.mjs` scans every built page and **fails a production build** while any remain.
Site-wide facts live in `src/lib/site.ts`; optional links set to `null` are hidden rather than invented.

## Screenshots

Work and product images are real captures of the live sites, never mock-ups:
`node scripts/capture-work.mjs` refreshes `src/assets/work/*.png` (it hides cookie banners instead of accepting them).
Content files reference them as `cover` / `mobileCover`; Astro converts them to WebP at build time.

## Brand system

- Tokens: `src/styles/global.css` (`@theme`). The palette is closed: Tailwind's default colours are removed.
- Primitives: `src/components/ui/` (Button, TextLink, Tag, VersionTag, Logo, AnnotatedFrame, Placeholder).
- Logo: “Tittle” wordmark (`Logo.astro`) and mark (`public/favicon.svg`). Fonts: Schibsted Grotesk + IBM Plex Mono,
  self-hosted via Fontsource.
- Reference page: **`/brand`** (internal; `noindex`, excluded from the sitemap and the placeholder check).
  **Delete `src/pages/brand.astro` before launch.**

## Project layout

```
astro.config.mjs        Astro + Cloudflare adapter (build-time image optimisation, no sessions)
wrangler.jsonc          Worker config: D1 binding, daily cron, email addresses
migrations/             D1 schema (inquiries)
src/worker.ts           Worker entry: Astro + the retention cron
integrations/           Build-time checks (placeholder guard)
src/lib/site.ts         Site facts, navigation, services list
src/layouts/            BaseLayout (meta, fonts, header/footer)
src/components/layout/  SiteHeader, SiteFooter
src/components/ui/      Primitives
src/components/sections Page sections (Hero, …)
src/scripts/enhance.ts  Progressive enhancement (~1 KB): menus, scroll reveal
```

## Contact form

`/contact` posts to `/api/inquiry` (the only on-demand route; everything else is prerendered).

1. **Honeypot** field `company_website`: if filled, we fake success and store nothing.
2. **Cloudflare Turnstile**: verified server-side; the route fails closed if the secret is missing.
3. **Validation** with the shared Zod schema in `src/lib/inquiry.ts` (also used by the form).
4. **D1** insert into `inquiries`, then **Resend** emails the founder (`NOTIFY_EMAIL`) and the lead.
   A database failure does not stop the emails; an email failure does not lose the stored inquiry.
   Only when both fail does the visitor see an error, with `hello@ismailapps.com` as the fallback.
5. Redirect to `/contact/thanks`, which links to Cal.com (a plain link: no embed, no third-party cookies).

Without JavaScript the form shows a note with the email address (Turnstile needs JS).
Analytics events: `cta_click`, `inquiry_submitted`, `cal_link_click`, `outbound_hamstalk`, `outbound_client`.
No personal data is ever sent to analytics.

**Retention:** a cron trigger (`src/worker.ts`, daily 03:17 UTC) deletes inquiries older than 24 months;
the same purge also runs after each new inquiry.

### Local development

```bash
cp .dev.vars.example .dev.vars        # Cloudflare's always-pass Turnstile test secret, no Resend key
pnpm db:migrate:local                 # creates the inquiries table in .wrangler/state
pnpm dev
pnpm wrangler d1 execute DB --local --command "SELECT * FROM inquiries"
```

Without `RESEND_API_KEY` emails are skipped (logged) and inquiries are still stored.

## Social images and icons

```bash
pnpm build:preview && pnpm og && pnpm build:preview
```

`scripts/generate-og.mjs` renders a 1200×630 card for every built page into `public/og/<page>.png`
(plus `icon-512.png` and `apple-touch-icon.png`). Re-run it when page titles change.

## Going live (first deployment)

1. **Domain**: register `ismailapps.com` in Cloudflare Registrar. Add a redirect rule `www` → bare domain.
2. **Email in**: Cloudflare → Email → Email Routing: forward `hello@ismailapps.com` to the founder's inbox.
3. **Email out**: create a Resend account, add the domain `ismailapps.com`, add the SPF/DKIM DNS records it
   shows (in Cloudflare DNS), wait for "verified", create an API key.
4. **Turnstile**: Cloudflare → Turnstile → add a widget for `ismailapps.com` (managed mode). Copy the site key
   and secret.
5. **Database**:
   ```bash
   pnpm wrangler login
   pnpm wrangler d1 create ismailapps-inquiries      # copy the database_id into wrangler.jsonc
   pnpm db:migrate:remote
   ```
6. **Secrets** (never committed):
   ```bash
   pnpm wrangler secret put TURNSTILE_SECRET_KEY
   pnpm wrangler secret put RESEND_API_KEY
   ```
7. **Public build values**: in `.env` (or the CI environment) set `PUBLIC_TURNSTILE_SITE_KEY` and, once Umami
   Cloud is set up, `PUBLIC_UMAMI_WEBSITE_ID`.
8. **Rate limit**: Cloudflare → Security → WAF → Rate limiting rules: e.g. 5 requests per minute per IP for
   `POST /api/inquiry`.
9. **Build and deploy** (production builds refuse to run while any placeholder remains):
   ```bash
   pnpm build && pnpm wrangler deploy
   ```
10. **Check**: send a real inquiry, confirm both emails arrive (not in spam) and the row is in D1
    (`pnpm wrangler d1 execute DB --remote --command "SELECT id, created_at FROM inquiries"`).
    Submit the sitemap (`/sitemap-index.xml`) to Google Search Console and Bing Webmaster Tools.

Security headers for static pages are in `public/_headers`; the API route sets its own.
The privacy policy and imprint should be reviewed by a professional before launch.

## Secrets

Never commit secrets. Local values go in `.dev.vars` (git-ignored, see `.dev.vars.example`); production values
via `pnpm wrangler secret put NAME`. Public build-time values go in `.env` (see `.env.example`).


