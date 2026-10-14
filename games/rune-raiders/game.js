/* Rune Raiders - Viking side-scrolling platformer. Canvas 2D, no libraries. */
(() => {
'use strict';
const cv = document.getElementById('rr');
const ctx = cv.getContext('2d');
const W = 800, H = 600, CX = W / 2, GY = 520;
const GRAV = 2000, JUMP = 860, RUN = 260;

// ---------- storage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
let save = Object.assign({ best: 0, stars: 0, done: false }, store.get('rr-save', {}));
let muted = store.get('rr-mute', false);
function persist() { store.set('rr-save', save); window.dispatchEvent(new CustomEvent('rr-awards', { detail: save })); }

const L = (a, b, k) => a + (b - a) * k;
const C = (v, a, b) => v < a ? a : v > b ? b : v;
const R = (a, b) => a + Math.random() * (b - a);
const E = k => 1 - (1 - C(k, 0, 1)) ** 3;
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${C((n >> 16) + amt, 0, 255)},${C((n >> 8 & 255) + amt, 0, 255)},${C((n & 255) + amt, 0, 255)})`;
}
function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }

// ---------- audio ----------
let ac = null, nb = null;
function audio() {
  if (muted) return;
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } }
  if (ac.state === 'suspended') ac.resume();
}
function tone(f, dur, vol, type = 'sine', f2) {
  if (muted || !ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), n = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, n); if (f2) o.frequency.exponentialRampToValueAtTime(f2, n + dur);
  g.gain.setValueAtTime(vol, n); g.gain.exponentialRampToValueAtTime(.001, n + dur);
  o.connect(g).connect(ac.destination); o.start(n); o.stop(n + dur + .05);
}
function noise(dur, f, q, vol, type = 'bandpass') {
  if (muted || !ac) return;
  if (!nb) { nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ac.createBufferSource(); s.buffer = nb;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ac.createGain(), n = ac.currentTime; g.gain.setValueAtTime(vol, n); g.gain.exponentialRampToValueAtTime(.001, n + dur);
  s.connect(fl).connect(g).connect(ac.destination); s.start(n); s.stop(n + dur + .05);
}
const sfx = {
  jump() { tone(300, .14, .1, 'square', 520); },
  coin() { tone(1320, .06, .12, 'square'); setTimeout(() => tone(1760, .12, .12, 'square'), 60); },
  swing() { noise(.14, 1400, .8, .3); },
  hit() { noise(.12, 500, .8, .7, 'lowpass'); tone(140, .12, .4, 'sine', 60); },
  hurt() { tone(420, .3, .2, 'sawtooth', 120); },
  twang() { tone(180, .18, .15, 'triangle', 120); noise(.05, 3000, 2, .15); },
  poof() { noise(.35, 600, .5, .4); },
  splash() { noise(.5, 900, .4, .5); },
  barrel() { noise(.2, 300, .6, .6, 'lowpass'); tone(90, .15, .3, 'square', 50); },
  win() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .28, .14, 'triangle'), i * 140)); },
  click() { tone(520, .05, .12, 'square'); },
  flag() { [392, 523, 659].forEach((f, i) => setTimeout(() => tone(f, .2, .12, 'triangle'), i * 90)); },
};

// ---------- level ----------
const LEVEL = {
  width: 5400,
  ground: [[0, 1400], [1620, 2650], [2850, 3850], [4080, 5150]],
  water: [[1400, 1620], [2650, 2850], [3850, 4080], [5150, 5400]],
  houses: [
    { x: 380, w: 480, base: 150, roof: 130 },
    { x: 1820, w: 420, base: 170, roof: 130 },
    { x: 3080, w: 560, base: 190, roof: 150 },
    { x: 4380, w: 420, base: 150, roof: 120 },
  ],
  planks: [[1475, 440, 80], [1110, 400, 120], [2715, 440, 80], [2400, 380, 110], [2945, 420, 90], [3930, 430, 90], [3770, 360, 100]],
  barrels: [960, 2560, 3010, 4230, 4990],
  props: [['rock', 250], ['crate', 1050], ['rock', 1680], ['crate', 2300], ['rock', 2900], ['crate', 3720], ['rock', 4150], ['crate', 4790], ['crate', 4835]],
  signs: [[180, ['SPACE / X', 'SWORD']], [300, ['DOWN / S', 'PICK UP', '& THROW']], [925, ['JUMP ON', 'RAIDERS!']]],
  checkpoint: 2930,
  ship: 5150,
};
const surfaces = [], solids = [];
function buildGeometry() {
  surfaces.length = 0; solids.length = 0;
  for (const [a, b] of LEVEL.ground) surfaces.push({ x1: a, y1: GY, x2: b, y2: GY, kind: 'ground' });
  for (const h of LEVEL.houses) {
    h.top = GY - h.base; h.px = h.x + h.w / 2; h.py = h.top - h.roof;
    surfaces.push({ x1: h.x - 40, y1: h.top + 6, x2: h.px, y2: h.py, kind: 'roof' });
    surfaces.push({ x1: h.px, y1: h.py, x2: h.x + h.w + 40, y2: h.top + 6, kind: 'roof' });
    solids.push({ x: h.x, y: h.top, w: h.w, h: h.base });
  }
  for (const [x, y, w] of LEVEL.planks) surfaces.push({ x1: x, y1: y, x2: x + w, y2: y, kind: 'plank' });
  surfaces.push({ x1: LEVEL.ship - 4, y1: GY - 4, x2: LEVEL.ship + 250, y2: GY - 4, kind: 'ship' });
}
const surfY = (s, x) => s.y1 + (s.y2 - s.y1) * (x - s.x1) / (s.x2 - s.x1);
function landing(x, prevF, newF) {
  let best = null, by = Infinity;
  for (const s of surfaces) { if (x < s.x1 || x > s.x2) continue; const y = surfY(s, x); if (prevF <= y + 8 && newF >= y && y < by) { by = y; best = s; } }
  return best ? { s: best, y: by } : null;
}
function under(x, feet) {
  let best = null, by = Infinity;
  for (const s of surfaces) { if (x < s.x1 || x > s.x2) continue; const y = surfY(s, x); if (y >= feet - 14 && y <= feet + 18 && y < by) { by = y; best = s; } }
  return best ? { s: best, y: by } : null;
}

// ---------- pre-rendered scenery ----------
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const skyC = cnv(W, H), mtnC = cnv(1600, H), forestC = cnv(1600, H), grassC = cnv(512, 90), waterC = cnv(256, 90);
const houseC = [];
function buildScenery() {
  let c = skyC.getContext('2d');
  let g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#c9bcd8'); g.addColorStop(.45, '#e6dbe0'); g.addColorStop(.75, '#f6efdf'); g.addColorStop(1, '#f3ecd8');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const sg = c.createRadialGradient(560, 330, 10, 560, 330, 340); sg.addColorStop(0, 'rgba(255,248,225,.9)'); sg.addColorStop(1, 'rgba(255,248,225,0)');
  c.fillStyle = sg; c.fillRect(0, 0, W, H);
  // mountains (tileable 1600)
  c = mtnC.getContext('2d');
  const range = (base, amp, n, col, snowCol, seed, hazeA) => {
    const r = rng(seed), pts = [];
    for (let i = 0; i <= n; i++) pts.push([i * 1600 / n, base - amp * (.35 + r() * .65) * (i % 2 ? .62 : 1)]);
    pts[n][1] = pts[0][1];
    c.save();
    c.beginPath(); c.moveTo(0, H); for (const [x, y] of pts) c.lineTo(x, y); c.lineTo(1600, H); c.closePath();
    const mg = c.createLinearGradient(0, base - amp, 0, base + 60); mg.addColorStop(0, shade(col, 30)); mg.addColorStop(1, col);
    c.fillStyle = mg; c.fill(); c.clip();
    // shaded faces
    c.fillStyle = 'rgba(70,80,110,.18)';
    for (let i = 0; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]; if (y2 > y1) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x2, H); c.lineTo(x1 + (x2 - x1) * .3, H); c.fill(); } }
    // snow caps
    c.fillStyle = snowCol;
    for (let i = 0; i <= n; i++) {
      const [x, y] = pts[i]; if (y > base - amp * .55) continue;
      const d = 40 + r() * 30;
      c.beginPath(); c.moveTo(x - 90, y + 70); c.lineTo(x, y - 2);
      c.lineTo(x + 90, y + 70);
      for (let k = 0; k < 8; k++) c.lineTo(x + 90 - k * 22, y + d + (k % 2 ? 18 : 0) + r() * 10);
      c.closePath(); c.fill();
    }
    c.restore();
    c.save(); c.filter = 'blur(14px)'; c.fillStyle = `rgba(250,246,240,${hazeA})`;
    for (let x = -100; x < 1700; x += 120) { c.beginPath(); c.ellipse(x, base + 30, 140, 40, 0, 0, 7); c.fill(); }
    c.restore();
  };
  range(330, 220, 12, '#aeb8cc', '#f7f9fc', 7, .8);
  range(380, 160, 10, '#93a2b9', '#eef3f9', 21, .9);
  // misty pine forest (tileable)
  c = forestC.getContext('2d');
  const pines = (y0, hgt, col, seed, step) => {
    const r = rng(seed);
    for (let x = -20; x < 1620; x += step * (.6 + r() * .6)) {
      const hh = hgt * (.6 + r() * .6), w = hh * .38, yb = y0 + r() * 20;
      c.fillStyle = col; c.beginPath(); c.moveTo(x, yb - hh);
      for (let k = 1; k <= 5; k++) { const yy = yb - hh + hh * k / 5; c.lineTo(x + w * k / 5 + 4, yy - 4); c.lineTo(x + w * k / 5 * .6, yy - 2); }
      c.lineTo(x + w * .2, yb); c.lineTo(x - w * .2, yb);
      for (let k = 5; k >= 1; k--) { const yy = yb - hh + hh * k / 5; c.lineTo(x - w * k / 5 * .6, yy - 2); c.lineTo(x - w * k / 5 - 4, yy - 4); }
      c.closePath(); c.fill();
    }
  };
  pines(470, 120, '#9aa89c', 3, 26);
  c.save(); c.filter = 'blur(10px)'; c.fillStyle = 'rgba(245,242,232,.7)'; c.fillRect(-50, 430, 1700, 60); c.restore();
  pines(505, 150, '#76877a', 9, 32);
  c.save(); c.filter = 'blur(12px)'; c.fillStyle = 'rgba(245,242,232,.65)'; c.fillRect(-50, 470, 1700, 70); c.restore();
  // grass tile
  c = grassC.getContext('2d');
  g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#6f8f33'); g.addColorStop(.25, '#56762a'); g.addColorStop(.3, '#5b4a32'); g.addColorStop(1, '#3a2e20');
  c.fillStyle = g; c.fillRect(0, 10, 512, 80);
  let r = rng(5);
  for (let i = 0; i < 900; i++) {
    const x = r() * 512, h = 6 + r() * 16, lean = (r() - .5) * 6;
    c.strokeStyle = ['#8fb043', '#6e9330', '#a6c45a', '#557a22'][i % 4]; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(x, 14 + r() * 6); c.quadraticCurveTo(x + lean * .5, 12 - h * .5, x + lean, 14 - h); c.stroke();
  }
  for (let i = 0; i < 60; i++) { c.fillStyle = 'rgba(30,20,10,.25)'; c.beginPath(); c.ellipse(r() * 512, 40 + r() * 45, 3 + r() * 6, 2 + r() * 3, 0, 0, 7); c.fill(); }
  // houses
  houseC.length = 0;
  LEVEL.houses.forEach((h, i) => houseC.push(buildHouse(h, i)));
}
function buildHouse(h, idx) {
  const pad = 60, cw = h.w + pad * 2, ch = h.base + h.roof + 70, c0 = cnv(cw, ch), c = c0.getContext('2d');
  const ox = pad, oy = ch - h.base; // base top-left in local coords
  const r = rng(100 + idx * 17);
  const pk = { x: ox + h.w / 2, y: oy - h.roof };
  // gable wall planks
  c.save(); c.beginPath(); c.moveTo(ox - 10, oy + 4); c.lineTo(pk.x, pk.y + 8); c.lineTo(ox + h.w + 10, oy + 4); c.closePath(); c.clip();
  for (let y = pk.y; y < oy + 6; y += 16) {
    const pg = c.createLinearGradient(0, y, 0, y + 16); pg.addColorStop(0, '#c7bba7'); pg.addColorStop(1, '#a89a84');
    c.fillStyle = pg; c.fillRect(ox - 10, y, h.w + 20, 15);
    c.fillStyle = 'rgba(60,45,30,.5)'; c.fillRect(ox - 10, y + 15, h.w + 20, 1.5);
    c.strokeStyle = 'rgba(90,70,50,.25)'; c.lineWidth = 1;
    for (let k = 0; k < 4; k++) { const gx = ox + r() * h.w; c.beginPath(); c.moveTo(gx, y + 4); c.quadraticCurveTo(gx + 20, y + 8, gx + 50, y + 5); c.stroke(); }
  }
  // posts and doorway
  c.fillStyle = '#b3a58f'; c.strokeStyle = '#5a4a36'; c.lineWidth = 2;
  for (const px of [ox + h.w * .3, ox + h.w * .7]) { c.fillRect(px - 8, pk.y + (px - ox < h.w / 2 ? (pk.x - px) : (px - pk.x)) * h.roof / (h.w / 2) + 6, 16, oy); }
  const dw = 46, dh = Math.min(70, h.roof - 14), dx = pk.x - dw / 2, dy = oy - dh;
  c.fillStyle = '#d0c4ae'; c.fillRect(dx - 8, dy - 8, dw + 16, dh + 8); c.strokeRect(dx - 8, dy - 8, dw + 16, dh + 8);
  const dg = c.createLinearGradient(0, dy, 0, oy); dg.addColorStop(0, '#0c0a08'); dg.addColorStop(1, '#2a2218');
  c.fillStyle = dg; c.fillRect(dx, dy, dw, dh);
  c.restore();
  // stone base
  c.save(); rr(c, ox, oy, h.w, h.base, 6); c.clip();
  c.fillStyle = '#3d3c38'; c.fillRect(ox, oy, h.w, h.base);
  for (let y = oy - 6; y < oy + h.base + 10; y += 22 + r() * 6) {
    for (let x = ox - 20 + r() * 20; x < ox + h.w + 20;) {
      const sw = 26 + r() * 34, sh = 18 + r() * 10, cx = x + sw / 2, cy = y + sh / 2;
      const sg = c.createRadialGradient(cx - sw * .2, cy - sh * .3, 2, cx, cy, sw * .7);
      const base = ['#b6b4ac', '#a7a59d', '#c2c0b7', '#9d9b93'][Math.floor(r() * 4)];
      sg.addColorStop(0, shade(base, 30)); sg.addColorStop(.6, base); sg.addColorStop(1, shade(base, -50));
      c.fillStyle = sg; c.beginPath(); c.ellipse(cx, cy, sw / 2, sh / 2, (r() - .5) * .3, 0, 7); c.fill();
      c.strokeStyle = '#2e2d2a'; c.lineWidth = 1.6; c.stroke();
      c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.ellipse(cx - sw * .15, cy - sh * .22, sw * .18, sh * .12, -.3, 0, 7); c.fill();
      if (r() < .3) { c.fillStyle = 'rgba(90,120,60,.35)'; c.beginPath(); c.ellipse(cx + sw * .2, cy - sh * .3, sw * .2, sh * .12, 0, 0, 7); c.fill(); }
      x += sw + 1;
    }
  }
  const vg = c.createLinearGradient(0, oy, 0, oy + h.base); vg.addColorStop(0, 'rgba(0,0,0,.35)'); vg.addColorStop(.25, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.2)');
  c.fillStyle = vg; c.fillRect(ox, oy, h.w, h.base);
  c.restore();
  // barge boards (timber along roof edge)
  const ex1 = { x: ox - 40, y: oy + 6 }, ex2 = { x: ox + h.w + 40, y: oy + 6 };
  const beam = (a, b) => {
    c.save(); c.lineCap = 'round';
    c.strokeStyle = '#4a3a28'; c.lineWidth = 20; c.beginPath(); c.moveTo(a.x, a.y + 10); c.lineTo(b.x, b.y + 10); c.stroke();
    c.strokeStyle = '#d9d0c0'; c.lineWidth = 16; c.stroke();
    c.strokeStyle = 'rgba(120,100,80,.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(a.x, a.y + 8); c.lineTo(b.x, b.y + 8); c.stroke();
    c.restore();
  };
  // sod roof
  const sodT = 26;
  c.save();
  c.beginPath(); c.moveTo(ex1.x - 8, ex1.y + 6); c.lineTo(pk.x, pk.y - sodT); c.lineTo(ex2.x + 8, ex2.y + 6);
  c.lineTo(ex2.x - 6, ex2.y + 12); c.lineTo(pk.x, pk.y + 4); c.lineTo(ex1.x + 6, ex1.y + 12); c.closePath();
  const sg2 = c.createLinearGradient(0, pk.y - sodT, 0, oy + 10); sg2.addColorStop(0, '#86a83c'); sg2.addColorStop(1, '#4e6d22');
  c.fillStyle = sg2; c.fill();
  c.restore();
  beam(ex1, { x: pk.x + 14, y: pk.y - 8 }); beam(ex2, { x: pk.x - 14, y: pk.y - 8 });
  // grass blades along the top edge
  const blades = (a, b) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y), n = len / 2.2;
    for (let i = 0; i < n; i++) {
      const k = i / n, x = L(a.x, b.x, k), y = L(a.y, b.y, k) - sodT * .55 + r() * 8;
      const hgt = 8 + r() * 14, lean = (r() - .5) * 8;
      c.strokeStyle = ['#9fc24e', '#7ca236', '#b6d468', '#5f8428'][i % 4]; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(x, y + 6); c.quadraticCurveTo(x + lean * .4, y - hgt * .5, x + lean, y - hgt); c.stroke();
    }
    // drooping grass over the eave
    for (let i = 0; i < 18; i++) { const x = a.x + (r() - .5) * 20, y = a.y + 6; c.strokeStyle = '#6e9330'; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 4, y + 10, x - 2 + r() * 4, y + 16 + r() * 8); c.stroke(); }
  };
  blades(ex1, pk); blades(ex2, pk);
  return { c: c0, ox: h.x - pad, oy: GY - ch };
}

// ---------- characters ----------
function limb(c, x1, y1, x2, y2, w, col, ol = '#2a1a10') {
  c.lineCap = 'round';
  c.strokeStyle = ol; c.lineWidth = w + 3.5; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.strokeStyle = col; c.lineWidth = w; c.stroke();
}
function leg(c, hx, hy, a, bend, col, boot) {
  const kx = hx + Math.sin(a) * 15, ky = hy + Math.cos(a) * 15;
  const fa = a - bend, fx = kx + Math.sin(fa) * 15, fy = ky + Math.cos(fa) * 15;
  limb(c, hx, hy, kx, ky, 9, col); limb(c, kx, ky, fx, fy, 8, col);
  c.fillStyle = boot; c.strokeStyle = '#1e140c'; c.lineWidth = 2;
  c.beginPath(); c.ellipse(fx + 4, fy + 1, 8, 5, 0, 0, 7); c.fill(); c.stroke();
}
function legsPose(st, t) {
  if (st === 'run') { const p = t * 13; return [Math.sin(p) * .75, Math.sin(p + Math.PI) * .75, Math.max(0, Math.cos(p)) * .9, Math.max(0, Math.cos(p + Math.PI)) * .9]; }
  if (st === 'jump') return [-.6, .35, .9, .4];
  if (st === 'fall') return [.25, -.35, .3, .2];
  return [.08, -.08, .05, .05];
}
function drawHero(c, x, y, face, st, t, swing, alpha = 1, carry = false) {
  c.save(); c.translate(x, y); c.scale(face, 1); c.globalAlpha = alpha;
  const bob = st === 'run' ? Math.abs(Math.sin(t * 13)) * 2.5 : st === 'idle' ? Math.sin(t * 3) * .8 : 0;
  c.translate(0, -bob);
  const [a1, a2, b1, b2] = legsPose(st, t);
  const braid = Math.sin(t * (st === 'run' ? 13 : 3)) * (st === 'run' ? 4 : 1.5);
  // braid (behind)
  for (let i = 0; i < 7; i++) { c.fillStyle = i % 2 ? '#b8420f' : '#d8561e'; c.strokeStyle = '#5a1e06'; c.lineWidth = 1.5; c.beginPath(); c.arc(-12 - i * 1.2 + braid * i * .15, -66 + i * 4.5, 4.4 - i * .3, 0, 7); c.fill(); c.stroke(); }
  // shield on back
  c.save(); c.translate(-9, -46);
  const sg = c.createRadialGradient(-3, -4, 2, 0, 0, 16); sg.addColorStop(0, '#e8c48a'); sg.addColorStop(1, '#8a5a2a');
  c.fillStyle = sg; c.beginPath(); c.arc(0, 0, 15, 0, 7); c.fill();
  c.fillStyle = '#2f6fb0'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 15, -1.2, .6); c.closePath(); c.fill(); c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 15, 1.9, 3.7); c.closePath(); c.fill();
  c.strokeStyle = '#6f7880'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 15, 0, 7); c.stroke();
  c.fillStyle = '#c9d0d6'; c.beginPath(); c.arc(0, 0, 4.5, 0, 7); c.fill(); c.strokeStyle = '#3a3a3a'; c.lineWidth = 1.2; c.stroke();
  c.restore();
  leg(c, -3, -30, a2, b2, '#6b4a2e', '#4a2e18');
  // tunic
  const tg = c.createLinearGradient(-12, 0, 12, 0); tg.addColorStop(0, '#2f6a2c'); tg.addColorStop(.5, '#4f9a4a'); tg.addColorStop(1, '#2a5e27');
  c.fillStyle = tg; c.strokeStyle = '#1a2a12'; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(-11, -55); c.lineTo(11, -55); c.lineTo(10, -35); c.lineTo(14, -21); c.lineTo(9, -24); c.lineTo(5, -20); c.lineTo(0, -24); c.lineTo(-5, -20); c.lineTo(-9, -24); c.lineTo(-14, -21); c.lineTo(-10, -35); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = '#d6b44a'; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, -55); c.lineTo(0, -48); c.lineTo(6, -55); c.stroke();
  c.fillStyle = '#5a3a1e'; c.fillRect(-11, -37, 22, 5); c.fillStyle = '#e8c24a'; c.fillRect(-3, -38, 6, 7);
  leg(c, 3, -30, a1, b1, '#7a5634', '#5a3820');
  // head
  const hx = 3, hy = -70;
  c.fillStyle = '#f2c39a'; c.strokeStyle = '#5a3018'; c.lineWidth = 2.2;
  c.beginPath(); c.ellipse(hx, hy, 15, 16, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#f2c39a'; c.beginPath(); c.ellipse(hx - 9, hy + 1, 4, 5, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = 'rgba(230,110,90,.35)'; c.beginPath(); c.ellipse(hx + 7, hy + 6, 4, 2.5, 0, 0, 7); c.fill();
  c.fillStyle = '#b8642e'; for (const [fx, fy] of [[5, 3], [8, 2], [11, 4], [7, 5]]) { c.beginPath(); c.arc(hx + fx, hy + fy, .9, 0, 7); c.fill(); }
  for (const ex of [3, 10]) {
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(hx + ex, hy - 2, 3.4, 4.4, 0, 0, 7); c.fill(); c.strokeStyle = '#3a2010'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#2f7ad0'; c.beginPath(); c.arc(hx + ex + 1, hy - 1.5, 2.2, 0, 7); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(hx + ex + 1.2, hy - 1.5, 1.1, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(hx + ex + .3, hy - 2.6, .7, 0, 7); c.fill();
  }
  c.strokeStyle = '#8a2e0a'; c.lineWidth = 2; c.beginPath(); c.moveTo(hx + 1, hy - 8); c.lineTo(hx + 6, hy - 9); c.moveTo(hx + 8, hy - 9); c.lineTo(hx + 13, hy - 8); c.stroke();
  c.strokeStyle = '#5a3018'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(hx + 14, hy); c.quadraticCurveTo(hx + 17, hy + 3, hx + 13, hy + 4); c.stroke();
  c.beginPath(); c.arc(hx + 9, hy + 8, 3.2, .2, Math.PI - .4); c.stroke();
  // hair
  const hg = c.createLinearGradient(0, hy - 18, 0, hy + 4); hg.addColorStop(0, '#ee7a34'); hg.addColorStop(1, '#c0420e');
  c.fillStyle = hg; c.strokeStyle = '#5a1e06'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(hx - 15, hy + 4); c.quadraticCurveTo(hx - 18, hy - 18, hx, hy - 18); c.quadraticCurveTo(hx + 16, hy - 18, hx + 16, hy - 6);
  c.quadraticCurveTo(hx + 10, hy - 12, hx + 4, hy - 9); c.quadraticCurveTo(hx - 2, hy - 13, hx - 6, hy - 6); c.quadraticCurveTo(hx - 10, hy - 2, hx - 11, hy + 6); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,200,140,.6)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(hx - 6, hy - 15); c.quadraticCurveTo(hx + 2, hy - 17, hx + 8, hy - 14); c.stroke();
  c.fillStyle = '#c9d0d6'; c.fillRect(hx - 13, hy - 4, 5, 3);
  if (carry) { limb(c, 6, -52, 9, -84, 7, '#f2c39a', '#5a3018'); limb(c, -4, -52, -5, -84, 7, '#f2c39a', '#5a3018'); c.restore(); return; }
  // sword arm
  let ang = .55 + Math.sin(t * 3) * .04;
  if (st === 'run') ang = .35 + Math.sin(t * 13) * .5;
  if (st === 'jump' || st === 'fall') ang = -.4;
  if (swing > 0) { const k = 1 - swing / .28; ang = k < .2 ? L(.4, -2.3, k / .2) : L(-2.3, 1.5, E((k - .2) / .8)); }
  const sx = 6, sy = -52, hx2 = sx + Math.sin(ang + .25) * 22, hy2 = sy + Math.cos(ang + .25) * 22;
  if (swing > 0 && swing < .24) {
    c.save(); c.globalAlpha = alpha * .45; c.strokeStyle = '#fff'; c.lineWidth = 14; c.lineCap = 'round';
    c.beginPath(); c.arc(sx, sy, 46, -Math.PI / 2 - 2.3 + Math.PI, Math.PI / 2 - ang + Math.PI / 2 - .2, false); c.stroke(); c.restore();
  }
  limb(c, sx, sy, hx2, hy2, 7, '#f2c39a', '#5a3018');
  c.save(); c.translate(hx2, hy2); c.rotate(-ang + Math.PI);
  c.fillStyle = '#5a3a1e'; c.fillRect(-2.5, -2, 5, 9);
  c.fillStyle = '#e0b23a'; c.strokeStyle = '#6a4a10'; c.lineWidth = 1.2; rr(c, -8, 6, 16, 4, 2); c.fill(); c.stroke();
  const bg = c.createLinearGradient(-3, 0, 3, 0); bg.addColorStop(0, '#f4f7fa'); bg.addColorStop(.5, '#c4ccd4'); bg.addColorStop(1, '#8a949e');
  c.fillStyle = bg; c.strokeStyle = '#3a424a'; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(-3, 10); c.lineTo(3, 10); c.lineTo(3, 36); c.lineTo(0, 41); c.lineTo(-3, 36); c.closePath(); c.fill(); c.stroke();
  c.restore();
  c.restore();
}
function drawRaider(c, x, y, face, st, t, hurt, alpha = 1) {
  c.save(); c.translate(x, y); c.scale(face * 1.12, 1.12); c.globalAlpha = alpha;
  const [a1, a2, b1, b2] = legsPose(st === 'charge' ? 'run' : st === 'walk' ? 'run' : 'idle', st === 'walk' ? t * .55 : t);
  if (hurt > 0) c.filter = 'brightness(1.8)';
  leg(c, -4, -28, a2, b2, '#4a3a2a', '#2a1e14');
  // body
  const bg = c.createLinearGradient(-16, 0, 16, 0); bg.addColorStop(0, '#5a3418'); bg.addColorStop(.5, '#8a5428'); bg.addColorStop(1, '#4a2a12');
  c.fillStyle = bg; c.strokeStyle = '#1e1008'; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(-15, -56); c.quadraticCurveTo(0, -62, 15, -56); c.lineTo(17, -24); c.lineTo(-17, -24); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#3a2a1a'; c.fillRect(-17, -34, 34, 6); c.fillStyle = '#9aa2aa'; c.fillRect(-4, -35, 8, 8);
  // fur collar
  c.fillStyle = '#8a7a64'; for (let i = -3; i <= 3; i++) { c.beginPath(); c.arc(i * 5, -57 + Math.abs(i), 6, 0, 7); c.fill(); }
  leg(c, 4, -28, a1, b1, '#5a4632', '#2e2016');
  // head
  const hx = 3, hy = -70;
  c.fillStyle = '#e2a982'; c.strokeStyle = '#4a2410'; c.lineWidth = 2;
  c.beginPath(); c.ellipse(hx, hy, 14, 15, 0, 0, 7); c.fill(); c.stroke();
  // beard
  const bd = c.createLinearGradient(0, hy, 0, hy + 34); bd.addColorStop(0, '#d8d2c6'); bd.addColorStop(1, '#a8a092');
  c.fillStyle = bd; c.strokeStyle = '#5a544a';
  c.beginPath(); c.moveTo(hx - 12, hy + 1); c.quadraticCurveTo(hx - 14, hy + 22, hx + 2, hy + 32); c.quadraticCurveTo(hx + 18, hy + 22, hx + 15, hy + 1);
  c.quadraticCurveTo(hx + 8, hy + 8, hx + 2, hy + 6); c.quadraticCurveTo(hx - 4, hy + 8, hx - 12, hy + 1); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(90,84,74,.6)'; c.lineWidth = 1; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(hx + 2 + i * 4, hy + 10); c.lineTo(hx + 2 + i * 3, hy + 28); c.stroke(); }
  c.fillStyle = '#8a7a64'; c.beginPath(); c.arc(hx + 2, hy + 30, 3, 0, 7); c.fill();
  // eyes (angry), big nose
  c.fillStyle = '#fff'; c.beginPath(); c.ellipse(hx + 8, hy - 2, 3, 3.2, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(hx + 1, hy - 2, 2.6, 3, 0, 0, 7); c.fill();
  c.fillStyle = '#111'; c.beginPath(); c.arc(hx + 9, hy - 1.5, 1.6, 0, 7); c.arc(hx + 2, hy - 1.5, 1.4, 0, 7); c.fill();
  c.strokeStyle = '#3a2010'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(hx - 2, hy - 8); c.lineTo(hx + 5, hy - 5); c.moveTo(hx + 6, hy - 5); c.lineTo(hx + 13, hy - 8); c.stroke();
  c.fillStyle = '#d08a66'; c.strokeStyle = '#4a2410'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(hx + 13, hy + 3, 5, 4, 0, 0, 7); c.fill(); c.stroke();
  // iron helmet with nose guard
  const ig = c.createLinearGradient(hx - 15, hy - 20, hx + 15, hy - 4); ig.addColorStop(0, '#e6eaee'); ig.addColorStop(.4, '#9aa4ae'); ig.addColorStop(1, '#55606a');
  c.fillStyle = ig; c.strokeStyle = '#22282e'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(hx - 16, hy - 4); c.quadraticCurveTo(hx - 15, hy - 26, hx, hy - 26); c.quadraticCurveTo(hx + 15, hy - 26, hx + 16, hy - 4); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#7a848e'; c.fillRect(hx - 16, hy - 7, 32, 5); c.strokeRect(hx - 16, hy - 7, 32, 5);
  c.fillRect(hx + 9, hy - 7, 4, 12); c.strokeRect(hx + 9, hy - 7, 4, 12);
  c.fillStyle = '#d6dce2'; for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(hx + i * 6, hy - 4.5, 1.1, 0, 7); c.fill(); }
  // axe arm
  const ang = st === 'charge' ? -1.6 + Math.sin(t * 14) * .3 : .5 + Math.sin(t * 6) * .1;
  const sx = 7, sy = -52, hx2 = sx + Math.sin(ang + .2) * 22, hy2 = sy + Math.cos(ang + .2) * 22;
  limb(c, sx, sy, hx2, hy2, 9, '#e2a982', '#4a2410');
  c.save(); c.translate(hx2, hy2); c.rotate(-ang + Math.PI);
  c.strokeStyle = '#3a2410'; c.lineWidth = 6; c.beginPath(); c.moveTo(0, -6); c.lineTo(0, 34); c.stroke();
  c.strokeStyle = '#8a5a2a'; c.lineWidth = 3.5; c.stroke();
  const ag = c.createLinearGradient(0, 22, 16, 30); ag.addColorStop(0, '#d6dce2'); ag.addColorStop(1, '#6a747e');
  c.fillStyle = ag; c.strokeStyle = '#22282e'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(1, 24); c.quadraticCurveTo(12, 18, 17, 22); c.quadraticCurveTo(14, 32, 17, 42); c.quadraticCurveTo(10, 38, 1, 36); c.closePath(); c.fill(); c.stroke();
  c.restore();
  c.restore();
}
function drawArcher(c, x, y, face, st, t, draw, hurt, alpha = 1) {
  c.save(); c.translate(x, y); c.scale(face, 1); c.globalAlpha = alpha;
  if (hurt > 0) c.filter = 'brightness(1.8)';
  // quiver
  c.save(); c.translate(-10, -50); c.rotate(-.35);
  c.fillStyle = '#6a4424'; c.strokeStyle = '#2a1608'; c.lineWidth = 2; rr(c, -5, -6, 10, 28, 3); c.fill(); c.stroke();
  for (let i = -1; i <= 1; i++) { c.strokeStyle = '#c9b48a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(i * 3, -6); c.lineTo(i * 3, -14); c.stroke(); c.fillStyle = '#f0f0f0'; c.beginPath(); c.moveTo(i * 3, -18); c.lineTo(i * 3 - 2.5, -12); c.lineTo(i * 3 + 2.5, -12); c.fill(); }
  c.restore();
  const p = legsPose('idle', t);
  leg(c, -4, -30, -.18 + p[1], .1, '#5a5244', '#3a2c1c');
  const bg = c.createLinearGradient(-12, 0, 12, 0); bg.addColorStop(0, '#5e6c5c'); bg.addColorStop(.5, '#8c9c88'); bg.addColorStop(1, '#55634f');
  c.fillStyle = bg; c.strokeStyle = '#1e2a1a'; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(-11, -55); c.lineTo(11, -55); c.lineTo(12, -22); c.lineTo(6, -25); c.lineTo(0, -21); c.lineTo(-6, -25); c.lineTo(-12, -22); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#4a3420'; c.fillRect(-11, -36, 22, 4);
  c.strokeStyle = '#4a3420'; c.lineWidth = 3; c.beginPath(); c.moveTo(-9, -55); c.lineTo(9, -36); c.stroke();
  leg(c, 4, -30, .22 + p[0], .1, '#625a4a', '#3e3020');
  // head with leather hood
  const hx = 3, hy = -69;
  c.fillStyle = '#e6b48e'; c.strokeStyle = '#4a2a14'; c.lineWidth = 2; c.beginPath(); c.ellipse(hx, hy, 13, 14, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = 'rgba(80,60,40,.35)'; c.beginPath(); c.ellipse(hx + 6, hy + 8, 8, 5, 0, 0, Math.PI); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.ellipse(hx + 8, hy - 1, 2.8, 2.4, 0, 0, 7); c.fill();
  c.fillStyle = '#111'; c.beginPath(); c.arc(hx + 9, hy - .8, 1.4, 0, 7); c.fill();
  c.strokeStyle = '#2a1a0a'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(hx + 4, hy - 6); c.lineTo(hx + 12, hy - 4); c.stroke();
  c.strokeStyle = '#4a2a14'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(hx + 12, hy + 1); c.lineTo(hx + 15, hy + 4); c.lineTo(hx + 12, hy + 5); c.stroke();
  c.beginPath(); c.moveTo(hx + 6, hy + 9); c.lineTo(hx + 11, hy + 8); c.stroke();
  const hd = c.createLinearGradient(0, hy - 18, 0, hy + 10); hd.addColorStop(0, '#8a6a44'); hd.addColorStop(1, '#5a4228');
  c.fillStyle = hd; c.strokeStyle = '#2a1a0a'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(hx - 15, hy + 12); c.quadraticCurveTo(hx - 18, hy - 20, hx + 2, hy - 19); c.quadraticCurveTo(hx + 16, hy - 18, hx + 15, hy - 5);
  c.quadraticCurveTo(hx + 6, hy - 11, hx - 2, hy - 8); c.quadraticCurveTo(hx - 7, hy + 2, hx - 7, hy + 14); c.closePath(); c.fill(); c.stroke();
  // bow
  const pull = draw * 16;
  const bx = 22, by = -50;
  c.strokeStyle = '#3a2008'; c.lineWidth = 5; c.beginPath(); c.moveTo(bx - 6, by - 26); c.quadraticCurveTo(bx + 10, by, bx - 6, by + 26); c.stroke();
  c.strokeStyle = '#9a6a30'; c.lineWidth = 3; c.stroke();
  c.strokeStyle = '#eee'; c.lineWidth = 1; c.beginPath(); c.moveTo(bx - 6, by - 26); c.lineTo(bx - 6 - pull, by); c.lineTo(bx - 6, by + 26); c.stroke();
  limb(c, 7, -52, bx + 2, by, 7, '#e6b48e', '#4a2a14');
  limb(c, -2, -51, bx - 6 - pull, by, 7, '#e6b48e', '#4a2a14');
  if (draw > 0) { c.strokeStyle = '#7a5a30'; c.lineWidth = 2; c.beginPath(); c.moveTo(bx - 6 - pull, by); c.lineTo(bx + 18, by); c.stroke(); c.fillStyle = '#9aa2aa'; c.beginPath(); c.moveTo(bx + 24, by); c.lineTo(bx + 16, by - 3); c.lineTo(bx + 16, by + 3); c.fill(); }
  c.restore();
}
function drawProp(c, kind, x, y, rot) {
  c.save(); c.translate(x, y - 16); c.rotate(rot);
  if (kind === 'rock') {
    const g2 = c.createRadialGradient(-5, -6, 2, 0, 0, 20); g2.addColorStop(0, '#d6d4cc'); g2.addColorStop(.6, '#9a988f'); g2.addColorStop(1, '#5e5c55');
    c.fillStyle = g2; c.strokeStyle = '#2e2d2a'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(-17, 6); c.lineTo(-15, -8); c.lineTo(-6, -16); c.lineTo(8, -15); c.lineTo(17, -5); c.lineTo(16, 10); c.lineTo(4, 16); c.lineTo(-12, 14); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(40,40,36,.5)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-4, -10); c.lineTo(2, -2); c.lineTo(-2, 8); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(-6, -8, 5, 3, -.4, 0, 7); c.fill();
    c.fillStyle = 'rgba(90,120,60,.45)'; c.beginPath(); c.ellipse(8, -10, 6, 3, .3, 0, 7); c.fill();
  } else {
    const g2 = c.createLinearGradient(-16, 0, 16, 0); g2.addColorStop(0, '#8a5a2a'); g2.addColorStop(.5, '#c8925a'); g2.addColorStop(1, '#7a4a1e');
    c.fillStyle = g2; c.strokeStyle = '#2a1608'; c.lineWidth = 2.2; c.fillRect(-16, -16, 32, 32); c.strokeRect(-16, -16, 32, 32);
    c.strokeStyle = 'rgba(42,22,8,.6)'; c.lineWidth = 1.2; for (const yy of [-6, 4]) { c.beginPath(); c.moveTo(-16, yy); c.lineTo(16, yy); c.stroke(); }
    c.strokeStyle = '#6a4220'; c.lineWidth = 5; c.beginPath(); c.moveTo(-13, -13); c.lineTo(13, 13); c.stroke();
    c.strokeStyle = '#2a1608'; c.lineWidth = 2.2; c.strokeRect(-16, -16, 32, 32);
    c.fillStyle = '#3a3a3a'; for (const [nx, ny] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) { c.beginPath(); c.arc(nx, ny, 1.8, 0, 7); c.fill(); }
  }
  c.restore();
}
function drawCoin(c, x, y, kind, t, s = 1) {
  const col = { gold: ['#fff2a8', '#e8b420', '#8a5a08'], silver: ['#ffffff', '#c8d0d8', '#5a6470'], bronze: ['#ffd8b0', '#d08a50', '#6a3a14'] }[kind];
  const sq = Math.abs(Math.cos(t * 2.5));
  c.save(); c.translate(x, y); c.scale(s * Math.max(.25, sq), s);
  const gl = c.createRadialGradient(0, 0, 4, 0, 0, 24); gl.addColorStop(0, 'rgba(255,240,180,.55)'); gl.addColorStop(1, 'rgba(255,240,180,0)');
  c.fillStyle = gl; c.beginPath(); c.arc(0, 0, 24, 0, 7); c.fill();
  const g = c.createRadialGradient(-4, -5, 1, 0, 0, 14); g.addColorStop(0, col[0]); g.addColorStop(.55, col[1]); g.addColorStop(1, col[2]);
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, 13, 0, 7); c.fill();
  c.strokeStyle = col[2]; c.lineWidth = 2; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 10, 0, 7); c.stroke();
  // engraved rune: a simple R-rune
  c.strokeStyle = col[2]; c.lineWidth = 2.2; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-3, 6); c.lineTo(-3, -6); c.lineTo(3, -2); c.lineTo(-3, 1); c.lineTo(4, 6); c.stroke();
  c.restore();
}
function heartPath(c, x, y, s) {
  c.beginPath(); c.moveTo(x, y + s * .35);
  c.bezierCurveTo(x - s * .9, y - s * .25, x - s * .45, y - s * .95, x, y - s * .45);
  c.bezierCurveTo(x + s * .45, y - s * .95, x + s * .9, y - s * .25, x, y + s * .35); c.closePath();
}
function drawHeart(c, x, y, s, full) {
  heartPath(c, x, y, s);
  if (full) {
    const g = c.createRadialGradient(x - s * .3, y - s * .4, 1, x, y - s * .2, s); g.addColorStop(0, '#ff9a9a'); g.addColorStop(.5, '#e0282e'); g.addColorStop(1, '#7a0a10');
    c.fillStyle = g; c.fill(); c.strokeStyle = '#3a0608'; c.lineWidth = 2; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(x - s * .32, y - s * .45, s * .14, s * .09, -.6, 0, 7); c.fill();
  } else { c.fillStyle = 'rgba(40,24,10,.45)'; c.fill(); c.strokeStyle = 'rgba(30,18,8,.8)'; c.lineWidth = 2; c.stroke(); }
}
function plank(c, x, y, w, h) {
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#8a6a46'); g.addColorStop(.5, '#6e5234'); g.addColorStop(1, '#4e3822');
  c.fillStyle = g; c.beginPath(); c.moveTo(x + 4, y); c.lineTo(x + w - 2, y + 2); c.lineTo(x + w, y + h - 3); c.lineTo(x + 2, y + h); c.closePath(); c.fill();
  c.strokeStyle = '#2a1a0c'; c.lineWidth = 2.5; c.stroke();
  c.strokeStyle = 'rgba(40,24,10,.45)'; c.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) { const yy = y + 6 + i * (h - 12) / 3; c.beginPath(); c.moveTo(x + 8, yy); c.bezierCurveTo(x + w * .3, yy + 3, x + w * .6, yy - 3, x + w - 8, yy + 1); c.stroke(); }
  c.fillStyle = '#3a3a3a'; for (const nx of [x + 9, x + w - 9]) { c.beginPath(); c.arc(nx, y + h / 2, 2.5, 0, 7); c.fill(); }
}

// ---------- game state ----------
let scene = 'loading', loadT = 0, tt = 0, paused = false, helpOpen = false;
let g = null;
const keys = { l: 0, r: 0, j: 0 };
function newRun(fromCheckpoint) {
  buildGeometry();
  const cp = fromCheckpoint && g && g.cpOn;
  const keep = cp ? { score: g.cpScore, coins: g.cpCoins, kills: g.cpKills, time: g.cpTime } : null;
  g = {
    hero: { x: cp ? LEVEL.checkpoint : 120, y: GY, vx: 0, vy: 0, face: 1, on: true, coyote: 0, buf: 0, swing: 0, inv: 0, hearts: 5, max: 5, st: 'idle', anim: 0, safe: { x: 120, y: GY }, hurtT: 0 },
    cam: 0, score: keep ? keep.score : 0, coinsGot: keep ? keep.coins : 0, kills: keep ? keep.kills : 0,
    time: keep ? keep.time : 300, cpOn: !!cp, cpScore: 0, cpCoins: 0, cpKills: 0, cpTime: 300, flagT: cp ? 1 : 0,
    coins: [], items: [], enemies: [], arrows: [], fx: [], pops: [], barrels: LEVEL.barrels.map(x => ({ x, broken: false, t: 0 })), props: LEVEL.props.map(([kind, x]) => ({ kind, x, y: GY, vx: 0, vy: 0, held: false, thrown: false, broken: false })),
    state: 'play', endT: 0, tally: null, shipX: 0,
  };
  if (cp) { g.cpScore = keep.score; g.cpCoins = keep.coins; g.cpKills = keep.kills; g.cpTime = keep.time; g.hero.safe = { x: LEVEL.checkpoint, y: GY }; }
  // coins: trails over roofs, planks and ground
  const add = (x, y, kind = 'gold') => g.coins.push({ x, y, kind, got: false });
  for (const h of LEVEL.houses) {
    for (let i = 1; i < 8; i++) { const k = i / 8, x = L(h.x - 30, h.x + h.w + 30, k); const s = surfaces.find(s => s.kind === 'roof' && x >= s.x1 && x <= s.x2); add(x, surfY(s, x) - 46, i === 4 ? 'gold' : i % 2 ? 'bronze' : 'silver'); }
    add(h.px, h.top - 20, 'silver'); add(h.px, h.top + 30, 'bronze');
  }
  for (const [x, y, w] of LEVEL.planks) { add(x + w / 2, y - 44, 'gold'); }
  for (const x of [300, 340, 1180, 1250, 1700, 1740, 2500, 3300, 3950, 4150, 4200, 4950, 5050]) add(x, GY - 40, x % 3 ? 'bronze' : 'silver');
  for (let i = 0; i < 5; i++) { const x = 1430 + i * 40; add(x, GY - 120 - Math.sin(i / 4 * Math.PI) * 60, 'gold'); }
  for (let i = 0; i < 5; i++) { const x = 2680 + i * 40; add(x, GY - 130 - Math.sin(i / 4 * Math.PI) * 60, 'gold'); }
  for (let i = 0; i < 5; i++) { const x = 3880 + i * 45; add(x, GY - 140 - Math.sin(i / 4 * Math.PI) * 60, 'gold'); }
  if (cp) g.coins.forEach(c => { if (c.x < LEVEL.checkpoint) c.got = true; });
  // hearts (mead horns)
  g.items.push({ x: LEVEL.houses[1].px, y: LEVEL.houses[1].py - 70, kind: 'heart', got: false });
  g.items.push({ x: LEVEL.houses[3].px, y: LEVEL.houses[3].py - 70, kind: 'heart', got: false });
  // enemies
  const raider = (x, a, b) => g.enemies.push({ type: 'raider', x, y: GY, face: -1, a, b, hp: 2, st: 'walk', t: R(0, 3), hurt: 0, dead: 0, kb: 0 });
  const archer = (x, y, face) => g.enemies.push({ type: 'archer', x, y, face, hp: 1, st: 'idle', t: 0, cd: R(.5, 1.5), draw: 0, hurt: 0, dead: 0 });
  raider(1200, 990, 1390); archer(2470, GY, -1); raider(2300, 2290, 2640);
  archer(LEVEL.houses[2].px + 4, LEVEL.houses[2].py, -1); raider(3760, 3690, 3840); raider(4200, 4090, 4330);
  raider(4600, LEVEL.houses[3].x - 20, LEVEL.houses[3].x + LEVEL.houses[3].w + 20); archer(4920, GY, -1);
  for (const e of g.enemies) { const u = under(e.x, e.y); if (u) e.y = u.y; }
  if (cp) g.enemies.forEach(e => { if (e.x < LEVEL.checkpoint) e.dead = 9; });
  scene = 'play'; paused = false;
}

// ---------- update ----------
function hurtHero(fromX) {
  const h = g.hero; if (h.inv > 0 || g.state !== 'play') return;
  h.hearts--; h.inv = 1.5; h.hurtT = .35; sfx.hurt(); dropProp(0);
  h.vx = (h.x < fromX ? -1 : 1) * 260; h.vy = -380; h.on = false;
  if (h.hearts <= 0) { g.state = 'dead'; g.endT = 0; }
}
function pop(txt, x, y, col = '#ffe14a') { g.pops.push({ txt, x, y, t: 0, col }); }
function poof(x, y, n = 12, col = 'rgba(240,236,228,.9)') { for (let i = 0; i < n; i++) g.fx.push({ x, y, vx: R(-120, 120), vy: R(-160, 20), life: R(.4, .8), r: R(6, 14), col, cloud: true }); }
function heroBox(h) { return { x: h.x - 15, y: h.y - 72, w: 30, h: 72 }; }
const ov = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function updateHero(dt) {
  const h = g.hero;
  const dir = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
  const acc = h.on ? 2600 : 1700;
  if (h.hurtT > 0) h.hurtT -= dt;
  else if (dir) { h.vx = C(h.vx + dir * acc * dt, -RUN, RUN); h.face = dir; }
  else { const d = Math.min(Math.abs(h.vx), (h.on ? 2800 : 600) * dt); h.vx -= Math.sign(h.vx) * d; }
  h.coyote = h.on ? .1 : h.coyote - dt; h.buf -= dt;
  if (h.buf > 0 && h.coyote > 0) { h.vy = -JUMP; h.on = false; h.coyote = 0; h.buf = 0; sfx.jump(); }
  h.vy = Math.min(h.vy + GRAV * dt, 1100);
  // horizontal move with solids
  h.x += h.vx * dt;
  h.x = C(h.x, 16, LEVEL.width - 16);
  for (const s of solids) {
    const b = heroBox(h);
    if (!ov(b, s) || h.y <= s.y + 6) continue;
    const roof = h.y <= s.y + 56 && h.vy > -250 && surfaces.find(r => r.kind === 'roof' && h.x >= r.x1 && h.x <= r.x2);
    if (roof) { h.y = surfY(roof, h.x); h.vy = 0; h.on = true; h.surf = roof; continue; }
    h.x = h.x < s.x + s.w / 2 ? s.x - 15 : s.x + s.w + 15; h.vx = 0;
  }
  // vertical
  const prevF = h.y; h.y += h.vy * dt;
  const wasOn = h.on; h.on = false;
  if (h.vy >= 0) {
    if (wasOn) { const u = under(h.x, h.y); if (u && h.vy >= 0) { h.y = u.y; h.vy = 0; h.on = true; h.surf = u.s; } }
    if (!h.on) { const l = landing(h.x, prevF, h.y); if (l) { h.y = l.y; h.on = true; h.surf = l.s; if (h.vy > 500) { dust(h.x, h.y); } h.vy = 0; } }
  }
  if (h.on) {
    h.stable = (h.stable || 0) + dt;
    if (h.stable > .3 && h.surf.kind !== 'ship') { const s = h.surf; if (h.x > s.x1 + 30 && h.x < s.x2 - 30) h.safe = { x: h.x, y: h.y }; }
    if (h.surf.kind === 'ship' && g.state === 'play') win();
  } else h.stable = 0;
  if (h.y > GY + 80 && g.state === 'play') {
    sfx.splash(); for (let i = 0; i < 16; i++) g.fx.push({ x: h.x, y: GY + 10, vx: R(-140, 140), vy: R(-420, -160), life: R(.5, .9), r: R(2, 4), col: '#bfe6ff' });
    h.hearts--; if (h.hearts <= 0) { g.state = 'dead'; g.endT = 0; return; }
    h.x = h.safe.x; h.y = h.safe.y; h.vx = 0; h.vy = 0; h.inv = 1.5; h.on = true; sfx.hurt();
  }
  // attack
  if (h.swing > 0) {
    h.swing -= dt;
    const k = 1 - h.swing / .28;
    if (k > .2 && k < .75) {
      const hb = { x: h.face > 0 ? h.x + 4 : h.x - 64, y: h.y - 86, w: 60, h: 70 };
      for (const e of g.enemies) {
        if (e.dead || e.hitBy === h.swingId) continue;
        const eb = { x: e.x - 18, y: e.y - 78, w: 36, h: 78 };
        if (ov(hb, eb)) { e.hitBy = h.swingId; damageEnemy(e, h.face); }
      }
      for (const a of g.arrows) if (!a.dead && a.x > hb.x && a.x < hb.x + hb.w && a.y > hb.y && a.y < hb.y + hb.h) { a.dead = true; spark(a.x, a.y); sfx.hit(); g.score += 25; pop('+25', a.x, a.y - 10); }
      for (const b of g.barrels) if (!b.broken && b.x > hb.x - 10 && b.x < hb.x + hb.w + 10 && h.y > GY - 90) breakBarrel(b);
      for (const p of g.props) if (p.kind === 'crate' && !p.broken && !p.held && p.x > hb.x - 10 && p.x < hb.x + hb.w + 10 && Math.abs(p.y - h.y) < 60) breakCrate(p);
    }
  }
  h.inv = Math.max(0, h.inv - dt);
  h.anim += dt;
  h.st = !h.on ? (h.vy < 0 ? 'jump' : 'fall') : Math.abs(h.vx) > 30 ? 'run' : 'idle';
  // pickups
  const hb = heroBox(h);
  for (const c of g.coins) if (!c.got && Math.abs(c.x - h.x) < 26 && c.y > hb.y - 14 && c.y < hb.y + hb.h + 10) {
    c.got = true; const v = { gold: 100, silver: 50, bronze: 25 }[c.kind]; g.score += v; g.coinsGot++; sfx.coin();
    pop(`+${v}`, c.x, c.y - 10); for (let i = 0; i < 6; i++) g.fx.push({ x: c.x, y: c.y, vx: R(-90, 90), vy: R(-120, 0), life: .4, r: 2, col: '#fff2a8' });
  }
  for (const it of g.items) if (!it.got && Math.abs(it.x - h.x) < 26 && it.y > hb.y - 14 && it.y < hb.y + hb.h + 10) {
    it.got = true; h.hearts = Math.min(h.max, h.hearts + 1); sfx.coin(); pop('+♥', it.x, it.y - 10, '#ff8a8a');
  }
  // checkpoint
  if (!g.cpOn && h.x > LEVEL.checkpoint) { g.cpOn = true; g.cpScore = g.score; g.cpCoins = g.coinsGot; g.cpKills = g.kills; g.cpTime = g.time; sfx.flag(); pop('CHECKPOINT!', LEVEL.checkpoint, GY - 150, '#9fe0ff'); }
  // stomp & contact
  for (const e of g.enemies) {
    if (e.dead) continue;
    const eb = { x: e.x - 16, y: e.y - 74, w: 32, h: 74 };
    if (!ov(hb, eb)) continue;
    if (h.vy > 150 && prevF < e.y - 52) { damageEnemy(e, h.face, true); h.vy = -560; h.on = false; }
    else hurtHero(e.x);
  }
}
let swingCount = 0;
function attack() { const h = g.hero; if (g.state !== 'play') return; if (h.carry) { throwProp(); return; } if (h.swing > 0) return; h.swing = .28; h.swingId = ++swingCount; sfx.swing(); }
function damageEnemy(e, dir, stomp) {
  e.hp -= stomp ? 2 : 1; e.hurt = .18; e.kb = dir * 220; sfx.hit(); spark(e.x, e.y - 50);
  if (e.hp <= 0) { e.dead = .001; e.dvx = dir * 240; e.dvy = -520; e.rot = 0; g.kills++; g.score += 200; pop('+200', e.x, e.y - 90); sfx.poof(); }
}
function spark(x, y) { g.fx.push({ x, y, star: true, life: .25 }); for (let i = 0; i < 8; i++) g.fx.push({ x, y, vx: R(-200, 200), vy: R(-200, 100), life: R(.2, .4), r: 2.5, col: '#fff6b0' }); }
function dust(x, y) { for (let i = 0; i < 6; i++) g.fx.push({ x: x + R(-10, 10), y, vx: R(-80, 80), vy: R(-40, -10), life: R(.3, .5), r: R(4, 8), col: 'rgba(180,170,150,.6)', cloud: true }); }
function pickOrThrow() {
  if (!g || scene !== 'play' || paused || g.state !== 'play') return;
  const h = g.hero;
  if (h.carry) { throwProp(); return; }
  const p = g.props.find(p => !p.broken && !p.thrown && !p.held && Math.abs(p.x - h.x) < 42 && Math.abs(p.y - h.y) < 50);
  if (p) { p.held = true; h.carry = p; sfx.click(); }
}
function dropProp(vx) { const h = g.hero, p = h.carry; if (!p) return; p.held = false; p.thrown = true; p.vx = vx; p.vy = -60; h.carry = null; }
function throwProp() { const h = g.hero, p = h.carry; if (!p) return; p.held = false; p.thrown = true; p.vx = h.face * 560 + h.vx * .3; p.vy = -280; p.owner = true; h.carry = null; sfx.swing(); }
function breakCrate(p) {
  p.broken = true; sfx.barrel(); g.score += 25;
  for (let i = 0; i < 12; i++) g.fx.push({ x: p.x, y: p.y - 15, vx: R(-220, 220), vy: R(-380, -120), life: R(.6, 1), r: 4, col: '#a87a44', plank: true, rot: R(0, 6) });
  if (Math.random() < .6) g.coins.push({ x: p.x, y: p.y - 50, kind: Math.random() < .5 ? 'gold' : 'silver', got: false });
}
function updateProps(dt) {
  const h = g.hero;
  for (const p of g.props) {
    if (p.broken) continue;
    if (p.held) { p.x = h.x + h.face * 2; p.y = h.y - 84; continue; }
    if (!p.thrown) continue;
    p.vy = Math.min(p.vy + 1400 * dt, 1000);
    p.x += p.vx * dt; const prev = p.y; p.y += p.vy * dt;
    const fast = Math.hypot(p.vx, p.vy) > 300;
    for (const s of solids) if (p.x > s.x && p.x < s.x + s.w && p.y > s.y + 6 && p.y - 30 < s.y + s.h) { if (p.kind === 'crate' && fast) breakCrate(p); else { p.x = p.vx > 0 ? s.x - 1 : s.x + s.w + 1; p.vx *= -.3; } break; }
    if (p.broken) continue;
    for (const e of g.enemies) {
      if (e.dead || !p.owner) continue;
      if (Math.abs(e.x - p.x) < 26 && p.y > e.y - 80 && p.y - 30 < e.y) {
        e.hp = 1; damageEnemy(e, Math.sign(p.vx) || 1);
        if (p.kind === 'crate') breakCrate(p); else { p.vx *= -.25; p.vy = -220; p.owner = false; }
        break;
      }
    }
    if (p.broken) continue;
    for (const b of g.barrels) if (!b.broken && Math.abs(b.x - p.x) < 26 && p.y > GY - 52) { breakBarrel(b); if (p.kind === 'crate') breakCrate(p); else p.vx *= -.3; }
    if (p.broken) continue;
    if (p.vy > 0) { const l = landing(p.x, prev, p.y); if (l) { p.y = l.y; if (p.kind === 'crate' && p.vy > 520) { breakCrate(p); continue; } dust(p.x, p.y); p.vy = 0; p.vx = 0; p.thrown = false; p.owner = false; sfx.hit(); } }
    if (p.y > GY + 80) { p.broken = true; sfx.splash(); for (let i = 0; i < 10; i++) g.fx.push({ x: p.x, y: GY + 10, vx: R(-120, 120), vy: R(-300, -100), life: .6, r: 3, col: '#bfe6ff' }); }
  }
}
function breakBarrel(b) {
  b.broken = true; b.t = 0; sfx.barrel(); g.score += 25;
  for (let i = 0; i < 10; i++) g.fx.push({ x: b.x, y: GY - 20, vx: R(-200, 200), vy: R(-360, -120), life: R(.6, 1), r: R(3, 6), col: '#7a4a22', plank: true, rot: R(0, 6) });
  g.coins.push({ x: b.x, y: GY - 60, kind: 'gold', got: false, popT: 0 });
}
function updateEnemies(dt) {
  const h = g.hero;
  for (const e of g.enemies) {
    e.t += dt; e.hurt = Math.max(0, e.hurt - dt);
    if (e.dead) { if (e.dead < 5) { e.dead += dt; e.x += e.dvx * dt; e.dvy += 1400 * dt; e.y += e.dvy * dt; e.rot += dt * 8 * Math.sign(e.dvx); } continue; }
    if (e.kb) { e.x += e.kb * dt; e.kb *= Math.pow(.02, dt); if (Math.abs(e.kb) < 5) e.kb = 0; }
    if (e.type === 'raider') {
      const dx = h.x - e.x, near = Math.abs(dx) < 280 && Math.abs(h.y - e.y) < 70;
      e.st = near ? 'charge' : 'walk';
      const sp = near ? 150 : 55;
      if (near) e.face = Math.sign(dx) || e.face;
      e.x += e.face * sp * dt;
      if (e.x < e.a) { e.x = e.a; e.face = 1; } if (e.x > e.b) { e.x = e.b; e.face = -1; }
      const u = under(e.x, e.y); if (u) e.y = u.y;
    } else {
      const dx = h.x - e.x, dy = h.y - e.y;
      if (Math.abs(dx) < 640) e.face = Math.sign(dx) || e.face;
      if (e.st === 'idle') { e.cd -= dt; if (e.cd <= 0 && Math.abs(dx) < 620 && Math.abs(dy) < 260 && g.state === 'play') { e.st = 'draw'; e.t = 0; } e.draw = Math.max(0, e.draw - dt * 4); }
      else if (e.st === 'draw') {
        e.draw = Math.min(1, e.t / .8);
        if (e.t >= .85) {
          const sx = e.x + e.face * 36, sy = e.y - 50, tx = h.x, ty = h.y - 40;
          const vx = e.face * 460, time = Math.max(.15, Math.abs(tx - sx) / 460), vy = (ty - sy) / time - .5 * 300 * time;
          g.arrows.push({ x: sx, y: sy, vx, vy: C(vy, -500, 300), dead: false, stuck: 0 }); sfx.twang();
          e.st = 'idle'; e.cd = R(1.6, 2.4); e.draw = 0;
        }
      }
    }
  }
  for (const a of g.arrows) {
    if (a.dead) continue;
    if (a.stuck) { a.stuck += dt; if (a.stuck > 1.5) a.dead = true; continue; }
    a.vy += 300 * dt; a.x += a.vx * dt; a.y += a.vy * dt;
    if (solids.some(s => a.x > s.x && a.x < s.x + s.w && a.y > s.y && a.y < s.y + s.h) || (a.y > GY && LEVEL.ground.some(([p, q]) => a.x > p && a.x < q))) { a.stuck = .001; continue; }
    if (a.y > H + 50 || Math.abs(a.x - h.x) > 900) { a.dead = true; continue; }
    if (ov(heroBox(h), { x: a.x - 4, y: a.y - 3, w: 8, h: 6 })) { a.dead = true; hurtHero(a.x - a.vx); }
  }
  g.arrows = g.arrows.filter(a => !a.dead);
}
function win() {
  g.state = 'win'; g.endT = 0; sfx.win();
  const timeBonus = Math.floor(g.time) * 10, heartBonus = g.hero.hearts * 500;
  const total = g.score + timeBonus + heartBonus;
  const stars = total >= 14000 ? 3 : total >= 9000 ? 2 : 1;
  g.tally = { coins: g.score, timeBonus, heartBonus, total, stars };
  save.best = Math.max(save.best, total); save.stars = Math.max(save.stars, stars); save.done = true;
  if (g.kills >= g.enemies.length) save.allKills = true;
  persist();
}
function update(dt) {
  g.endT += dt;
  for (const f of g.fx) { f.life -= dt; if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += (f.cloud ? -30 : 900) * dt; if (f.rot !== undefined) f.rot += dt * 10; } if (f.cloud) f.r += 10 * dt; }
  g.fx = g.fx.filter(f => f.life > 0);
  for (const p of g.pops) p.t += dt; g.pops = g.pops.filter(p => p.t < 1);
  if (g.state === 'play') {
    g.time -= dt;
    if (g.time <= 0) { g.time = 0; g.state = 'dead'; g.endT = 0; g.timeUp = true; }
    updateHero(dt); updateEnemies(dt); updateProps(dt);
    if (g.cpOn) g.flagT = Math.min(1, g.flagT + dt * 1.5);
  } else if (g.state === 'win') {
    g.shipX += Math.min(140, g.endT * 60) * dt;
    g.hero.x = Math.min(g.hero.x + 60 * dt, LEVEL.ship + 150); g.hero.st = 'idle'; g.hero.anim += dt;
    g.hero.x += Math.min(140, g.endT * 60) * dt;
  } else if (g.state === 'dead') { updateEnemies(dt); }
  const target = C(g.hero.x - W * .4, 0, LEVEL.width - W);
  g.cam = L(g.cam, target, Math.min(1, dt * 8));
}

// ---------- render ----------
function drawWorld() {
  const cam = g.cam;
  ctx.drawImage(skyC, 0, 0);
  const tile = (img, par) => { const off = -((cam * par) % 1600); ctx.drawImage(img, off, 0); ctx.drawImage(img, off + 1600, 0); };
  tile(mtnC, .12); tile(forestC, .35);
  ctx.save(); ctx.translate(-Math.round(cam), 0);
  // water gaps
  for (const [a, b] of LEVEL.water) {
    if (b < cam - 50 || a > cam + W + 50) continue;
    const wg = ctx.createLinearGradient(0, GY + 10, 0, H); wg.addColorStop(0, '#6a8aa0'); wg.addColorStop(1, '#24384a');
    ctx.fillStyle = wg; ctx.fillRect(a, GY + 14, b - a, H - GY);
    ctx.strokeStyle = 'rgba(230,245,255,.6)'; ctx.lineWidth = 2;
    for (let y = GY + 22; y < H; y += 14) { ctx.beginPath(); for (let x = a; x <= b; x += 8) ctx.lineTo(x, y + Math.sin(x * .05 + tt * 2 + y) * 2); ctx.stroke(); }
  }
  // ground
  for (const [a, b] of LEVEL.ground) {
    if (b < cam - 50 || a > cam + W + 50) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(a - 6, GY - 26, b - a + 12, H); ctx.clip();
    for (let x = Math.floor(a / 512) * 512; x < b + 6; x += 512) ctx.drawImage(grassC, x, GY - 14);
    ctx.restore();
    ctx.fillStyle = '#3a2e20';
    for (const ex of [a, b]) { ctx.beginPath(); ctx.ellipse(ex, GY + 40, 10, 50, 0, 0, 7); ctx.fill(); }
  }
  // houses
  LEVEL.houses.forEach((h, i) => { const hc = houseC[i]; if (hc.ox + hc.c.width < cam || hc.ox > cam + W) return; ctx.drawImage(hc.c, hc.ox, hc.oy); });
  // planks
  for (const [x, y, w] of LEVEL.planks) {
    if (x + w < cam || x > cam + W) continue;
    ctx.fillStyle = '#4a3420'; for (const px of [x + 10, x + w - 10]) ctx.fillRect(px - 3, y + 8, 6, GY - y + 20);
    plank(ctx, x - 4, y - 4, w + 8, 18);
  }
  // checkpoint banner
  const cpx = LEVEL.checkpoint;
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(cpx - 4, GY - 160, 8, 160); ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 2; ctx.strokeRect(cpx - 4, GY - 160, 8, 160);
  const fy = GY - 40 - g.flagT * 110, wave = Math.sin(tt * 5) * 4;
  ctx.fillStyle = g.cpOn ? '#c8282e' : '#8a8a8a'; ctx.beginPath(); ctx.moveTo(cpx + 4, fy); ctx.quadraticCurveTo(cpx + 30, fy + wave, cpx + 56, fy + 6); ctx.lineTo(cpx + 48, fy + 22); ctx.lineTo(cpx + 56, fy + 38); ctx.quadraticCurveTo(cpx + 30, fy + 34 + wave, cpx + 4, fy + 40); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cpx + 22, fy + 10); ctx.lineTo(cpx + 22, fy + 30); ctx.lineTo(cpx + 32, fy + 22); ctx.lineTo(cpx + 22, fy + 18); ctx.stroke();
  // signs
  for (const [sx, lines] of LEVEL.signs) {
    if (sx < cam - 100 || sx > cam + W + 100) continue;
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(sx - 4, GY - 70, 8, 70);
    const bh = 18 + lines.length * 17;
    plank(ctx, sx - 58, GY - 70 - bh, 116, bh);
    lines.forEach((ln, i) => outline(ln, sx, GY - 70 - bh + 17 + i * 17, 15, '#fff4dc', '#2a1406', '"Pirata One", Georgia, serif'));
  }
  // props
  for (const p of g.props) {
    if (p.held) continue;
    if (p.broken || p.x < cam - 50 || p.x > cam + W + 50) continue;
    drawProp(ctx, p.kind, p.x, p.y, p.thrown ? tt * 9 * Math.sign(p.vx || 1) : 0);
    if (!p.held && !p.thrown && !g.hero.carry && Math.abs(p.x - g.hero.x) < 42 && Math.abs(p.y - g.hero.y) < 50) outline('▼ S', p.x, p.y - 56 + Math.sin(tt * 6) * 3, 14, '#ffe14a', '#2a1406');
  }
  // barrels
  for (const b of g.barrels) {
    if (b.broken || b.x < cam - 40 || b.x > cam + W + 40) continue;
    const bx = b.x, by = GY;
    const bg = ctx.createLinearGradient(bx - 18, 0, bx + 18, 0); bg.addColorStop(0, '#5a3418'); bg.addColorStop(.45, '#b07a44'); bg.addColorStop(1, '#4a2a12');
    ctx.fillStyle = bg; ctx.strokeStyle = '#2a1608'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx - 15, by); ctx.quadraticCurveTo(bx - 20, by - 25, bx - 15, by - 50); ctx.lineTo(bx + 15, by - 50); ctx.quadraticCurveTo(bx + 20, by - 25, bx + 15, by); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#6a6a6a'; ctx.lineWidth = 3; for (const yy of [by - 10, by - 40]) { ctx.beginPath(); ctx.moveTo(bx - 17, yy); ctx.lineTo(bx + 17, yy); ctx.stroke(); }
    ctx.fillStyle = '#c99a62'; ctx.beginPath(); ctx.ellipse(bx, by - 50, 15, 4, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#2a1608'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  // ship
  drawShip(LEVEL.ship + g.shipX);
  // coins and items
  for (const c of g.coins) if (!c.got && c.x > cam - 30 && c.x < cam + W + 30) drawCoin(ctx, c.x, c.y + Math.sin(tt * 3 + c.x) * 3, c.kind, tt + c.x * .01);
  for (const it of g.items) if (!it.got) { const y = it.y + Math.sin(tt * 3) * 4; ctx.save(); ctx.shadowColor = '#ff6a6a'; ctx.shadowBlur = 16; drawHeart(ctx, it.x, y, 16, true); ctx.restore(); }
  // enemies
  for (const e of g.enemies) {
    if (e.dead >= 5 || e.x < cam - 80 || e.x > cam + W + 80) continue;
    ctx.save();
    if (e.dead) { ctx.translate(e.x, e.y - 40); ctx.rotate(e.rot); ctx.translate(-e.x, -e.y + 40); }
    const a = e.dead ? C(1 - e.dead / 1.2, 0, 1) : 1;
    if (e.type === 'raider') drawRaider(ctx, e.x, e.y, e.face, e.st, e.t, e.hurt, a); else drawArcher(ctx, e.x, e.y, e.face, e.st, e.t, e.draw, e.hurt, a);
    ctx.restore();
  }
  // arrows
  for (const ar of g.arrows) {
    ctx.save(); ctx.translate(ar.x, ar.y); ctx.rotate(Math.atan2(ar.vy, ar.vx)); if (ar.stuck) ctx.globalAlpha = C(1.5 - ar.stuck, 0, 1);
    ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(4, 0); ctx.stroke();
    ctx.fillStyle = '#8a949e'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(2, -4); ctx.lineTo(2, 4); ctx.fill();
    ctx.fillStyle = '#f2f2f2'; ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-30, -5); ctx.lineTo(-20, 0); ctx.lineTo(-30, 5); ctx.fill();
    ctx.restore();
  }
  // hero
  const h = g.hero;
  if (g.state !== 'dead' || g.endT < 1.2) {
    const blink = h.inv > 0 && Math.floor(h.inv * 14) % 2 === 0 ? .35 : 1;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(h.x, (under(h.x, h.y + 200)?.y ?? h.y), 16, 4, 0, 0, 7); ctx.fill();
    drawHero(ctx, h.x, h.y, h.face, h.st, h.anim, h.swing, blink, !!h.carry);
    if (h.carry) drawProp(ctx, h.carry.kind, h.carry.x, h.carry.y, 0);
  }
  // fx
  for (const f of g.fx) {
    ctx.globalAlpha = C(f.life * 2.5, 0, 1);
    if (f.star) { ctx.fillStyle = '#fffbe0'; starburst(f.x, f.y, 26 * (1.3 - f.life * 2), 10); }
    else if (f.plank) { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.fillStyle = f.col; ctx.fillRect(-7, -2, 14, 4); ctx.restore(); }
    else { ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  for (const p of g.pops) { ctx.globalAlpha = 1 - Math.max(0, p.t - .6) / .4; outline(p.txt, p.x, p.y - p.t * 40, 20, p.col, '#3a1a06', '"Pirata One", Georgia, serif'); }
  ctx.globalAlpha = 1;
  ctx.restore();
  // foreground mist
  const mg = ctx.createLinearGradient(0, H - 40, 0, H); mg.addColorStop(0, 'rgba(245,240,230,0)'); mg.addColorStop(1, 'rgba(245,240,230,.25)');
  ctx.fillStyle = mg; ctx.fillRect(0, H - 40, W, 40);
}
function starburst(x, y, r, n) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const rr2 = i % 2 ? r * .45 : r, a = i * Math.PI / n; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } ctx.closePath(); ctx.fill(); }
function drawShip(x) {
  const y = GY + 6;
  ctx.save();
  // mast and sail
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x + 128, y - 230, 8, 210);
  const sw = Math.sin(tt * 2) * 6;
  ctx.beginPath(); ctx.moveTo(x + 60, y - 216); ctx.quadraticCurveTo(x + 132, y - 226 + sw, x + 206, y - 216); ctx.lineTo(x + 200, y - 90); ctx.quadraticCurveTo(x + 132, y - 70 + sw, x + 66, y - 90); ctx.closePath();
  ctx.save(); ctx.clip();
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#f4ecd8' : '#c8282e'; ctx.fillRect(x + 56 + i * 19, y - 240, 19, 180); }
  ctx.restore();
  ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x + 54, y - 222, 158, 7);
  // hull
  const hg = ctx.createLinearGradient(0, y - 30, 0, y + 30); hg.addColorStop(0, '#9a6a3a'); hg.addColorStop(1, '#4a2e16');
  ctx.fillStyle = hg; ctx.strokeStyle = '#2a1608'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x - 10, y - 50); ctx.quadraticCurveTo(x + 10, y - 20, x + 30, y - 22); ctx.lineTo(x + 240, y - 22); ctx.quadraticCurveTo(x + 262, y - 20, x + 280, y - 60);
  ctx.quadraticCurveTo(x + 290, y + 10, x + 230, y + 26); ctx.lineTo(x + 40, y + 26); ctx.quadraticCurveTo(x - 10, y + 10, x - 10, y - 50); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(30,16,6,.5)'; ctx.lineWidth = 1.5; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + 10, y - 12 + k * 12); ctx.lineTo(x + 262, y - 12 + k * 12); ctx.stroke(); }
  // shields along the side
  for (let i = 0; i < 7; i++) { const sx = x + 50 + i * 30; ctx.fillStyle = i % 2 ? '#2f6fb0' : '#e8c24a'; ctx.beginPath(); ctx.arc(sx, y - 16, 11, 0, 7); ctx.fill(); ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#c9d0d6'; ctx.beginPath(); ctx.arc(sx, y - 16, 3, 0, 7); ctx.fill(); }
  // dragon head prow
  ctx.fillStyle = '#7a4a22'; ctx.strokeStyle = '#2a1608'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x + 272, y - 52); ctx.quadraticCurveTo(x + 296, y - 100, x + 284, y - 120); ctx.quadraticCurveTo(x + 304, y - 126, x + 314, y - 112); ctx.lineTo(x + 300, y - 106); ctx.quadraticCurveTo(x + 300, y - 80, x + 284, y - 50); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(x + 298, y - 116, 2.5, 0, 7); ctx.fill();
  ctx.restore();
  // water in front
  ctx.fillStyle = 'rgba(70,100,125,.55)'; ctx.fillRect(x - 30, GY + 22, 340, 30);
}

// ---------- HUD and UI ----------
function outline(txt, x, y, size, fill, stroke, font = 'Bungee, Impact, sans-serif') {
  ctx.font = `${size}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size / 5); ctx.strokeStyle = stroke; ctx.strokeText(txt, x, y); ctx.fillStyle = fill; ctx.fillText(txt, x, y);
}
function hud() {
  const h = g.hero;
  plank(ctx, 20, 14, 300, 50);
  for (let i = 0; i < h.max; i++) drawHeart(ctx, 52 + i * 52, 42, 22, i < h.hearts);
  plank(ctx, W - 230, 14, 210, 50);
  ctx.save(); ctx.font = '40px "Pirata One", Georgia, serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 6; ctx.strokeStyle = '#2a1a0c'; ctx.strokeText(String(g.score), W - 36, 40); ctx.fillStyle = '#fff8e8'; ctx.fillText(String(g.score), W - 36, 40);
  const s = Math.ceil(g.time), tm = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  ctx.font = '36px "Pirata One", Georgia, serif'; ctx.lineWidth = 6; ctx.strokeStyle = '#3a1450'; ctx.strokeText(tm, W - 62, 90);
  ctx.fillStyle = g.time < 30 && Math.floor(tt * 4) % 2 ? '#ff6a6a' : '#f0c8ff'; ctx.fillText(tm, W - 62, 90);
  ctx.restore();
  // hourglass
  const hx = W - 44, hy = 90;
  ctx.fillStyle = '#6a4a2a'; ctx.fillRect(hx - 10, hy - 18, 20, 4); ctx.fillRect(hx - 10, hy + 14, 20, 4);
  ctx.fillStyle = 'rgba(220,240,255,.8)'; ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(hx - 8, hy - 14); ctx.lineTo(hx + 8, hy - 14); ctx.lineTo(hx + 1.5, hy); ctx.lineTo(hx + 8, hy + 14); ctx.lineTo(hx - 8, hy + 14); ctx.lineTo(hx - 1.5, hy); ctx.closePath(); ctx.fill(); ctx.stroke();
  const k = g.time / 300; ctx.fillStyle = '#e8c070';
  ctx.beginPath(); ctx.moveTo(hx - 8 * k, hy - 14 * k); ctx.lineTo(hx + 8 * k, hy - 14 * k); ctx.lineTo(hx, hy); ctx.fill();
  ctx.beginPath(); ctx.moveTo(hx - 8, hy + 14); ctx.lineTo(hx + 8, hy + 14); ctx.lineTo(hx + 8 * k, hy + 14 - 12 * (1 - k)); ctx.lineTo(hx - 8 * k, hy + 14 - 12 * (1 - k)); ctx.fill();
  // coin counter
  drawCoin(ctx, 44, 92, 'gold', 0, .8);
  ctx.font = 'bold 18px Verdana, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = '#2a1a0c'; ctx.strokeText(`x ${g.coinsGot}`, 62, 93); ctx.fillStyle = '#fff'; ctx.fillText(`x ${g.coinsGot}`, 62, 93);
  iconBtn(W - 50, H - 46, muted ? 'muted' : 'sound', toggleMute);
  iconBtn(W - 92, H - 46, 'pause', () => { paused = true; });
  iconBtn(W - 134, H - 46, 'full', toggleFs);
  watermark();
}
let btns = [], ptr = { x: -1, y: -1 };
const inside = (p, x, y, w, h) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
function button(label, x, y, w, h, fn, opts = {}) {
  const hov = inside(ptr, x - w / 2, y - h / 2, w, h);
  ctx.save(); ctx.translate(x, y); if (hov) ctx.scale(1.05, 1.05);
  ctx.fillStyle = '#5a2306'; rr(ctx, -w / 2, -h / 2 + 5, w, h, 14); ctx.fill();
  const gr = ctx.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, '#ffc04a'); gr.addColorStop(1, '#f07a10');
  ctx.fillStyle = gr; rr(ctx, -w / 2, -h / 2, w, h, 14); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff1c4'; rr(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 10); ctx.stroke();
  outline(label, 0, 2, opts.size || Math.min(32, h * .5), '#fff', '#7a2a06');
  ctx.restore();
  btns.push({ x: x - w / 2, y: y - h / 2, w, h, fn, primary: opts.primary });
}
function iconBtn(x, y, kind, fn) {
  const hov = inside(ptr, x, y, 34, 34);
  ctx.fillStyle = hov ? '#ffb43a' : '#f08a14'; rr(ctx, x, y, 34, 34, 7); ctx.fill();
  ctx.strokeStyle = '#7a3a06'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = '#3a1a04'; ctx.strokeStyle = '#3a1a04';
  if (kind === 'pause') { ctx.fillRect(x + 11, y + 9, 5, 16); ctx.fillRect(x + 19, y + 9, 5, 16); }
  else if (kind === 'full') {
    ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(x + 8, y + 15); ctx.lineTo(x + 8, y + 8); ctx.lineTo(x + 15, y + 8); ctx.moveTo(x + 19, y + 8); ctx.lineTo(x + 26, y + 8); ctx.lineTo(x + 26, y + 15);
    ctx.moveTo(x + 26, y + 19); ctx.lineTo(x + 26, y + 26); ctx.lineTo(x + 19, y + 26); ctx.moveTo(x + 15, y + 26); ctx.lineTo(x + 8, y + 26); ctx.lineTo(x + 8, y + 19); ctx.stroke();
  } else if (kind === 'help') outline('?', x + 17, y + 19, 20, '#3a1a04', '#f08a14');
  else {
    ctx.beginPath(); ctx.moveTo(x + 8, y + 13); ctx.lineTo(x + 13, y + 13); ctx.lineTo(x + 19, y + 8); ctx.lineTo(x + 19, y + 26); ctx.lineTo(x + 13, y + 21); ctx.lineTo(x + 8, y + 21); ctx.fill();
    ctx.lineWidth = 2.5; ctx.beginPath();
    if (kind === 'sound') ctx.arc(x + 20, y + 17, 6, -1, 1); else { ctx.moveTo(x + 22, y + 12); ctx.lineTo(x + 29, y + 22); ctx.moveTo(x + 29, y + 12); ctx.lineTo(x + 22, y + 22); }
    ctx.stroke();
  }
  btns.push({ x, y, w: 34, h: 34, fn });
}
function toggleMute() { muted = !muted; store.set('rr-mute', muted); if (!muted) audio(); }
function toggleFs() { const f = cv.parentElement; try { const r = document.fullscreenElement ? document.exitFullscreen() : f.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch {} }
function watermark() {
  ctx.save(); ctx.font = '22px "Lilita One", "Arial Black", Impact, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#5a1e00'; ctx.strokeText('GIANTCLIP', 14, H - 16);
  const gr = ctx.createLinearGradient(0, H - 38, 0, H - 14); gr.addColorStop(0, '#ffd23a'); gr.addColorStop(1, '#ff7a10'); ctx.fillStyle = gr; ctx.fillText('GIANTCLIP', 14, H - 16);
  ctx.restore();
}
function woodPanel(x, y, w, h) {
  ctx.fillStyle = 'rgba(10,8,6,.55)'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < Math.ceil(h / 40); i++) plank(ctx, x, y + i * 40, w, Math.min(42, h - i * 40));
  ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 4; rr(ctx, x - 2, y - 2, w + 4, h + 4, 8); ctx.stroke();
}
function logo(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  plank(ctx, -230, -46, 460, 92);
  const gr = ctx.createLinearGradient(0, -34, 0, 30); gr.addColorStop(0, '#fff2b0'); gr.addColorStop(.5, '#f2c040'); gr.addColorStop(1, '#b07a10');
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
  outline('RUNE RAIDERS', 0, 2, 76, gr, '#2a1406', '"Pirata One", Georgia, serif'); ctx.restore();
  ctx.restore();
}
function drawTitle() {
  g.cam = L(g.cam, 260 + Math.sin(tt * .2) * 200, .02);
  drawWorld();
  ctx.fillStyle = 'rgba(20,14,30,.35)'; ctx.fillRect(0, 0, W, H);
  logo(CX, 110, 1);
  outline('THE FJORD VILLAGE', CX, 182, 22, '#fff8e8', '#2a1406', '"Pirata One", Georgia, serif');
  ctx.save(); ctx.translate(100, 545); ctx.scale(2.3, 2.3); drawHero(ctx, 0, 0, 1, 'idle', tt, 0); ctx.restore();
  ctx.save(); ctx.translate(705, 545); ctx.scale(2.05, 2.05); drawRaider(ctx, 0, 0, -1, 'idle', tt, 0); ctx.restore();
  button('PLAY ▶', CX, 290, 240, 74, () => newRun(false), { primary: true, size: 38 });
  ctx.fillStyle = 'rgba(20,12,6,.75)'; rr(ctx, CX - 145, 350, 290, 132, 12); ctx.fill(); ctx.strokeStyle = '#c8a46a'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff4dc'; ctx.font = 'bold 15px Verdana, sans-serif';
  ctx.fillText('← →  run      ↑ / W  jump', CX, 378); ctx.fillText('SPACE / X   swing sword', CX, 404); ctx.fillText('↓ / S   pick up & throw', CX, 430);
  ctx.font = '13px Verdana, sans-serif'; ctx.fillStyle = '#e8d4b0'; ctx.fillText('Reach the longship before time runs out!', CX, 458);
  if (save.best) { outline(`BEST: ${save.best}   ${'★'.repeat(save.stars)}`, CX, 510, 20, '#ffe14a', '#2a1406', '"Pirata One", Georgia, serif'); }
  iconBtn(16, 16, muted ? 'muted' : 'sound', toggleMute);
  iconBtn(W - 50, H - 46, 'full', toggleFs);
  watermark();
}
function drawLoading(dt) {
  loadT += dt;
  const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d2350'); gr.addColorStop(1, '#03091a');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = .08; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(CX, 250, 60 + i * 40, 0, 7); ctx.stroke(); } ctx.restore();
  const lg = ctx.createLinearGradient(0, 195, 0, 265); lg.addColorStop(0, '#ffe066'); lg.addColorStop(.5, '#ff9a10'); lg.addColorStop(1, '#e2500a');
  outline('GIANTCLIP', CX, 230, 78, lg, '#5a1e00', '"Lilita One", "Arial Black", Impact, sans-serif');
  outline('PLAY ONLINE GAMES', CX, 290, 18, '#ffffff', '#0d2350');
  const k = Math.min(1, loadT / 2.4), bw = 360, bx = CX - bw / 2, by = 360;
  ctx.fillStyle = '#0a1530'; rr(ctx, bx - 4, by - 4, bw + 8, 30, 15); ctx.fill(); ctx.strokeStyle = '#4b93e0'; ctx.lineWidth = 2; ctx.stroke();
  const pg = ctx.createLinearGradient(0, by, 0, by + 22); pg.addColorStop(0, '#ffd27a'); pg.addColorStop(.5, '#ff8a00'); pg.addColorStop(1, '#e25f00');
  ctx.fillStyle = pg; rr(ctx, bx, by, Math.max(22, bw * k), 22, 11); ctx.fill();
  ctx.font = 'bold 15px Verdana, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#cfe0ff';
  ctx.fillText(k < 1 ? `Loading Rune Raiders... ${Math.floor(k * 100)}%` : 'Ready!', CX, 420);
  if (loadT > 2.7) { scene = 'title'; }
}
function endScreens() {
  if (g.state === 'win' && g.endT > 2.2) {
    const k = g.tally, e = g.endT - 2.2;
    woodPanel(170, 90, 460, 420);
    outline('VICTORY!', CX, 135, 54, '#ffe14a', '#2a1406', '"Pirata One", Georgia, serif');
    const rows = [['Coins & raiders', k.coins], ['Time bonus', k.timeBonus], ['Hearts bonus', k.heartBonus]];
    ctx.font = 'bold 18px Verdana, sans-serif'; ctx.textBaseline = 'middle';
    rows.forEach(([lbl, v], i) => {
      if (e < .3 + i * .4) return;
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff4dc'; ctx.fillText(lbl, 210, 200 + i * 36);
      ctx.textAlign = 'right'; ctx.fillText(String(Math.round(v * Math.min(1, (e - .3 - i * .4) * 3))), 590, 200 + i * 36);
    });
    if (e > 1.6) {
      ctx.strokeStyle = '#e8d4b0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(210, 300); ctx.lineTo(590, 300); ctx.stroke();
      outline(`TOTAL  ${k.total}`, CX, 330, 34, '#ffffff', '#2a1406', '"Pirata One", Georgia, serif');
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i < k.stars ? '#ffd21f' : 'rgba(40,24,10,.6)'; ctx.strokeStyle = '#2a1406'; ctx.lineWidth = 3; ctx.save(); ctx.translate(CX - 60 + i * 60, 385); starburst(0, 0, 24, 5); ctx.stroke(); ctx.restore(); }
      button('PLAY AGAIN', CX - 110, 462, 190, 52, () => newRun(false), { primary: true, size: 20 });
      button('MORE GAMES', CX + 110, 462, 190, 52, () => { location.href = '../../index.html'; }, { size: 20 });
    }
  }
  if (g.state === 'dead' && g.endT > 1.2) {
    woodPanel(220, 150, 360, 300);
    outline(g.timeUp ? "TIME'S UP!" : 'DEFEATED!', CX, 205, 52, '#ff8a6a', '#2a1406', '"Pirata One", Georgia, serif');
    ctx.font = 'bold 16px Verdana, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff4dc'; ctx.fillText(`Score: ${g.score}`, CX, 255);
    if (g.cpOn) button('FROM CHECKPOINT', CX, 320, 270, 52, () => newRun(true), { primary: true, size: 20 });
    button('RESTART LEVEL', CX, g.cpOn ? 392 : 330, 270, 52, () => newRun(false), { primary: !g.cpOn, size: 20 });
  }
  if (paused) {
    woodPanel(250, 180, 300, 240);
    outline('PAUSED', CX, 230, 56, '#ffe14a', '#2a1406', '"Pirata One", Georgia, serif');
    button('RESUME ▶', CX, 310, 220, 56, () => { paused = false; }, { primary: true, size: 24 });
    button('QUIT', CX, 378, 150, 44, () => { paused = false; scene = 'title'; }, { size: 18 });
  }
}

