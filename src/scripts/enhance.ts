/**
 * Progressive enhancement for the whole site. Everything works without it;
 * this only adds polish. Kept deliberately small.
 */

// 1. Disclosure menus (desktop Services): close on Escape, outside click, or when another opens.
const disclosures = [...document.querySelectorAll<HTMLDetailsElement>('[data-disclosure]')];
for (const d of disclosures) {
  d.addEventListener('toggle', () => {
    if (d.open) for (const other of disclosures) if (other !== d) other.open = false;
  });
}

// 2. Mobile menu: lock page scroll and make the page behind it inert while open.
const mobile = document.querySelector<HTMLDetailsElement>('[data-mobile-menu]');
const main = document.querySelector('main');
const footer = document.querySelector('footer');
mobile?.addEventListener('toggle', () => {
  const open = mobile.open;
  document.documentElement.style.overflow = open ? 'hidden' : '';
  for (const el of [main, footer]) if (el) el.inert = open;
});
mobile?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => (mobile.open = false)));
// Close the mobile menu if the viewport grows past the breakpoint.
matchMedia('(width >= 56.25rem)').addEventListener('change', (e) => {
  if (e.matches && mobile?.open) mobile.open = false;
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const d of [...disclosures, mobile]) {
    if (d?.open) {
      d.open = false;
      d.querySelector('summary')?.focus();
    }
  }
});
document.addEventListener('click', (e) => {
  for (const d of disclosures) if (d.open && !d.contains(e.target as Node)) d.open = false;
});

// 3. Scroll reveal for [data-reveal] (annotations, callouts). CSS hides them only when
//    `.js` is set and motion is allowed, so content is never lost.
const reveal = document.querySelectorAll('[data-reveal]');
if (reveal.length && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  );
  reveal.forEach((el) => io.observe(el));
} else {
  reveal.forEach((el) => el.classList.add('is-visible'));
}
