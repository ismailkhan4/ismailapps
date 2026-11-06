import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Content rules that protect the site from publishing anything unverified:
 *  - A client quote cannot exist without `approved: true` and the date of written approval.
 *  - A product cannot be `live` without a public URL.
 *  - Entries marked `draft: true` are excluded from every public page (see src/lib/content.ts).
 *  - Unknown facts are written as [[label]] and render as visible placeholders, which block
 *    production builds (integrations/placeholder-guard.mjs).
 */

const seo = z.object({
  title: z.string().max(60),
  description: z.string().min(70).max(160),
});

const qa = z.object({ q: z.string(), a: z.string() });

/** The values of the inquiry form's "What do you need?" field. */
export const inquiryNeeds = ['new-product', 'prototype-to-production', 'saas-engineering', 'website', 'not-sure'] as const;

const services = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/services' }),
  schema: z.object({
    title: z.string(),
    order: z.number().int(),
    /** Short line used in the navigation menu. */
    navShort: z.string().max(40),
    /** One line used in lists (homepage, overview, footer). */
    oneLiner: z.string(),
    /** Primary services get more weight on the homepage. */
    featured: z.boolean().default(false),
    /** Optional mono tag shown with the service. */
    tag: z.string().optional(),
    /** H1 on the service page: the promise. */
    headline: z.string(),
    /** Lead paragraph: the problem. */
    problem: z.string(),
    /** Pre-selects the inquiry form: /contact?service=<formValue> */
    formValue: z.enum(inquiryNeeds),
    /** Key facts shown as a release-notes sheet in the page hero. */
    facts: z.array(z.object({ key: z.string(), value: z.string() })).min(2).max(5),
    forWho: z.array(z.string()).min(2),
    deliverables: z.array(z.object({ title: z.string(), detail: z.string() })).min(3),
    steps: z.array(z.object({ title: z.string(), detail: z.string() })).min(3),
    faqs: z.array(qa).min(3).max(5),
    relatedWork: z.array(reference('work')).default([]),
    seo,
  }),
});

const work = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/work' }),
  schema: ({ image }) => z.object({
    title: z.string(),
    order: z.number().int(),
    draft: z.boolean().default(false),
    /** Full case study with its own page, or a short entry on /work only. */
    kind: z.enum(['case-study', 'short']),
    /** e.g. "SaaS", "AI SaaS", "Website". Always presented as client work. */
    category: z.string(),
    clientLocation: z.string(),
    summary: z.string(),
    url: z.url(),
    status: z.enum(['live', 'offline']),
    /** Real screenshot of the live product (scripts/capture-work.mjs). Never a mock-up. */
    cover: image().optional(),
    /** Verified facts about the product itself (not claims about our work). */
    productFacts: z.array(z.string()).default([]),
    services: z.array(reference('services')).default([]),
    /* Case-study fields: founder-supplied facts only; unknowns as [[placeholders]]. */
    /** What we did on the project, in a sentence. */
    role: z.string().optional(),
    /** Our part in a few words, for the snapshot sheet, e.g. "Front end · integrations". */
    scope: z.string().optional(),
    /** e.g. "2023–2024". */
    timeline: z.string().optional(),
    /** The problem the product solves, from the client's own public positioning. */
    problem: z.string().optional(),
    built: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
    decisions: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
    stack: z.array(z.string()).default([]),
    outcome: z.array(z.string()).default([]),
    quote: z
      .object({
        text: z.string(),
        name: z.string(),
        role: z.string(),
        approved: z.literal(true, { error: 'Quotes need written client approval: set approved: true and approvedOn.' }),
        approvedOn: z.coerce.date(),
      })
      .optional(),
    seo: seo.optional(),
  }),
});

const products = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/products' }),
  schema: ({ image }) =>
    z
    .object({
      name: z.string(),
      order: z.number().int(),
      draft: z.boolean().default(false),
      status: z.enum(['concept', 'in-development', 'beta', 'live']),
      /** Shown next to the status, e.g. "early access". Never an unconfirmed date. */
      statusNote: z.string().optional(),
      url: z.url().optional(),
      cover: image().optional(),
      mobileCover: image().optional(),
      tagline: z.string(),
      summary: z.string(),
      audience: z.string(),
      facts: z.array(z.string()).default([]),
      features: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
      seo: seo.optional(),
    })
    .refine((p) => p.status !== 'live' || Boolean(p.url), {
      message: 'A product marked "live" must have a public url.',
      path: ['url'],
    }),
});

export const collections = { services, work, products };
