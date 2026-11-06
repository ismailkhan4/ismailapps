/**
 * Premium motion layer. Loaded on every page; each feature only activates when
 * its markup is present, the device can hover (where relevant), and the user
 * has not asked for reduced motion. Everything has a static fallback in CSS.
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
const wide = matchMedia('(width >= 56.25rem)');
const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

// 1. Clip reveals: open once when they enter the viewport.
const reveals = document.querySelectorAll<HTMLElement>('[data-clip]');
if (reveals.length) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-open');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  );
  reveals.forEach((el) => io.observe(el));
}

if (!reduce) {
  // 2. Magnetic buttons: lean gently toward the cursor.
  if (canHover) {
    document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.25;
        const y = (e.clientY - r.top - r.height / 2) * 0.35;
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
      el.addEventListener('pointerleave', () => (el.style.transform = ''));
    });

    // 3. Tilt: a sheet of paper turning slightly toward the cursor.
    document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
      const max = Number(el.dataset.tilt) || 6;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--rx', `${(-py * max).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${(px * max).toFixed(2)}deg`);
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });

    // 4. Work index: a screenshot preview that trails the cursor.
    const index = document.querySelector<HTMLElement>('[data-preview-list]');
    const preview = document.querySelector<HTMLElement>('[data-preview]');
    if (index && preview) {
      let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
      const loop = () => {
        x += (tx - x) * 0.14;
        y += (ty - y) * 0.14;
        preview.style.transform = `translate(${x}px, ${y}px)`;
        raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(loop) : 0;
      };
      index.addEventListener('pointermove', (e) => {
        tx = e.clientX + 24;
        ty = e.clientY - 120;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      index.querySelectorAll<HTMLElement>('[data-preview-key]').forEach((row) => {
        row.addEventListener('pointerenter', (e) => {
          if (!preview.classList.contains('is-active')) {
            x = tx = e.clientX + 24;
            y = ty = e.clientY - 120;
          }
          preview.classList.add('is-active');
          const key = row.dataset.previewKey;
          preview.querySelectorAll<HTMLElement>('[data-key]').forEach((img) => {
            img.classList.toggle('is-shown', img.dataset.key === key);
          });
        });
      });
      index.addEventListener('pointerleave', () => preview.classList.remove('is-active'));
    }
  }

  // 5. Pinned scroll sections: expose progress (0–1) as --p and call per-section hooks.
  type Pin = { el: HTMLElement; inner: HTMLElement; setup: () => void; update: (p: number) => void };
  const pins: Pin[] = [];

  // 5a. Services rail: vertical scroll moves the cards sideways.
  document.querySelectorAll<HTMLElement>('[data-pin="rail"]').forEach((el) => {
    const inner = el.querySelector<HTMLElement>('[data-pin-inner]');
    const track = el.querySelector<HTMLElement>('[data-rail-track]');
    if (!inner || !track) return;
    let distance = 0;
    pins.push({
      el,
      inner,
      setup: () => {
        distance = Math.max(0, track.scrollWidth - track.clientWidth);
        el.style.height = `${window.innerHeight + distance}px`;
      },
      update: (p) => (track.style.transform = `translate3d(${-p * distance}px, 0, 0)`),
    });
  });

  // 5b. Release counter: the version number ticks up as the steps go by.
  document.querySelectorAll<HTMLElement>('[data-pin="release"]').forEach((el) => {
    const inner = el.querySelector<HTMLElement>('[data-pin-inner]');
    const counter = el.querySelector<HTMLElement>('[data-release-counter]');
    const steps = [...el.querySelectorAll<HTMLElement>('[data-release-step]')];
    if (!inner || !counter || !steps.length) return;
    let current = -1;
    pins.push({
      el,
      inner,
      setup: () => (el.style.height = `${window.innerHeight * (1 + steps.length * 0.55)}px`),
      update: (p) => {
        el.style.setProperty('--p', p.toFixed(4));
        const i = Math.min(steps.length - 1, Math.floor(p * steps.length * 0.999));
        if (i === current) return;
        current = i;
        steps.forEach((s, n) => s.classList.toggle('is-current', n === i));
        steps.forEach((s, n) => s.classList.toggle('is-done', n < i));
        counter.classList.remove('tick');
        void counter.offsetWidth;
        counter.textContent = steps[i]?.dataset.releaseStep ?? '';
        counter.classList.add('tick');
      },
    });
  });

  if (pins.length) {
    const measure = () => {
      for (const pin of pins) {
        if (wide.matches) {
          pin.el.classList.add('is-pinned');
          pin.setup();
        } else {
          pin.el.classList.remove('is-pinned');
          pin.el.style.height = '';
        }
      }
      tick();
    };
    let queued = false;
    const tick = () => {
      queued = false;
      if (!wide.matches) return;
      for (const pin of pins) {
        const r = pin.el.getBoundingClientRect();
        const span = pin.el.offsetHeight - window.innerHeight;
        pin.update(span > 0 ? clamp(-r.top / span) : 0);
      }
    };
    addEventListener('scroll', () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(tick);
      }
    }, { passive: true });
    addEventListener('resize', measure);
    wide.addEventListener('change', measure);
    // Fonts and images change widths; measure again once everything has loaded.
    measure();
    addEventListener('load', measure);
  }
}
