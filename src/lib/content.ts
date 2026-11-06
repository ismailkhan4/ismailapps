import { getCollection, type CollectionEntry } from 'astro:content';

/** Public entries only (drafts excluded), in their configured order. */
export async function getServices(): Promise<CollectionEntry<'services'>[]> {
  return (await getCollection('services')).sort((a, b) => a.data.order - b.data.order);
}

export async function getWork(kind?: 'case-study' | 'short'): Promise<CollectionEntry<'work'>[]> {
  const all = await getCollection('work', (e) => !e.data.draft && (!kind || e.data.kind === kind));
  return all.sort((a, b) => a.data.order - b.data.order);
}

export async function getProducts(): Promise<CollectionEntry<'products'>[]> {
  const all = await getCollection('products', (e) => !e.data.draft);
  return all.sort((a, b) => a.data.order - b.data.order);
}

/** Where a work entry links to: its case study, or its anchor on /work for short entries. */
export function workHref(entry: CollectionEntry<'work'>): string {
  return entry.data.kind === 'case-study' ? `/work/${entry.id}` : `/work#${entry.id}`;
}

export function contactHref(service?: CollectionEntry<'services'>): string {
  return service ? `/contact?service=${service.data.formValue}` : '/contact';
}
