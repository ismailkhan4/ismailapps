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
    /** Full legal name for the imprint and privacy policy. */
    legalName: 'Muhammad Ismail',
    /** Postal address for the imprint and privacy policy. */
    postalAddress: 'J3 Block, Johar Town, Lahore, Pakistan',
  },
  /** Not registered yet. Never claim otherwise. */
  registration: null as null | { country: string; legalName: string; number: string },
  /** Optional profile links: hidden until supplied. Never invent URLs. */
  social: {
    linkedin: null as string | null,
    x: null as string | null,
    instagram: null as string | null,
  },
  /** Booking link shown after an inquiry (a plain link: no embed, no third-party cookies). */
  calUrl: 'https://cal.com/ismailapps',
  /** Umami Cloud website id. Analytics only load when this is set (PUBLIC_UMAMI_WEBSITE_ID). */
  umamiWebsiteId: (import.meta.env.PUBLIC_UMAMI_WEBSITE_ID as string | undefined) || null,
  products: {
    hamstalk: 'https://hamstalk.com',
  },
} as const;

export const primaryNav = [
  { href: '/work', label: 'Work' },
  { href: '/services', label: 'Services', hasMenu: true },
  { href: '/products', label: 'Products' },
  { href: '/about', label: 'About' },
] as const;
