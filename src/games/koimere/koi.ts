// Koi: variety rules, pattern painting, swimming behaviour and mesh output.
import { clamp, fbm, lerp, rng, smoothstep, vnoise } from './noise';

export type Variety = 'kohaku' | 'tancho' | 'sanke' | 'showa' | 'ogon' | 'chagoi';
export const VARIETIES: Variety[] = ['kohaku', 'tancho', 'sanke', 'showa', 'ogon', 'chagoi'];

export const VARIETY_INFO: Record<Variety, { label: string; note: string }> = {
  kohaku: { label: 'Kohaku', note: 'White skin with red (hi) markings. The classic koi.' },
  tancho: { label: 'Tanchō', note: 'One round red spot on the head, named after the red-crowned crane.' },
  sanke: { label: 'Taishō Sanke', note: 'A kohaku pattern with small black (sumi) accents on the back.' },
  showa: { label: 'Shōwa', note: 'Black base with red and white. The black reaches the head.' },
  ogon: { label: 'Ōgon', note: 'One metallic colour, gold from nose to tail.' },
  chagoi: { label: 'Chagoi', note: 'Tea-brown and known for being friendly. Usually first to the food.' },
};

const NAMES = ['Hana', 'Mochi', 'Kumo', 'Sora', 'Yuzu', 'Tama', 'Ren', 'Kiku', 'Umi', 'Nori', 'Pip', 'Juniper',
  'Ember', 'Tofu', 'Sumi', 'Maple', 'Biscuit', 'Haru', 'Willow', 'Pebble', 'Clover', 'Saffron', 'Rook', 'Fern'];

export interface Pellet { x: number; y: number; vx: number; vy: number; age: number; eaten: boolean }
export interface World {
  w: number; h: number; t: number;
  fish: Koi[]; pellets: Pellet[];
  addDrop(x: number, y: number, radiusPx: number, strength: number): void;
  /** While a pond is only partly dredged, koi stay inside this circle (px). */
  bound?: { x: number; y: number; r: number } | null;
}

export const M = 24;            // spine points
export const BODY_END = 0.84;
export const TAIL_START = 0.78;
export const ROW_H = 64, ATLAS_W = 256, ATLAS_ROWS = 16;
export const STRIDE = 14;       // floats per koi vertex

/** Half-width of the body as a fraction of total length, top view. */
export function bodyHalf(u: number): number {
  if (u <= 0.3) { const x = 1 - u / 0.3; return 0.118 * Math.sqrt(Math.max(0, 1 - x * x)); }
  const t = Math.min(1, (u - 0.3) / (BODY_END - 0.3));
  return 0.118 * (1 - 0.8 * Math.pow(t, 1.35));
}
export const tailHalf = (u: number) => { const t = clamp((u - TAIL_START) / (1 - TAIL_START), 0, 1); return 0.022 + 0.088 * Math.pow(t, 1.1); };

type RGB = [number, number, number];
type V4 = [number, number, number, number];
const WHITE: RGB = [0.93, 0.91, 0.86];
const SUMI: RGB = [0.07, 0.07, 0.08];
const GOLD: RGB = [0.92, 0.68, 0.24];
const CHA: RGB = [0.47, 0.33, 0.2];
const mix3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

let nextId = 1;

export class Koi {
  id = nextId++;
  name: string;
  row = 0;
  L: number;
  x: number; y: number; heading: number;
  speed = 0; tailPhase = Math.random() * 6; tailAmp = 0.05;
  depth = 0.5; depthTarget = 0.5;
  startle = 0; fleeX = 0; fleeY = 0;
  boldness: number;
  notice = 0; target: Pellet | null = null; retarget = 0;
  wakeT = 0;
  chain = new Float32Array(M * 2);
  rp = new Float32Array(M * 2);   // rendered spine (with tail wave)
  tn = new Float32Array(M * 2);   // tangent toward tail
  // genetics-ish traits (used later for breeding)
  hi: RGB; coverage: number; stepFreq: number;
  metal: number; moto: number; fin: RGB;
  lengthCm: number; ageYears: number;

