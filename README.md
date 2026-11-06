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
wrangler.jsonc          Worker config (D1 binding and cron added in Milestone 4)
integrations/           Build-time checks (placeholder guard)
src/lib/site.ts         Site facts, navigation, services list
src/layouts/            BaseLayout (meta, fonts, header/footer)
src/components/layout/  SiteHeader, SiteFooter
src/components/ui/      Primitives
src/components/sections Page sections (Hero, …)
src/scripts/enhance.ts  Progressive enhancement (~1 KB): menus, scroll reveal
```

## Secrets

Never commit secrets. Local values go in `.dev.vars` (git-ignored); production values via
`pnpm wrangler secret put NAME`. Example files are added with the contact form in Milestone 4.

Cloudflare, D1, Resend, Turnstile and deployment setup are documented here as they are added (Milestone 4).
