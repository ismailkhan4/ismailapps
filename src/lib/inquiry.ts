import { z } from 'astro/zod';

/**
 * The project inquiry: options, labels and validation shared by the form
 * (src/components/contact/InquiryForm.astro), the API route
 * (src/pages/api/inquiry.ts) and the content schema (service → form value).
 */

export const needs = [
  { value: 'new-product', label: 'A new product', hint: 'MVP or first production version' },
  { value: 'prototype-to-production', label: 'Take my prototype to production', hint: 'Built with AI tools, no-code or a freelancer' },
  { value: 'saas-engineering', label: 'Engineering for my SaaS', hint: 'Features, AI, integrations, upkeep' },
  { value: 'website', label: 'A website', hint: 'For a software or service business' },
  { value: 'not-sure', label: 'Not sure yet', hint: "We'll help you work it out" },
] as const;

export const stages = [
  { value: 'idea', label: 'Idea' },
  { value: 'designs', label: 'Designs' },
  { value: 'prototype', label: 'Prototype / MVP' },
  { value: 'live', label: 'Live product' },
] as const;

export const budgets = [
  { value: '3-10k', label: '€3–10k' },
  { value: '10-25k', label: '€10–25k' },
  { value: '25-50k', label: '€25–50k' },
  { value: '50k-plus', label: '€50k+' },
  { value: 'not-sure', label: 'Not sure yet' },
] as const;

export const timelines = [
  { value: 'asap', label: 'As soon as possible' },
  { value: '1-3-months', label: '1–3 months' },
  { value: '3-plus-months', label: '3+ months' },
  { value: 'flexible', label: 'Flexible' },
] as const;

type Values<T extends readonly { value: string }[]> = [T[number]['value'], ...T[number]['value'][]];
const values = <T extends readonly { value: string }[]>(list: T) => list.map((o) => o.value) as Values<T>;

export const needValues = values(needs);

export const limits = { description: { min: 20, max: 3000 } } as const;

/** Treat empty form fields as "not provided". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema.optional());

export const inquirySchema = z.object({
  name: z.string().trim().min(1, 'Please tell us your name.').max(120, 'Please keep your name under 120 characters.'),
  email: z.string().trim().max(254).pipe(z.email('Please enter a valid email address.')),
  company: optional(z.string().trim().max(160, 'Please keep this under 160 characters.')),
  need: z.enum(needValues, 'Please choose what you need.'),
  stage: z.enum(values(stages), 'Please choose where your product is today.'),
  budget: z.enum(values(budgets), 'Please choose a budget range.'),
  timeline: z.enum(values(timelines), 'Please choose a timeline.'),
  description: z
    .string()
    .trim()
    .min(limits.description.min, `Please write at least ${limits.description.min} characters.`)
    .max(limits.description.max, `Please keep this under ${limits.description.max} characters.`),
  link: optional(
    z
      .string()
      .trim()
      .max(500)
      .pipe(z.url({ protocol: /^https?$/, error: 'Please enter a full link starting with https://' })),
  ),
});

export type Inquiry = z.infer<typeof inquirySchema>;

export const labelFor = (list: readonly { value: string; label: string }[], value: string) =>
  list.find((o) => o.value === value)?.label ?? value;

/** Field names that are not part of the inquiry itself. */
export const HONEYPOT = 'company_website';
export const TURNSTILE_FIELD = 'cf-turnstile-response';