  constructor(public variety: Variety, public seed: number, w: number, h: number, x?: number, y?: number) {
    const r = rng(seed);
    this.name = NAMES[Math.floor(r() * NAMES.length)]!;
    const base = clamp(Math.min(w, h) * 0.25, 70, 190);
    const size = 0.72 + r() * 0.42;
    this.L = base * size;
    this.lengthCm = Math.round(28 + size * 34);
    this.ageYears = Math.max(1, Math.round(size * 6 - 2 + r() * 2));
    this.x = x ?? w * (0.2 + 0.6 * r());
    this.y = y ?? h * (0.2 + 0.6 * r());
    this.heading = r() * Math.PI * 2;
    this.depth = this.depthTarget = 0.25 + r() * 0.6;
    this.boldness = variety === 'chagoi' ? 0.85 + r() * 0.15 : 0.2 + r() * 0.6;
    this.hi = mix3([0.72, 0.15, 0.06], [0.86, 0.33, 0.1], r());
    this.coverage = (r() - 0.5) * 0.35;
    this.stepFreq = 2 + r() * 2.5;
    this.metal = variety === 'ogon' ? 1 : variety === 'chagoi' ? 0.12 : 0;
    this.moto = variety === 'showa' ? 1 : variety === 'sanke' ? 0.35 * r() : 0;
    this.fin = variety === 'ogon' ? [0.95, 0.74, 0.32] : variety === 'chagoi' ? [0.52, 0.38, 0.25]
      : variety === 'showa' ? [0.9, 0.86, 0.8] : [0.94, 0.92, 0.88];
    // lay the body out behind the head
    const seg = this.L / (M - 1), dx = -Math.cos(this.heading), dy = -Math.sin(this.heading);
    for (let i = 0; i < M; i++) { this.chain[i * 2] = this.x + dx * seg * i; this.chain[i * 2 + 1] = this.y + dy * seg * i; }
    this.rp.set(this.chain);
  }

  get personality(): string {
    return this.boldness > 0.8 ? 'Bold, comes to your hand' : this.boldness > 0.5 ? 'Curious' : 'Shy, keeps to the deep';
  }

  /** Paint this fish's skin into its atlas row. x = along body (0 nose → 1 peduncle), y = across (-1..1). */
  paint(img: ImageData) {
    const d = img.data, s = this.seed % 9973;
    for (let py = 0; py < ROW_H; py++) {
      const v = ((py + 0.5) / ROW_H) * 2 - 1;
      const av = Math.abs(v);
      for (let px = 0; px < ATLAS_W; px++) {
        const u = ((px + 0.5) / ATLAS_W) * BODY_END;
        const X = u, Y = v * bodyHalf(u);              // body space, units of fish length
        const back = 1 - Math.pow(av, 2.2) * 0.9;       // markings sit on the back, sides stay white
        let c: RGB = WHITE;
        const hiVal = () => {
          let val = (fbm(X * 7, Y * 7, s) - 0.5) * 2.8 + 0.6 * back - 0.42 + this.coverage;
          val += 0.16 * Math.sin(X * Math.PI * 2 * this.stepFreq + s);               // broken "steps" pattern
          val += 0.3 * smoothstep(0.04, 0.09, X) * (1 - smoothstep(0.17, 0.22, X)) * (1 - av); // head marking
          val -= smoothstep(0.05, 0.02, X) * 2;                                        // white nose
          val -= smoothstep(0.7, 0.84, X) * 1.2;                                       // clean tail joint
          return val;
        };
        switch (this.variety) {
          case 'kohaku': c = mix3(WHITE, this.hi, smoothstep(-0.03, 0.03, hiVal())); break;
          case 'tancho': {
            const dd = Math.hypot((X - 0.12) * 1.1, Y);
            c = mix3(WHITE, this.hi, smoothstep(0.044, 0.04, dd)); break;
          }
          case 'sanke': {
            c = mix3(WHITE, this.hi, smoothstep(-0.03, 0.03, hiVal()));
            const sv = (fbm(X * 16, Y * 16, s + 99) - 0.5) * 3.2 - 0.5 + 0.3 * back;
            c = mix3(c, SUMI, smoothstep(-0.03, 0.03, sv) * smoothstep(0.22, 0.27, X) * (1 - smoothstep(0.74, 0.8, X))); break;
          }
          case 'showa': {
            c = mix3(WHITE, this.hi, smoothstep(-0.03, 0.03, hiVal() - 0.1));
            let sv = (fbm(X * 6, Y * 6, s + 51) - 0.5) * 3 + 0.05 + 0.6 * av * av;
            const bolt = Math.abs(Y - (X - 0.12) * 1.4);                                   // head "lightning" line
            sv = Math.max(sv, (smoothstep(0.018, 0.008, bolt) * smoothstep(0.05, 0.08, X) * (1 - smoothstep(0.2, 0.24, X))) * 2 - 1);
            c = mix3(c, SUMI, smoothstep(-0.03, 0.03, sv)); break;
          }
          case 'ogon': c = mix3(GOLD, [0.78, 0.5, 0.14], back * 0.35); break;
          case 'chagoi': c = mix3(CHA, [0.36, 0.24, 0.14], back * 0.4); break;
        }
        const skin = 0.95 + 0.1 * fbm(X * 40, Y * 40, s + 7, 3);   // break up flat colour
        const i = ((py * ATLAS_W) + px) * 4;
        d[i] = clamp(c[0]! * skin, 0, 1) * 255; d[i + 1] = clamp(c[1]! * skin, 0, 1) * 255;
        d[i + 2] = clamp(c[2]! * skin, 0, 1) * 255; d[i + 3] = 255;
      }
    }
  }

