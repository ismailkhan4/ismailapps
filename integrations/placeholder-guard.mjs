// @ts-check
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fails the build if any prerendered page still contains placeholder content
 * (elements rendered with `data-placeholder`), unless ALLOW_PLACEHOLDERS=1.
 *
 * - `pnpm build`          → production build, placeholders forbidden
 * - `pnpm build:preview`  → preview build, placeholders allowed and listed
 *
 * Internal review pages (/brand) are excluded from the check because they
 * are never part of a production deployment (see README).
 *
 * @returns {import('astro').AstroIntegration}
 */
export default function placeholderGuard() {
  return {
    name: 'ismailapps:placeholder-guard',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        /** @type {Map<string, string[]>} */
        const found = new Map();

        for await (const file of walk(root)) {
          if (!file.endsWith('.html')) continue;
          const rel = file.slice(root.length).replaceAll('\\', '/');
          if (rel.startsWith('/brand') || rel.startsWith('brand')) continue;
          const html = await readFile(file, 'utf8');
          const labels = [...html.matchAll(/data-placeholder="([^"]*)"/g)].map((m) => m[1] ?? '');
          if (labels.length) found.set(rel, [...new Set(labels)]);
        }

        if (found.size === 0) {
          logger.info('No placeholders found.');
          return;
        }

        const report = [...found]
          .map(([page, labels]) => `  ${page}\n${labels.map((l) => `    - ${l}`).join('\n')}`)
          .join('\n');

        if (process.env.ALLOW_PLACEHOLDERS === '1') {
          logger.warn(`Placeholders present (allowed for preview builds):\n${report}`);
          return;
        }
        throw new Error(
          `Production build blocked: placeholder content remains.\n${report}\n` +
            'Replace these in src/lib/site.ts or the content files, or run `pnpm build:preview`.',
        );
      },
    },
  };
}

/** @param {string} dir @returns {AsyncGenerator<string>} */
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}
