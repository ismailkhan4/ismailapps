/**
 * A still koi, seen from above, for cards and the field guide. Uses the same skin painter and body
 * profile as the live pond, shaded on the CPU the way the koi shader shades it, so it is the same fish.
 */
import { ATLAS_W, BODY_END, Koi, ROW_H, TAIL_START, bodyHalf, tailHalf, type Variety } from './koi';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Draw a koi into `canvas` (sized by its width/height attributes). Returns the Koi used, for its name and traits. */
export function drawKoi(canvas: HTMLCanvasElement, variety: Variety, seed: number, bend = 0.06): Koi {
  const k = new Koi(variety, seed, 400, 400, 0, 0);
  const skin = new ImageData(ATLAS_W, ROW_H);
  k.paint(skin);
  const Wc = canvas.width, Hc = canvas.height;
  const L = Wc * 0.86, x0 = Wc * 0.07, cy = Hc / 2;
  const img = new ImageData(Wc, Hc);
  const d = img.data, sd = skin.data;
  const center = (u: number) => cy + Math.sin(u * Math.PI * 1.4 - 0.6) * bend * L * u * u;
  const put = (i: number, r: number, g: number, b: number, a: number) => {
    // "over" blend into the buffer (premultiplied maths, stored straight)
    const da = d[i + 3]! / 255, oa = a + da * (1 - a);
    if (oa <= 0) return;
    d[i] = ((r * a + (d[i]! / 255) * da * (1 - a)) / oa) * 255;
    d[i + 1] = ((g * a + (d[i + 1]! / 255) * da * (1 - a)) / oa) * 255;
    d[i + 2] = ((b * a + (d[i + 2]! / 255) * da * (1 - a)) / oa) * 255;
    d[i + 3] = oa * 255;
  };
  const toL = { x: -0.6, y: -0.8 };
  for (let py = 0; py < Hc; py++) {
    for (let px = 0; px < Wc; px++) {
      const u = (px - x0) / L;
      if (u < -0.02 || u > 1.02) continue;
      const i = (py * Wc + px) * 4;
      const yc = center(u);
      // pectoral fins (under the body)
      for (const side of [-1, 1]) {
        const bu = 0.2, bx = x0 + bu * L, by = center(bu) + side * bodyHalf(bu) * L * 0.6;
        const a = 0.95, dx = Math.cos(a), dy = Math.sin(a) * side;
        const rx = px - bx, ry = py - by;
        const t = (rx * dx + ry * dy) / (L * 0.14), v = (rx * -dy + ry * dx) / (L * 0.075);
        if (t >= 0 && t <= 1) {
          const wf = (0.42 + 0.58 * t) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 5)));
          const shape = sstep(wf, wf - 0.18, Math.abs(v));
          if (shape > 0) {
            const rays = 0.82 + 0.18 * Math.sin((v / (t + 0.25)) * 5);
            const moto = k.moto * sstep(0.6, 0.2, t);
            const c = k.fin.map(ch => ch * rays * (1 - moto) + 0.05 * moto);
            put(i, c[0]!, c[1]!, c[2]!, shape * (0.5 + 0.25 * (1 - t) + moto * 0.25));
          }
        }
      }
      // tail fin
      if (u >= TAIL_START && u <= 1) {
        const half = tailHalf(u) * L, v = (py - yc) / half, t = (u - TAIL_START) / (1 - TAIL_START);
        if (Math.abs(v) <= 1) {
          const edge = 1 - 0.3 * (1 - Math.abs(v));
          const shape = sstep(edge, edge - 0.07, t) * sstep(1, 0.85, Math.abs(v));
          const rays = 0.82 + 0.18 * Math.sin(v * 26 + t * 1.5);
          if (shape > 0) put(i, k.fin[0] * rays, k.fin[1] * rays, k.fin[2] * rays, shape * (0.45 + 0.3 * (1 - t)));
        }
      }
      // body
      if (u >= 0 && u <= BODY_END) {
        const half = bodyHalf(u) * L;
        if (half < 0.3) continue;
        const v = (py - yc) / half;
        if (Math.abs(v) > 1) continue;
        const sx = Math.min(ATLAS_W - 1, Math.floor((u / BODY_END) * ATLAS_W));
        const sy = Math.min(ROW_H - 1, Math.floor((v * 0.5 + 0.5) * ROW_H));
        const si = (sy * ATLAS_W + sx) * 4;
        let r = sd[si]! / 255, g = sd[si + 1]! / 255, b = sd[si + 2]! / 255;
        const nz = Math.sqrt(Math.max(0, 1 - v * v));
        // scales
        const scx = u * 44 + 0.5 * (Math.floor(v * 6.2) % 2), scy = v * 6.2;
        const fx = scx - Math.floor(scx) - 0.5, fy = scy - Math.floor(scy) - 0.5;
        const se = sstep(0.25, 0.5, Math.hypot(fx, fy * 1.2)) * sstep(0.17, 0.23, u) * nz;
        let m = 1 - 0.09 * se;
        const gill = Math.exp(-Math.pow((u - 0.165 - 0.035 * v * v) / 0.006, 2)) * sstep(1, 0.3, Math.abs(v));
        m *= 1 - 0.14 * gill;
        const dor = Math.exp(-Math.pow(v / 0.07, 2)) * sstep(0.3, 0.36, u) * sstep(0.7, 0.6, u);
        r = r * m; g = g * m; b = b * m;
        r = r * (1 - dor * 0.2) + dor * 0.02; g = g * (1 - dor * 0.2) + dor * 0.02; b = b * (1 - dor * 0.2) + dor * 0.02;
        const eye = sstep(0.15, 0.09, Math.hypot((u - 0.07) * 9, Math.abs(v) - 0.8));
        r = r + (0.05 - r) * eye * 0.8; g = g + (0.05 - g) * eye * 0.8; b = b + (0.06 - b) * eye * 0.8;
        const ls = v < 0 ? toL.y : -toL.y;
        const diff = 0.66 + 0.3 * nz + 0.1 * Math.abs(v) * ls;
        const sheen = 0.05 * Math.pow(nz, 20) + k.metal * 0.16 * Math.pow(nz, 3);
        put(i, clamp(r * diff + sheen, 0, 1), clamp(g * diff + sheen * 0.9, 0, 1), clamp(b * diff + sheen * 0.6, 0, 1), sstep(1, 0.8, Math.abs(v)));
      }
    }
  }
  const off = document.createElement('canvas'); off.width = Wc; off.height = Hc;
  off.getContext('2d')!.putImageData(img, 0, 0);
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, Wc, Hc);
  ctx.save();
  ctx.shadowColor = 'rgba(30, 40, 30, 0.28)'; ctx.shadowBlur = Hc * 0.08; ctx.shadowOffsetX = Hc * 0.05; ctx.shadowOffsetY = Hc * 0.07;
  ctx.drawImage(off, 0, 0);
  ctx.restore();
  return k;
}
