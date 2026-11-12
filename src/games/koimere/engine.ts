/**
 * The live pond, as a reusable widget: water, koi, lily pads, light from the real clock,
 * and (optionally) sand over the parts that are not dredged yet. Everything is drawn in code.
 *
 * createPond(canvas, options) returns null when WebGL2 is not available, so callers can show a fallback.
 * It only renders while the canvas is on screen and the tab is visible.
 */
import { bindTex, freeTarget, program, target, type Target } from './gl';
import { ATLAS_ROWS, ATLAS_W, Koi, MeshBuf, ROW_H, STRIDE, type Pellet, type Variety, type World } from './koi';
import { COMPOSITE_FS, FLOOR_FS, FULLSCREEN_VS, KOI_FS, KOI_VS, SIM_FS, SURF_FS, SURF_VS } from './shaders';
import { lightAt } from './time';

export interface PondOptions {
  fish: Variety[];
  /** Lily pads as [x, y] fractions of the canvas, plus a size factor. */
  pads?: Array<[number, number, number]>;
  /** Start covered in sand, with only a small pool open at `sandOpen` (fractions of the canvas). */
  sand?: boolean;
  sandOpen?: [number, number];
  maxDpr?: number;
  reducedMotion?: boolean;
  onFish?: (k: Koi) => void;
  onTap?: () => void;
}

export interface Pond {
  setHour(h: number | 'live'): void;
  hour(): number;
  setFeed(on: boolean): void;
  addKoi(v: Variety, at?: { x: number; y: number; heading: number }): Koi | null;
  dredge(ms?: number): Promise<void>;
  readonly world: World;
  destroy(): void;
}

const SURF_STRIDE = 8;
const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };

