/**
 * Site-wide motion system: "the page ships as you scroll". Loaded on every
 * page (BaseLayout); each feature only runs when its markup is present.
 *
 * One passive scroll listener schedules one rAF that updates every scrubbed
 * feature (CSS custom properties only, no layout reads inside hot loops beyond
 * a handful of getBoundingClientRect calls). Pointer-driven features run their
 * own rAF loop only while their section is on screen.
 *
 * Everything degrades: no JS → static CSS states; reduced motion → no pinning,
 * no drift, no tilt; touch → drift instead of cursor, swipe carousel instead of
 * the pinned reel.
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const wide = matchMedia('(width >= 56.25rem)');
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const vh = () => window.innerHeight;

type Feature = { measure?: () => void; scroll?: () => void };
const features: Feature[] = [];

/* ------------------------------------------------------------------ */
/* 1. Hero: production lens + variable-weight proximity                */
/* ------------------------------------------------------------------ */
const hero = document.querySelector<HTMLElement>('[data-hero]');
const lensLine = hero?.querySelector<HTMLElement>('[data-lens]');
if (hero && lensLine) {
  const title = hero.querySelector<HTMLElement>('.hero-title')!;
  const draft = [...lensLine.querySelectorAll<HTMLElement>('.hl-draft .ch')];
  const solid = [...lensLine.querySelectorAll<HTMLElement>('.hl-solid .ch')];
  const first = [...hero.querySelectorAll<HTMLElement>('.hl-1 .ch')];
  const pairs: { els: HTMLElement[]; cx: number; cy: number; w: number }[] = [
    ...first.map((el) => ({ els: [el], cx: 0, cy: 0, w: 600 })),
    ...draft.map((el, i) => ({ els: [el, solid[i]!], cx: 0, cy: 0, w: 600 })),
  ];

  let box = { left: 0, top: 0, width: 1, height: 1, fs: 100 }; // lens line, in hero-local coords
  let heroTop = 0;
  let s = 0; // hero scroll progress 0–1
  let tx = 0, ty = 0, x = 0, y = 0;
  let pointerIn = false;
  let visible = true;
  let raf = 0;

  const measure = () => {
    const hr = hero.getBoundingClientRect();
    heroTop = hr.top + scrollY;
    const r = lensLine.getBoundingClientRect();
    box = {
      left: r.left - hr.left,
      top: r.top - hr.top,
      width: r.width,
      height: r.height,
      fs: parseFloat(getComputedStyle(title).fontSize),
    };
    for (const p of pairs) {
      const c = p.els[0]!.getBoundingClientRect();
      p.cx = c.left - hr.left + c.width / 2;
      p.cy = c.top - hr.top + c.height / 2;
    }
    if (!x && !y) {
      x = tx = box.width * 0.58;
      y = ty = box.height * 0.52;
    }
  };

  const drift = (t: number) => {
    tx = box.width * (0.52 + 0.36 * Math.sin(t * 0.00038));
    ty = box.height * (0.5 + 0.16 * Math.sin(t * 0.00093 + 1.3));
  };

  const render = () => {
    const base = box.fs * 0.62;
    // Scroll widens the lens until the whole word is solid ("shipped").
    const r = base + smooth(0.05, 0.62, s) * box.width * 1.15;
    lensLine.style.setProperty('--lx', `${x.toFixed(1)}px`);
    lensLine.style.setProperty('--ly', `${y.toFixed(1)}px`);
    lensLine.style.setProperty('--r', `${r.toFixed(1)}px`);
    lensLine.style.setProperty('--ring-o', (1 - smooth(0.3, 0.55, s)).toFixed(3));
    title.style.setProperty('--shift-1', `${(-s * 7).toFixed(2)}vw`);
    title.style.setProperty('--shift-2', `${(s * 5).toFixed(2)}vw`);

    if (reduce) return;
    const lx = box.left + x;
    const ly = box.top + y;
    const reach = Math.max(r * 2.1, box.fs * 1.6);
    const settle = 1 - smooth(0.3, 0.6, s);
    for (const p of pairs) {
      const d = Math.hypot(p.cx - lx, (p.cy - ly) * 1.3);
      const k = Math.max(0, 1 - d / reach);
      const target = 600 + 300 * k * k * settle + 120 * (1 - settle);
      p.w += (target - p.w) * 0.18;
      const w = Math.round(p.w);
      for (const el of p.els) if (el.style.getPropertyValue('--w') !== String(w)) el.style.setProperty('--w', String(w));
    }
  };

  const loop = (t: number) => {
    if (!pointerIn || !fine) drift(t);
    x += (tx - x) * 0.09;
    y += (ty - y) * 0.09;
    render();
    raf = visible ? requestAnimationFrame(loop) : 0;
  };

  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    const hr = hero.getBoundingClientRect();
    pointerIn = true;
    tx = e.clientX - hr.left - box.left;
    ty = e.clientY - hr.top - box.top;
    if (reduce) {
      x = tx;
      y = ty;
      render();
    }
  });
  hero.addEventListener('pointerleave', () => (pointerIn = false));

  if (!reduce) {
    new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    }).observe(hero);
  }

  features.push({
    measure: () => {
      measure();
      render();
    },
    scroll: () => {
      s = clamp((scrollY - heroTop) / (hero.offsetHeight * 0.85));
      if (reduce) render();
    },
  });
}

