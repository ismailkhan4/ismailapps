/**
 * The stream puzzle, pure logic (no DOM). A grid of channel tiles; tap to turn one a quarter turn.
 * Solved when the spring's water reaches every tile. Food on a tile only counts if water reaches it.
 *
 * Sides are bits: N = 1, E = 2, S = 4, W = 8. Levels are a random spanning tree, so every
 * level is solvable and the solution uses every channel.
 */
import type { Food } from './content';

export interface Tile { mask: number; turns: number; kind: 'pipe' | 'spring' | 'pool'; food: Food | null }
export interface Level { cols: number; rows: number; tiles: Tile[]; spring: number }

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
export const rotate = (mask: number, turns: number) => { const t = ((turns % 4) + 4) % 4; return ((mask << t) | (mask >> (4 - t))) & 15; };
export const sides = (t: Tile) => rotate(t.mask, t.turns);

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function generate(cols: number, rows: number, seed: number, foodBag: Food[]): Level {
  const r = rng(seed), n = cols * rows;
  const mask = new Array<number>(n).fill(0), seen = new Array<boolean>(n).fill(false);
  const depth = new Array<number>(n).fill(0);
  const spring = 0;
  // randomised depth-first spanning tree from the spring
  const stack = [spring]; seen[spring] = true;
  while (stack.length) {
    const c = stack[stack.length - 1]!, x = c % cols, y = Math.floor(c / cols);
    const opts: number[] = [];
    for (let d = 0; d < 4; d++) { const nx = x + DX[d]!, ny = y + DY[d]!; if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny * cols + nx]) opts.push(d); }
    if (!opts.length) { stack.pop(); continue; }
    // prefer turning sometimes, so the stream winds
    const d = opts[Math.floor(r() * opts.length)]!;
    const nb = (y + DY[d]!) * cols + x + DX[d]!;
    mask[c] = mask[c]! | (1 << d); mask[nb] = mask[nb]! | (1 << ((d + 2) % 4));
    seen[nb] = true; depth[nb] = depth[c]! + 1; stack.push(nb);
  }
  const leaves = [...Array(n).keys()].filter(i => i !== spring && [1, 2, 4, 8].includes(mask[i]!));
  const pool = leaves.sort((a, b) => depth[b]! - depth[a]!)[0] ?? n - 1;
  const tiles: Tile[] = mask.map(m => ({ mask: m, turns: 0, kind: 'pipe', food: null }));
  tiles[spring]!.kind = 'spring'; tiles[pool]!.kind = 'pool';
  const free = [...Array(n).keys()].filter(i => i !== spring && i !== pool);
  for (const f of foodBag) {
    if (!free.length) break;
    const k = free.splice(Math.floor(r() * free.length), 1)[0]!;
    tiles[k]!.food = f;
  }
  // scramble (straight channels only have two looks, so give everything a random turn)
  for (const t of tiles) t.turns = Math.floor(r() * 4);
  const lvl = { cols, rows, tiles, spring };
  if (wet(lvl).size === n) tiles[pool === 1 ? 2 : 1]!.turns += 1;
  return lvl;
}

/** Tiles the water reaches from the spring, through channels open on both sides. */
export function wet(l: Level): Set<number> {
  const out = new Set<number>([l.spring]), q = [l.spring];
  while (q.length) {
    const c = q.shift()!, x = c % l.cols, y = Math.floor(c / l.cols), s = sides(l.tiles[c]!);
    for (let d = 0; d < 4; d++) {
      if (!(s & (1 << d))) continue;
      const nx = x + DX[d]!, ny = y + DY[d]!;
      if (nx < 0 || ny < 0 || nx >= l.cols || ny >= l.rows) continue;
      const nb = ny * l.cols + nx;
      if (out.has(nb) || !(sides(l.tiles[nb]!) & (1 << ((d + 2) % 4)))) continue;
      out.add(nb); q.push(nb);
    }
  }
  return out;
}

export const solved = (l: Level) => wet(l).size === l.tiles.length;

/** Food the water currently reaches. */
export function gathered(l: Level): Food[] {
  const w = wet(l);
  return l.tiles.flatMap((t, i) => (t.food && w.has(i) ? [t.food] : []));
}
