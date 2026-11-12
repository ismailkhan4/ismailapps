// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import placeholderGuard from './integrations/placeholder-guard.mjs';

// https://docs.astro.build/en/guides/integrations-guide/cloudflare/
export default defineConfig({
  site: 'https://ismailapps.com',
  trailingSlash: 'never',
  build: { format: 'file' },
  // No sessions: stops the adapter from provisioning a KV namespace we don't use.
  session: false,
  // The game was called Millbrook until 12 Nov 2026.
  redirects: { '/games/millbrook': '/games/koimere' },
  adapter: cloudflare({
    // Optimise images at build time for prerendered pages; no runtime Images binding needed.
    imageService: 'compile',
  }),
  integrations: [
    mdx(),
    sitemap({
      // Internal review pages are never indexed.
      filter: (page) => !/\/(brand|contact\/thanks|404)(\.html)?$/.test(page),
    }),
    placeholderGuard(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
