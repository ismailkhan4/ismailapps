/**
 * Site-wide facts. Anything the founder has not yet supplied is `null` and
 * renders as a visible placeholder (or is hidden, for optional links).
 * Production builds fail while placeholders remain — see integrations/placeholder-guard.mjs.
 */
export const site = {
  name: 'IsmailApps',
  url: 'https://ismailapps.com',
  email: 'hello@ismailapps.com',
  founder: {
    displayName: 'Ismail',
    /** Full legal name for the imprint. [NEEDED] */
    legalName: null as string | null,
    /** Postal address for the imprint. [NEEDED] */
    postalAddress: null as string | null,
  },
  /** Not registered yet. Never claim otherwise. */
  registration: null as null | { country: string; legalName: string; number: string },
  /** Optional profile links: hidden until supplied. Never invent URLs. */
  social: {
    linkedin: null as string | null,
    x: null as string | null,
    instagram: null as string | null,
  },
  /** Cal.com booking link for /contact/thanks. [NEEDED] */
  calUrl: null as string | null,
  products: {
    hamstalk: 'https://hamstalk.com',
  },
} as const;

export type NavService = { slug: string; title: string; short: string };

/** Service order used in the header, footer and homepage. */
export const services: readonly NavService[] = [
  { slug: 'scoping-sprint', title: 'Product scoping sprint', short: 'Scope, flows and a fixed quote' },
  { slug: 'product-development', title: 'SaaS & AI product development', short: 'Your MVP or v1, built properly' },
  { slug: 'prototype-to-production', title: 'Prototype to production', short: 'From AI tools, no-code or a freelancer' },
  { slug: 'product-engineering', title: 'Product engineering & maintenance', short: 'Ongoing work on a live product' },
  { slug: 'websites', title: 'Websites', short: 'For software and service businesses' },
];

export const primaryNav = [
  { href: '/work', label: 'Work' },
  { href: '/services', label: 'Services', children: services },
  { href: '/products', label: 'Products' },
  { href: '/about', label: 'About' },
] as const;
