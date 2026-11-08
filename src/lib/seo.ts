/** Shared SEO helpers. */
import { site } from './site';

/** File name (without .png) of a page's social image: "/" → "home", "/services/websites" → "services-websites". */
export function ogKey(path: string): string {
  const clean = path.replace(/^\/|\/$/g, '');
  return clean === '' ? 'home' : clean.replace(/\//g, '-');
}

export function breadcrumbList(items: { href?: string; label: string }[], currentPath: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      item: new URL(item.href ?? currentPath, site.url).href,
    })),
  };
}

export const provider = { '@type': 'Organization', name: site.name, url: site.url } as const;