export function createPond(canvas: HTMLCanvasElement, opts: PondOptions): Pond | null {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const canRipple = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));

  let P: Record<'sim' | 'floor' | 'koi' | 'surf' | 'comp', ReturnType<typeof program>>;
  try {
    P = {
      sim: program(gl, FULLSCREEN_VS, SIM_FS),
      floor: program(gl, FULLSCREEN_VS, FLOOR_FS),
      koi: program(gl, KOI_VS, KOI_FS),
      surf: program(gl, SURF_VS, SURF_FS),
      comp: program(gl, FULLSCREEN_VS, COMPOSITE_FS),
    };
  } catch (e) {
    console.error('pond: shader setup failed', e);
    return null;
  }
  const emptyVao = gl.createVertexArray()!;
  const koiVao = gl.createVertexArray()!, koiVbo = gl.createBuffer()!;
  gl.bindVertexArray(koiVao); gl.bindBuffer(gl.ARRAY_BUFFER, koiVbo);
  for (const [loc, size, off] of [[0, 2, 0], [1, 2, 2], [2, 4, 4], [3, 4, 8], [4, 2, 12]] as const) {
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, off * 4);
  }
  const surfVao = gl.createVertexArray()!, surfVbo = gl.createBuffer()!;
  gl.bindVertexArray(surfVao); gl.bindBuffer(gl.ARRAY_BUFFER, surfVbo);
  for (const [loc, size, off] of [[0, 2, 0], [1, 2, 2], [2, 4, 4]] as const) {
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, SURF_STRIDE * 4, off * 4);
  }
  gl.bindVertexArray(null);

  // koi skin atlas
  const atlas = document.createElement('canvas'); atlas.width = ATLAS_W; atlas.height = ROW_H * ATLAS_ROWS;
  const actx = atlas.getContext('2d', { willReadFrequently: true })!;
  const atlasTex = gl.createTexture()!;
  const uploadAtlas = () => {
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  let W = 1, H = 1;
  const drops: number[] = [];
  const world: World = {
    w: 1, h: 1, t: 0, fish: [], pellets: [], bound: null,
    addDrop(x, y, r, s) { if (drops.length < 64) drops.push(x / W, 1 - y / H, r / H, s); },
  };
  interface Pad { fx: number; fy: number; x: number; y: number; k: number; r: number; rot: number; seed: number; vx: number; vy: number; spin: number }
  const pads: Pad[] = (opts.pads ?? []).map(([fx, fy, k]) => ({ fx, fy, k, x: 0, y: 0, r: 0, rot: Math.random() * 6.28, seed: Math.random() * 10, vx: 0, vy: 0, spin: (Math.random() - 0.5) * 0.02 }));

  // sand: reveal circle in "aspect units" (x in 0..W/H, y in 0..1, y up)
  const sandOn = !!opts.sand;
  const open = opts.sandOpen ?? [0.15, 0.2];
  let revR = sandOn ? 0.13 : 0;
  const revC = () => [open[0] * (W / H), 1 - open[1]] as const;
  const updateBound = () => {
    if (!sandOn || revR > Math.hypot(W / H, 1) + 0.2) { world.bound = null; return; }
    const [cx, cy] = revC();
    world.bound = { x: cx * H, y: (1 - cy) * H, r: Math.max(0, revR - 0.06) * H };
  };

  let sim: [Target, Target] | null = null, koiT: Target | null = null, surfT: Target | null = null, floorT: Target | null = null;
  let simW = 1, simH = 1, dpr = 1;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const oldW = W, oldH = H;
    W = rect.width; H = rect.height; world.w = W; world.h = H;
    dpr = Math.min(opts.maxDpr ?? 1.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    [koiT, surfT, floorT].forEach(t => freeTarget(gl, t));
    if (sim) { freeTarget(gl, sim[0]); freeTarget(gl, sim[1]); }
    koiT = target(gl, canvas.width, canvas.height);
    surfT = target(gl, canvas.width, canvas.height);
    floorT = target(gl, Math.max(1, Math.round(canvas.width / 2)), Math.max(1, Math.round(canvas.height / 2)));
    simW = Math.ceil(W / 4); simH = Math.ceil(H / 4);
    sim = canRipple ? [target(gl, simW, simH, true), target(gl, simW, simH, true)] : null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, floorT.fb); gl.viewport(0, 0, floorT.w, floorT.h);
    gl.useProgram(P.floor.p); gl.uniform1f(P.floor.u('uAspect'), W / H);
    gl.bindVertexArray(emptyVao); gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 3);
    const md = Math.min(W, H);
    for (const pd of pads) { pd.x = pd.fx * W; pd.y = pd.fy * H; pd.r = md * 0.09 * pd.k; }
    for (const f of world.fish) { f.x = (f.x / oldW) * W; f.y = (f.y / oldH) * H; f.L = Math.min(f.L, md * 0.4); }
    updateBound();
    dirty = true;
  };

  const addKoi = (v: Variety, at?: { x: number; y: number; heading: number }): Koi | null => {
    if (world.fish.length >= ATLAS_ROWS) return null;
    const used = new Set(world.fish.map(f => f.row));
    let row = 0; while (used.has(row)) row++;
    let x = at?.x, y = at?.y;
    if (x === undefined && world.bound) {
      const a = Math.random() * 6.28, r = Math.random() * world.bound.r * 0.5;
      x = world.bound.x + Math.cos(a) * r; y = world.bound.y + Math.sin(a) * r;
    }
    const k = new Koi(v, (Math.random() * 1e9) | 0, W, H, x, y);
    k.row = row;
    if (at) k.heading = at.heading;
    const img = actx.createImageData(ATLAS_W, ROW_H);
    k.paint(img); actx.putImageData(img, 0, row * ROW_H);
    uploadAtlas();
    world.fish.push(k);
    return k;
  };

  let live = true, manualHour = 12, feed = false;
  const kbuf = new MeshBuf();
  let surfData = new Float32Array(SURF_STRIDE * 6 * 64);
  let simAcc = 0, last = 0, plipT = 2, raf = 0, running = false, onScreen = false, dirty = true;
  let stillFrames = 0;
  const dropArr = new Float32Array(64);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]] as const;
  const quad = (arr: Float32Array, i: number, x: number, y: number, r: number, rot: number, kind: number, seed: number) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    for (const [lx, ly] of corners) {
      arr.set([x + (lx * c - ly * s) * r, y + (lx * s + ly * c) * r, lx, ly, kind, seed, 0, 0], i); i += SURF_STRIDE;
    }
    return i;
  };
  let dredgeAnim: { t0: number; ms: number; from: number; to: number; done: () => void; spawned: boolean } | null = null;

  const frame = (now: number) => {
    raf = 0;
    if (!running) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
    world.t += dt;
    const Lt = lightAt(live ? hourNow() : manualHour);

    if (dredgeAnim) {
      const k = Math.min(1, (now - dredgeAnim.t0) / dredgeAnim.ms), e = 1 - Math.pow(1 - k, 2.4);
      const prev = revR;
      revR = dredgeAnim.from + (dredgeAnim.to - dredgeAnim.from) * e;
      const [cx, cy] = revC();
      for (let i = 0; i < 3; i++) { // water rushing over the edge
        const a = Math.random() * 6.28, rr = prev * H;
        world.addDrop(cx * H + Math.cos(a) * rr, (1 - cy) * H + Math.sin(a) * rr, 7, 0.12);
      }
      if (!dredgeAnim.spawned && k > 0.35) { dredgeAnim.spawned = true; dredgeAnim.done(); }
      if (k >= 1) dredgeAnim = null;
      updateBound();
    }

    for (const f of world.fish) f.update(dt, world);
    for (const p of world.pellets) {
      p.age += dt; p.vx += (Math.random() - 0.5) * 6 * dt; p.vy += (Math.random() - 0.5) * 6 * dt;
      p.vx *= 0.97; p.vy *= 0.97; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    world.pellets = world.pellets.filter(p => !p.eaten && p.age < 90);
    for (const pd of pads) {
      pd.vx += (Math.random() - 0.5) * 1.5 * dt; pd.vy += (Math.random() - 0.5) * 1.5 * dt;
      pd.vx *= 0.99; pd.vy *= 0.99; pd.x += pd.vx * dt; pd.y += pd.vy * dt; pd.rot += pd.spin * dt;
      pd.x += (pd.fx * W - pd.x) * 0.002; pd.y += (pd.fy * H - pd.y) * 0.002; // stay roughly in place
    }
    plipT -= dt;
    if (plipT <= 0 && !opts.reducedMotion) {
      const x = Math.random() * W, y = Math.random() * H;
      if (!world.bound || Math.hypot(x - world.bound.x, y - world.bound.y) < world.bound.r) world.addDrop(x, y, 5, 0.07);
      plipT = 2.5 + Math.random() * 5;
    }

    if (sim) {
      simAcc += dt;
      let steps = 0;
      gl.useProgram(P.sim.p); gl.bindVertexArray(emptyVao); gl.disable(gl.BLEND);
      gl.viewport(0, 0, simW, simH);
      gl.uniform2f(P.sim.u('uTexel'), 1 / simW, 1 / simH); gl.uniform1f(P.sim.u('uAspect'), W / H);
      while (simAcc >= 1 / 60 && steps < 3) {
        const n = Math.min(16, drops.length / 4);
        dropArr.fill(0); dropArr.set(drops.slice(0, n * 4)); drops.splice(0, n * 4);
        gl.uniform4fv(P.sim.u('uDrops'), dropArr); gl.uniform1i(P.sim.u('uDropCount'), n);
        gl.bindFramebuffer(gl.FRAMEBUFFER, sim[1].fb);
        bindTex(gl, 0, sim[0].tex, P.sim.u('uState'));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        sim = [sim[1], sim[0]];
        simAcc -= 1 / 60; steps++;
      }
      if (steps === 3) simAcc = 0;
    } else drops.length = 0;

    const toL = Math.hypot(Lt.light[0], Lt.light[1]) || 1;
    const tlx = Lt.light[0] / toL, tly = -Lt.light[1] / toL;
    kbuf.reset();
    [...world.fish].sort((a, b) => b.depth - a.depth).forEach(f => f.emit(kbuf, tlx, tly, world.t));
    gl.bindFramebuffer(gl.FRAMEBUFFER, koiT!.fb); gl.viewport(0, 0, koiT!.w, koiT!.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P.koi.p);
    gl.uniform2f(P.koi.u('uRes'), W, H); gl.uniform1f(P.koi.u('uRows'), ATLAS_ROWS); gl.uniform1f(P.koi.u('uTime'), world.t);
    gl.uniform3f(P.koi.u('uDeepTint'), Lt.deep[0] * 1.3, Lt.deep[1] * 1.3, Lt.deep[2] * 1.3);
    bindTex(gl, 0, atlasTex, P.koi.u('uAtlas'));
    gl.bindVertexArray(koiVao); gl.bindBuffer(gl.ARRAY_BUFFER, koiVbo);
    gl.bufferData(gl.ARRAY_BUFFER, kbuf.data.subarray(0, kbuf.n * STRIDE), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, kbuf.n);

    const nQuads = pads.length + world.pellets.length;
    if (surfData.length < nQuads * 6 * SURF_STRIDE) surfData = new Float32Array(nQuads * 6 * SURF_STRIDE * 2);
    let i = 0;
    for (const pd of pads) i = quad(surfData, i, pd.x, pd.y, pd.r, pd.rot, 0, pd.seed);
    const pr = Math.max(2.5, Math.min(W, H) * 0.008);
    for (const p of world.pellets) i = quad(surfData, i, p.x, p.y, pr, 0, 1, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, surfT!.fb); gl.viewport(0, 0, surfT!.w, surfT!.h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (i > 0) {
      gl.useProgram(P.surf.p); gl.uniform2f(P.surf.u('uRes'), W, H);
      gl.bindVertexArray(surfVao); gl.bindBuffer(gl.ARRAY_BUFFER, surfVbo);
      gl.bufferData(gl.ARRAY_BUFFER, surfData.subarray(0, i), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, i / SURF_STRIDE);
    }

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    const C = P.comp; gl.useProgram(C.p); gl.bindVertexArray(emptyVao);
    bindTex(gl, 0, sim ? sim[0].tex : floorT!.tex, C.u('uRipple'));
    bindTex(gl, 1, koiT!.tex, C.u('uKoi')); bindTex(gl, 2, surfT!.tex, C.u('uSurf')); bindTex(gl, 3, floorT!.tex, C.u('uFloor'));
    gl.uniform2f(C.u('uSimTexel'), 1 / simW, 1 / simH);
    gl.uniform1f(C.u('uTime'), world.t); gl.uniform1f(C.u('uAspect'), W / H);
    gl.uniform1f(C.u('uNight'), Lt.night); gl.uniform1f(C.u('uShadowLen'), Lt.shadowLen);
    gl.uniform3fv(C.u('uSun'), Lt.sun); gl.uniform3fv(C.u('uAmb'), Lt.amb); gl.uniform3fv(C.u('uSky'), Lt.sky);
    gl.uniform3fv(C.u('uDeep'), Lt.deep); gl.uniform3fv(C.u('uLight'), Lt.light);
    gl.uniform2f(C.u('uBlur'), 3.5 / W, 3.5 / H);
    const [cx, cy] = revC();
    gl.uniform1f(C.u('uSandOn'), sandOn ? 1 : 0); gl.uniform1f(C.u('uRevR'), revR); gl.uniform2f(C.u('uRevC'), cx, cy);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Reduced motion: settle, draw a still frame, and wake only on interaction.
    if (opts.reducedMotion && !dredgeAnim) { stillFrames++; if (stillFrames > 90 && !dirty) { running = false; last = 0; return; } }
    dirty = false;
    schedule();
  };
  const schedule = () => { if (running && !raf) raf = requestAnimationFrame(frame); };
  const start = () => { if (!onScreen || document.hidden) return; if (!running) { running = true; last = 0; } schedule(); };
  const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
  const wake = () => { stillFrames = 0; dirty = true; start(); };

  const io = new IntersectionObserver(([e]) => { onScreen = !!e?.isIntersecting; if (onScreen) start(); else stop(); }, { rootMargin: '80px' });
  io.observe(canvas);
  const onVis = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => { resize(); wake(); });
  ro.observe(canvas);

  const onDown = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (world.bound && Math.hypot(x - world.bound.x, y - world.bound.y) > world.bound.r + 20) return; // tapped the sand
    wake();
    opts.onTap?.();
    if (feed) {
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, rr = Math.random() * 22;
        const p: Pellet = { x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, age: 0, eaten: false };
        world.pellets.push(p); world.addDrop(p.x, p.y, 6, 0.08);
      }
      return;
    }
    const hit = [...world.fish].sort((a, b) => a.depth - b.depth).find(f => f.hit(x, y));
    if (hit && opts.onFish) { opts.onFish(hit); return; }
    world.addDrop(x, y, 10, 0.3);
    for (const f of world.fish) f.startleFrom(x, y, Math.min(W, H) * 0.35);
  };
  canvas.addEventListener('pointerdown', onDown);

  resize();
  opts.fish.forEach(v => addKoi(v));

  return {
    world,
    setHour(h) { if (h === 'live') live = true; else { live = false; manualHour = h; } wake(); },
    hour: () => (live ? hourNow() : manualHour),
    setFeed(on) { feed = on; },
    addKoi: (v, at) => { const k = addKoi(v, at); wake(); return k; },
    dredge(ms = 3400) {
      return new Promise<void>(resolve => {
        if (!sandOn) { resolve(); return; }
        wake();
        dredgeAnim = { t0: performance.now(), ms, from: revR, to: Math.hypot(W / H, 1) + 0.4, done: resolve, spawned: false };
      });
    },
    destroy() {
      stop(); io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
    },
  };
}