/* ------------------------------------------------------------------ */
/* 2. Stage rows: each title fills to its state as it crosses the view */
/* ------------------------------------------------------------------ */
const rows = [...document.querySelectorAll<HTMLElement>('[data-fill-row]')];
if (rows.length && !reduce) {
  features.push({
    scroll: () => {
      const h = vh();
      for (const row of rows) {
        const r = row.getBoundingClientRect();
        if (r.bottom < 0 || r.top > h) continue;
        const target = parseFloat(row.style.getPropertyValue('--target')) || 0;
        const k = smooth(h * 0.95, h * 0.45, r.top); // 0 entering → 1 at 45% of the viewport
        row.style.setProperty('--fill', (target * k).toFixed(3));
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/* 3. Build process: pinned, ink opens, counter gains weight           */
/* ------------------------------------------------------------------ */
const build = document.querySelector<HTMLElement>('[data-build]');
if (build && !reduce) {
  const counter = build.querySelector<HTMLElement>('[data-build-counter]')!;
  const steps = [...build.querySelectorAll<HTMLElement>('[data-build-step]')];
  const bars = [...build.querySelectorAll<HTMLElement>('.build-bar li')];
  const joined = build.hasAttribute('data-joined');
  let current = -1;
  let pinned = false;
  features.push({
    measure: () => {
      pinned = wide.matches;
      build.classList.toggle('is-pinned', pinned);
      build.style.height = pinned ? `${vh() * (1.2 + steps.length * 0.55)}px` : '';
    },
    scroll: () => {
      if (!pinned) return;
      const r = build.getBoundingClientRect();
      const h = vh();
      // Entry: the panel opens to full bleed. A standalone panel (not joined to
      // the next ink section) closes back into a card as it leaves.
      const exit = joined ? 0 : smooth(h, h * 0.1, r.bottom);
      const e = smooth(h * 0.9, 0, r.top) * (1 - exit);
      const span = build.offsetHeight - h;
      const p = clamp(-r.top / span);
      build.style.setProperty('--e', e.toFixed(4));
      build.style.setProperty('--p', p.toFixed(4));
      const i = Math.min(steps.length - 1, Math.floor(p * steps.length * 0.999));
      if (i === current) return;
      current = i;
      steps.forEach((s, n) => {
        s.classList.toggle('is-current', n === i);
        s.classList.toggle('is-done', n < i);
      });
      bars.forEach((b, n) => b.classList.toggle('is-done', n <= i));
      const v = steps[i]?.dataset.buildStep ?? '';
      build.classList.toggle('is-live', v.startsWith('v1'));
      counter.textContent = v;
      counter.classList.remove('tick');
      void counter.offsetWidth;
      counter.classList.add('tick');
    },
  });
}

/* ------------------------------------------------------------------ */
/* 4. Shipped reel: pinned horizontal track, frames go live at centre  */
/* ------------------------------------------------------------------ */
const reel = document.querySelector<HTMLElement>('[data-reel]');
if (reel && !reduce) {
  const track = reel.querySelector<HTMLElement>('[data-reel-track]')!;
  const slides = [...reel.querySelectorAll<HTMLElement>('[data-slide]')];
  const num = reel.querySelector<HTMLElement>('[data-reel-n]');
  const bar = reel.querySelector<HTMLElement>('.reel-progress');
  let distance = 0;
  let pinned = false;
  let geo: { left: number; width: number }[] = [];
  features.push({
    measure: () => {
      pinned = wide.matches;
      reel.classList.toggle('is-pinned', pinned);
      track.style.removeProperty('--tx');
      if (!pinned) {
        reel.style.height = '';
        slides.forEach((s) => s.style.removeProperty('--f'));
        return;
      }
      const pad = parseFloat(getComputedStyle(track).paddingLeft);
      geo = slides.map((s) => ({ left: s.offsetLeft, width: s.offsetWidth }));
      const last = geo[geo.length - 1]!;
      // Travel until the last slide is centred.
      distance = Math.max(0, last.left + last.width / 2 - window.innerWidth / 2);
      void pad;
      reel.style.height = `${vh() + distance}px`;
    },
    scroll: () => {
      if (!pinned) return;
      const r = reel.getBoundingClientRect();
      const p = distance ? clamp(-r.top / distance) : 0;
      const tx = -p * distance;
      track.style.setProperty('--tx', `${tx.toFixed(1)}px`);
      bar?.style.setProperty('--p', p.toFixed(4));
      const vw = window.innerWidth;
      let best = 0, bestF = -1;
      slides.forEach((s, i) => {
        const g = geo[i]!;
        const c = g.left + g.width / 2 + tx;
        const off = c - vw / 2;
        const f = clamp(1 - Math.abs(off) / (vw * 0.75));
        s.style.setProperty('--f', f.toFixed(3));
        s.style.setProperty('--dir', off < 0 ? '-1' : '1');
        s.style.setProperty('--s', clamp(0.5 - off / (vw * 1.1)).toFixed(4));
        s.classList.toggle('is-live', f > 0.86);
        if (f > bestF) (bestF = f), (best = i);
      });
      if (num) num.textContent = String(best + 1).padStart(2, '0');
    },
  });
  const centre = (i: number) => {
    const g = geo[i];
    if (!g) return null;
    const reelTop = reel.getBoundingClientRect().top + scrollY;
    return reelTop + clamp(g.left + g.width / 2 - window.innerWidth / 2, 0, distance);
  };
  // Deep links (/work#vectum) land on that slide, centred, once the reel is measured.
  const hashSlide = slides.findIndex((s) => location.hash && s.id === decodeURIComponent(location.hash.slice(1)));
  if (hashSlide >= 0) {
    addEventListener(
      'load',
      // After the load-time re-measure below has run.
      () =>
        setTimeout(() => {
          const y = pinned ? centre(hashSlide) : null;
          if (y !== null) window.scrollTo({ top: y, behavior: 'instant' });
        }, 50),
      { once: true },
    );
  }
  // Keyboard: the track is moved by transform, so the browser cannot scroll a
  // focused link into view by itself. Scroll the page to where its slide is centred.
  reel.addEventListener('focusin', (e) => {
    if (!pinned) return;
    const y = centre(slides.findIndex((s) => s.contains(e.target as Node)));
    if (y !== null) window.scrollTo({ top: y, behavior: 'instant' });
  });
}

/* ------------------------------------------------------------------ */
/* 5. Depth stage (own product): pointer + scroll parallax             */
/* ------------------------------------------------------------------ */
const stage = document.querySelector<HTMLElement>('[data-depth-stage]');
if (stage && !reduce) {
  let mx = 0, my = 0, tmx = 0, tmy = 0, raf = 0;
  const loop = () => {
    mx += (tmx - mx) * 0.08;
    my += (tmy - my) * 0.08;
    stage.style.setProperty('--mx', mx.toFixed(4));
    stage.style.setProperty('--my', my.toFixed(4));
    raf = Math.abs(tmx - mx) + Math.abs(tmy - my) > 0.001 ? requestAnimationFrame(loop) : 0;
  };
  if (fine) {
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      tmx = ((e.clientX - r.left) / r.width) * 2 - 1;
      tmy = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    stage.addEventListener('pointerleave', () => {
      tmx = tmy = 0;
      if (!raf) raf = requestAnimationFrame(loop);
    });
  }
  features.push({
    scroll: () => {
      const r = stage.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh()) return;
      const sp = clamp((r.top + r.height / 2 - vh() / 2) / vh(), -1, 1);
      stage.style.setProperty('--sp', sp.toFixed(4));
    },
  });
}

/* ------------------------------------------------------------------ */
/* 6. Crew: the team "joins" when the list enters the view             */
/* ------------------------------------------------------------------ */
const crews = document.querySelectorAll<HTMLElement>('[data-crew]');
if (crews.length) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -25% 0px' },
  );
  crews.forEach((c) => io.observe(c));
}

/* ------------------------------------------------------------------ */
/* 7. Header: build meter + takes on the surface it passes over        */
/* ------------------------------------------------------------------ */
const header = document.querySelector<HTMLElement>('[data-site-header]');
if (header) {
  const themed = [...document.querySelectorAll<HTMLElement>('[data-theme]')];
  const meter = header.querySelector<HTMLElement>('[data-meter]');
  const mv = header.querySelector<HTMLElement>('[data-meter-v]');
  const ms = header.querySelector<HTMLElement>('[data-meter-s]');
  let last = '';
  features.push({
    scroll: () => {
      const probe = header.offsetHeight / 2;
      let theme = '';
      for (const el of themed) {
        const r = el.getBoundingClientRect();
        if (r.top <= probe && r.bottom >= probe) theme = el.dataset.theme ?? '';
      }
      header.classList.toggle('on-ink', theme === 'ink');
      header.classList.toggle('on-live', theme === 'live');

      const max = document.documentElement.scrollHeight - vh();
      const page = max > 0 ? clamp(scrollY / max) : 0;
      header.style.setProperty('--page', page.toFixed(4));
      // v0.1 at the top → v1.0 once the closing section is reached.
      const v = page > 0.94 ? 'v1.0' : `v0.${Math.min(9, 1 + Math.floor(page * 9.5))}`;
      const label = page > 0.94 ? 'live' : page > 0.35 ? 'building' : 'draft';
      const key = v + label;
      if (key !== last && mv && ms && meter) {
        last = key;
        mv.textContent = v;
        ms.textContent = label;
        meter.classList.toggle('is-live', label === 'live');
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/* Driver                                                              */
/* ------------------------------------------------------------------ */
let queued = false;
const tick = () => {
  queued = false;
  for (const f of features) f.scroll?.();
};
const measureAll = () => {
  for (const f of features) f.measure?.();
  tick();
};
addEventListener(
  'scroll',
  () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(tick);
    }
  },
  { passive: true },
);
let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(measureAll, 120);
});
wide.addEventListener('change', measureAll);
measureAll();
// Fonts and images change sizes: measure again once they have loaded.
document.fonts?.ready.then(measureAll);
addEventListener('load', measureAll);
// The hero's entrance moves letters for ~1.4s; re-measure once it has settled.
setTimeout(measureAll, 1700);

export {};