  update(dt: number, w: World) {
    const L = this.L, t = w.t;
    let hx = Math.cos(this.heading), hy = Math.sin(this.heading);
    // wander
    const wander = (vnoise(t * 0.12, this.seed * 0.37, 3) - 0.5) * 2.4;
    let vx = Math.cos(this.heading + wander), vy = Math.sin(this.heading + wander);
    // walls (look ahead)
    const m = L * 0.35, ax = this.x + hx * L * 1.3, ay = this.y + hy * L * 1.3;
    let wx = 0, wy = 0;
    if (ax < m) wx += (m - ax) / L; if (ax > w.w - m) wx -= (ax - (w.w - m)) / L;
    if (ay < m) wy += (m - ay) / L; if (ay > w.h - m) wy -= (ay - (w.h - m)) / L;
    vx += wx * 3; vy += wy * 3;
    if (w.bound) {
      const bx = ax - w.bound.x, by = ay - w.bound.y, bd = Math.hypot(bx, by), lim = w.bound.r - L * 0.6;
      if (bd > lim && bd > 0) { const k = Math.min(3, (bd - lim) / L + 0.5) * 3; vx -= (bx / bd) * k; vy -= (by / bd) * k; }
    }
    // separation (only from fish at a similar depth)
    for (const o of w.fish) {
      if (o === this) continue;
      const dx = this.x - o.x, dy = this.y - o.y, d = Math.hypot(dx, dy);
      const r = (L + o.L) * 0.45;
      if (d < r && d > 0.01) { const k = (1 - d / r) * (1 - Math.abs(this.depth - o.depth)) * 1.6; vx += (dx / d) * k; vy += (dy / d) * k; }
    }
    // food
    const food = w.pellets.some(p => !p.eaten);
    if (food) this.notice += dt; else { this.notice = 0; this.target = null; }
    this.retarget -= dt;
    if (food && this.notice > (1.2 - this.boldness) * 2.2 && (this.retarget <= 0 || !this.target || this.target.eaten)) {
      let best = Infinity; this.target = null;
      for (const p of w.pellets) { if (p.eaten) continue; const d = Math.hypot(p.x - this.x, p.y - this.y); if (d < best) { best = d; this.target = p; } }
      this.retarget = 0.4;
    }
    let cruise = L * (0.16 + 0.3 * vnoise(t * 0.07, this.seed * 0.11, 5));
    let turnRate = 1.0;
    if (this.target && !this.target.eaten) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y, d = Math.hypot(dx, dy) || 1;
      vx = vx * 0.25 + (dx / d) * 3; vy = vy * 0.25 + (dy / d) * 3;
      cruise = L * clamp(d / L, 0.18, 0.75) * (0.7 + this.boldness * 0.5);
      turnRate = 2.4;
      this.depthTarget = 0.02;
      if (d < L * 0.09 + 4) {
        this.target.eaten = true; this.target = null;
        w.addDrop(this.x, this.y, 9, -0.15);   // the gulp breaks the surface
      }
    }
    if (this.startle > 0) {
      const dx = this.x - this.fleeX, dy = this.y - this.fleeY, d = Math.hypot(dx, dy) || 1;
      vx += (dx / d) * 4 * this.startle; vy += (dy / d) * 4 * this.startle;
      cruise = Math.max(cruise, L * (0.5 + 2.6 * this.startle));
      turnRate = 1 + this.startle * 5;
      this.startle = Math.max(0, this.startle - dt * 0.55);
    }
    // steer
    const want = Math.atan2(vy, vx);
    let diff = want - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const maxTurn = turnRate * dt;
    this.heading += clamp(diff, -maxTurn, maxTurn);
    // speed: burst then glide
    const accel = cruise > this.speed ? 1.6 : 0.5;
    const thrust = Math.max(0, cruise - this.speed) / L;
    this.speed += (cruise - this.speed) * Math.min(1, dt * accel);
    const ampTarget = clamp(0.035 + thrust * 0.5 + (this.speed / L) * 0.06 + Math.abs(diff) * 0.04, 0.03, 0.14);
    this.tailAmp += (ampTarget - this.tailAmp) * Math.min(1, dt * 3);
    const freq = 0.8 + 2.0 * (this.speed / L) + this.startle * 2;
    this.tailPhase += Math.PI * 2 * freq * dt;
    hx = Math.cos(this.heading); hy = Math.sin(this.heading);
    this.x += hx * this.speed * dt; this.y += hy * this.speed * dt;
    // depth drifts slowly
    if (!this.target && this.startle <= 0 && Math.random() < dt * 0.05) this.depthTarget = 0.15 + Math.random() * 0.75;
    this.depth += (this.depthTarget - this.depth) * Math.min(1, dt * (this.startle > 0 ? 1.2 : 0.35));
    // koi near the surface push up a gentle wake
    this.wakeT -= dt;
    if (this.depth < 0.3 && this.wakeT <= 0 && this.speed > L * 0.1) {
      w.addDrop(this.x + hx * L * 0.05, this.y + hy * L * 0.05, L * 0.07, -0.02 * (1 - this.depth / 0.3) * Math.min(2, this.speed / L * 2));
      this.wakeT = 0.18;
    }
    this.solveSpine();
  }

  startleFrom(x: number, y: number, radius: number) {
    const d = Math.hypot(this.x - x, this.y - y);
    if (d > radius) return;
    const k = (1 - d / radius) * (1.1 - this.boldness * 0.7);
    if (k <= 0.05) return;
    this.startle = Math.max(this.startle, clamp(k * 1.4, 0, 1));
    this.fleeX = x; this.fleeY = y; this.depthTarget = 0.9; this.target = null; this.notice = 0;
  }

  private solveSpine() {
    const c = this.chain, seg = this.L / (M - 1);
    c[0] = this.x; c[1] = this.y;
    for (let i = 1; i < M; i++) {
      let dx = c[i * 2]! - c[i * 2 - 2]!, dy = c[i * 2 + 1]! - c[i * 2 - 1]!;
      const d = Math.hypot(dx, dy) || 1e-6; dx /= d; dy /= d;
      let px: number, py: number;
      if (i >= 2) { px = c[i * 2 - 2]! - c[i * 2 - 4]!; py = c[i * 2 - 1]! - c[i * 2 - 3]!; }
      else { px = -Math.cos(this.heading); py = -Math.sin(this.heading); }
      const pd = Math.hypot(px, py) || 1e-6; px /= pd; py /= pd;
      const ang = Math.atan2(px * dy - py * dx, px * dx + py * dy), maxA = i < 4 ? 0.08 : 0.2;   // stiff head, bendy tail
      if (Math.abs(ang) > maxA) { const a = Math.sign(ang) * maxA, ca = Math.cos(a), sa = Math.sin(a); dx = px * ca - py * sa; dy = px * sa + py * ca; }
      c[i * 2] = c[i * 2 - 2]! + dx * seg; c[i * 2 + 1] = c[i * 2 - 1]! + dy * seg;
    }
    // travelling tail wave
    const rp = this.rp, tn = this.tn;
    for (let i = 0; i < M; i++) {
      const a = Math.max(0, i - 1), b = Math.min(M - 1, i + 1);
      let tx = c[b * 2]! - c[a * 2]!, ty = c[b * 2 + 1]! - c[a * 2 + 1]!; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const s = i / (M - 1);
      const off = this.L * this.tailAmp * (s * s * 1.1 - 0.06) * Math.sin(this.tailPhase - s * 4.2);
      rp[i * 2] = c[i * 2]! - ty * off; rp[i * 2 + 1] = c[i * 2 + 1]! + tx * off;
    }
    for (let i = 0; i < M; i++) {
      const a = Math.max(0, i - 1), b = Math.min(M - 1, i + 1);
      let tx = rp[b * 2]! - rp[a * 2]!, ty = rp[b * 2 + 1]! - rp[a * 2 + 1]!; const tl = Math.hypot(tx, ty) || 1;
      tn[i * 2] = tx / tl; tn[i * 2 + 1] = ty / tl;
    }
  }

  private sample(u: number, out: V4) {
    const f = clamp(u, 0, 1) * (M - 1), i = Math.min(M - 2, Math.floor(f)), k = f - i;
    const rp = this.rp, tn = this.tn;
    out[0] = lerp(rp[i * 2]!, rp[i * 2 + 2]!, k); out[1] = lerp(rp[i * 2 + 1]!, rp[i * 2 + 3]!, k);
    let tx = lerp(tn[i * 2]!, tn[i * 2 + 2]!, k), ty = lerp(tn[i * 2 + 1]!, tn[i * 2 + 3]!, k); const tl = Math.hypot(tx, ty) || 1;
    out[2] = tx / tl; out[3] = ty / tl;
  }

  /** Is the point on this fish? */
  hit(x: number, y: number): boolean {
    for (let i = 0; i < M; i += 2) {
      const u = i / (M - 1);
      if (Math.hypot(x - this.rp[i * 2]!, y - this.rp[i * 2 + 1]!) < bodyHalf(Math.min(u, BODY_END)) * this.L + 12) return true;
    }
    return false;
  }

  emit(buf: MeshBuf, toLx: number, toLy: number, t: number) {
    const L = this.L, s: V4 = [0, 0, 0, 0], s2: V4 = [0, 0, 0, 0];
    const vtx = (x: number, y: number, u: number, v: number, kind: number, ls: number) =>
      buf.v(x, y, u, v, this.row, kind, this.depth, ls, this.fin[0], this.fin[1], this.fin[2], this.metal, this.moto, (this.seed % 1000) / 1000);
    const strip = (u0: number, u1: number, n: number, half: (u: number) => number, kind: number) => {
      for (let i = 0; i < n; i++) {
        const ua = u0 + (u1 - u0) * (i / n), ub = u0 + (u1 - u0) * ((i + 1) / n);
        this.sample(ua, s); this.sample(ub, s2);
        const wa = half(ua) * L, wb = half(ub) * L;
        const nax = -s[3], nay = s[2], nbx = -s2[3], nby = s2[2];
        const la = nax * toLx + nay * toLy, lb = nbx * toLx + nby * toLy;
        const A = [s[0] - nax * wa, s[1] - nay * wa], B = [s[0] + nax * wa, s[1] + nay * wa];
        const C = [s2[0] - nbx * wb, s2[1] - nby * wb], D = [s2[0] + nbx * wb, s2[1] + nby * wb];
        vtx(A[0]!, A[1]!, ua, -1, kind, la); vtx(B[0]!, B[1]!, ua, 1, kind, la); vtx(D[0]!, D[1]!, ub, 1, kind, lb);
        vtx(A[0]!, A[1]!, ua, -1, kind, la); vtx(D[0]!, D[1]!, ub, 1, kind, lb); vtx(C[0]!, C[1]!, ub, -1, kind, lb);
      }
    };
    // pectoral fins (under the body)
    this.sample(0.2, s);
    const slow = 1 - clamp(this.speed / (L * 0.5), 0, 1);
    for (const side of [-1, 1]) {
      const nx = -s[3] * side, ny = s[2] * side;
      const bx = s[0] + nx * bodyHalf(0.2) * L * 0.6, by = s[1] + ny * bodyHalf(0.2) * L * 0.6;
      const a = 0.85 + 0.35 * slow + (0.12 + 0.2 * slow) * Math.sin(t * (1.6 + slow) + side * 1.3 + this.seed);
      const dx = s[2] * Math.cos(a) + nx * Math.sin(a), dy = s[3] * Math.cos(a) + ny * Math.sin(a);
      const fl = L * 0.14, fh = L * 0.075, px = -dy, py = dx, n = 5;
      const ls = px * toLx + py * toLy;
      for (let i = 0; i < n; i++) {
        const ta = i / n, tb = (i + 1) / n;
        const ax = bx + dx * fl * ta, ay = by + dy * fl * ta, cx = bx + dx * fl * tb, cy = by + dy * fl * tb;
        vtx(ax - px * fh, ay - py * fh, ta, -1, 2, ls); vtx(ax + px * fh, ay + py * fh, ta, 1, 2, ls); vtx(cx + px * fh, cy + py * fh, tb, 1, 2, ls);
        vtx(ax - px * fh, ay - py * fh, ta, -1, 2, ls); vtx(cx + px * fh, cy + py * fh, tb, 1, 2, ls); vtx(cx - px * fh, cy - py * fh, tb, -1, 2, ls);
      }
    }
    strip(TAIL_START, 1, 8, tailHalf, 1);
    strip(0, BODY_END, 22, bodyHalf, 0);
  }
}

export class MeshBuf {
  data = new Float32Array(STRIDE * 4096);
  n = 0; // vertices
  reset() { this.n = 0; }
  v(...vals: number[]) {
    if ((this.n + 1) * STRIDE > this.data.length) { const d = new Float32Array(this.data.length * 2); d.set(this.data); this.data = d; }
    this.data.set(vals, this.n * STRIDE); this.n++;
  }
}
