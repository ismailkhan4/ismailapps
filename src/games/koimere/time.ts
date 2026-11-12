// Light over the day, driven by the real clock (or the test slider).
type V3 = [number, number, number];
interface Key { h: number; sun: V3; amb: V3; sky: V3 }

const NIGHT: Omit<Key, 'h'> = { sun: [0.2, 0.24, 0.36], amb: [0.1, 0.12, 0.19], sky: [0.1, 0.12, 0.2] };
const KEYS: Key[] = [
  { h: 0, ...NIGHT },
  { h: 4.8, ...NIGHT },
  { h: 6.3, sun: [0.85, 0.6, 0.48], amb: [0.2, 0.2, 0.26], sky: [0.7, 0.6, 0.64] },
  { h: 8.5, sun: [1.0, 0.92, 0.8], amb: [0.29, 0.32, 0.33], sky: [0.78, 0.84, 0.88] },
  { h: 13, sun: [1.05, 1.0, 0.93], amb: [0.32, 0.36, 0.36], sky: [0.82, 0.88, 0.92] },
  { h: 17, sun: [1.0, 0.85, 0.64], amb: [0.29, 0.29, 0.29], sky: [0.84, 0.8, 0.72] },
  { h: 19, sun: [0.88, 0.47, 0.28], amb: [0.2, 0.16, 0.19], sky: [0.74, 0.47, 0.38] },
  { h: 20.4, sun: [0.2, 0.18, 0.3], amb: [0.085, 0.085, 0.14], sky: [0.16, 0.15, 0.24] },
  { h: 21.5, ...NIGHT },
  { h: 24, ...NIGHT },
];
const DEEP_BASE: V3 = [0.06, 0.13, 0.1];

const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export interface Light { sun: V3; amb: V3; sky: V3; deep: V3; light: V3; shadowLen: number; night: number; label: string }

export function lightAt(hours: number): Light {
  const h = ((hours % 24) + 24) % 24;
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1]!.h <= h) i++;
  const a = KEYS[i]!, b = KEYS[i + 1]!;
  const t = (h - a.h) / (b.h - a.h || 1), s = t * t * (3 - 2 * t);
  const sun = mix(a.sun, b.sun, s), amb = mix(a.amb, b.amb, s), sky = mix(a.sky, b.sky, s);
  const deep: V3 = [0, 1, 2].map(k => DEEP_BASE[k]! * (amb[k]! * 1.7 + sun[k]! * 0.45)) as V3;
  const sunH = Math.sin(Math.PI * (h - 6) / 13);
  const night = h < 4.8 || h > 21.5 ? 1 : h < 6 ? (6 - h) / 1.2 : h > 20.2 ? (h - 20.2) / 1.3 : 0;
  const elev = sunH > 0.12 ? sunH : 0.55;           // moonlight at night
  const az = sunH > 0.12 ? (h - 12.5) * 0.12 : 0;   // the sun swings across a little
  const lx = -0.62 + az, ly = 0.5;
  const ll = Math.hypot(lx, ly, elev * 1.3);
  const light: V3 = [lx / ll, ly / ll, (elev * 1.3) / ll];
  const shadowLen = 0.008 + 0.018 * (1 - Math.min(1, elev));
  return { sun, amb, sky, deep, light, shadowLen, night: Math.min(1, Math.max(0, night)), label: partOfDay(h) };
}

function partOfDay(h: number): string {
  if (h < 5) return 'Night'; if (h < 7.5) return 'Dawn'; if (h < 11) return 'Morning'; if (h < 14) return 'Midday';
  if (h < 17.5) return 'Afternoon'; if (h < 20) return 'Dusk'; if (h < 22) return 'Evening'; return 'Night';
}

export const clock = (h: number) => {
  const hh = Math.floor(((h % 24) + 24) % 24), mm = Math.floor((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