// ---------- loop ----------
let last = 0;
function frame(ts) {
  const now = ts / 1000, dt = Math.min(.033, now - (last || now)); last = now; tt += dt;
  btns = [];
  if (scene === 'loading') drawLoading(dt);
  else if (scene === 'title') drawTitle();
  else { if (!paused) update(dt); drawWorld(); hud(); endScreens(); }
  cv.style.cursor = btns.some(b => inside(ptr, b.x, b.y, b.w, b.h)) ? 'pointer' : 'default';
  requestAnimationFrame(frame);
}

// ---------- input ----------
function toCanvas(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
cv.addEventListener('pointermove', e => { ptr = toCanvas(e); });
cv.addEventListener('pointerleave', () => { ptr = { x: -1, y: -1 }; });
cv.addEventListener('pointerdown', e => {
  audio(); ptr = toCanvas(e);
  for (let i = btns.length - 1; i >= 0; i--) { const b = btns[i]; if (inside(ptr, b.x, b.y, b.w, b.h)) { sfx.click(); b.fn(); return; } }
});
const isJump = c => c === 'ArrowUp' || c === 'KeyW';
const isAtk = c => c === 'KeyX' || c === 'KeyJ' || c === 'Space';
const isPick = c => c === 'ArrowDown' || c === 'KeyS' || c === 'KeyC';
function jumpPress() { if (g && scene === 'play' && !paused) g.hero.buf = .12; }
function jumpRelease() { if (g && g.hero.vy < -320) g.hero.vy = -320; }
addEventListener('keydown', e => {
  const c = e.code;
  if (scene === 'play' && (c.startsWith('Arrow') || c === 'Space')) e.preventDefault();
  if (c === 'ArrowLeft' || c === 'KeyA') keys.l = 1;
  if (c === 'ArrowRight' || c === 'KeyD') keys.r = 1;
  if (e.repeat) return;
  audio();
  if (isJump(c)) jumpPress();
  if (isAtk(c) && scene === 'play' && !paused) attack();
  if (isPick(c)) pickOrThrow();
  if (c === 'Enter') { const b = btns.find(x => x.primary); if (b) { sfx.click(); b.fn(); } }
  if ((c === 'KeyP' || c === 'Escape') && scene === 'play' && g.state === 'play') paused = !paused;
});
addEventListener('keyup', e => {
  const c = e.code;
  if (c === 'ArrowLeft' || c === 'KeyA') keys.l = 0;
  if (c === 'ArrowRight' || c === 'KeyD') keys.r = 0;
  if (isJump(c)) jumpRelease();
});
addEventListener('blur', () => { keys.l = keys.r = 0; if (scene === 'play' && g && g.state === 'play') paused = true; });
document.querySelectorAll('[data-rr]').forEach(b => {
  const a = b.dataset.rr;
  b.addEventListener('pointerdown', e => { e.preventDefault(); audio(); b.classList.add('on'); if (a === 'l') keys.l = 1; else if (a === 'r') keys.r = 1; else if (a === 'j') jumpPress(); else if (a === 'x') attack(); else if (a === 'p') pickOrThrow(); });
  const up = () => { b.classList.remove('on'); if (a === 'l') keys.l = 0; else if (a === 'r') keys.r = 0; else if (a === 'j') jumpRelease(); };
  b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
});

window.RuneRaiders = { drawHero, drawRaider, drawArcher, drawCoin, drawHeart, plank, debug: { pickOrThrow, newRun, get g() { return g; }, keys, attack, jumpPress, jumpRelease, LEVEL } };
const go = () => {
  buildGeometry(); buildScenery();
  g = { cam: 200, hero: { x: 0 }, coins: [], items: [], enemies: [], arrows: [], fx: [], pops: [], barrels: LEVEL.barrels.map(x => ({ x, broken: false })), props: LEVEL.props.map(([kind, x]) => ({ kind, x, y: GY })), flagT: 0, cpOn: false, shipX: 0, state: 'title' };
  requestAnimationFrame(frame);
};
if (document.fonts) Promise.all(['20px Bungee', '20px "Lilita One"', '20px "Pirata One"'].map(f => document.fonts.load(f).catch(() => {}))).then(go); else go();
})();
