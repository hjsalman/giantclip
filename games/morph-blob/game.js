/* Morph Blob - shape-shifting alien puzzle platformer. Uses GCKit. */
(() => {
'use strict';
const K = GCKit('mb', 'Morph Blob', 'mb');
const { ctx, W, H, CX, L, C, R, rr, shade, store } = K;
const T = 40, COLS = 20, ROWS = 15;
let save = Object.assign({ unlocked: 1, best: {} }, store.get('mb-save', {}));
function persist() { store.set('mb-save', save); window.dispatchEvent(new CustomEvent('mb-awards', { detail: save })); }
const sfx = {
  morph() { K.tone(300, .18, .12, 'sine', 900); K.noise(.15, 2000, 3, .06); },
  jump() { K.tone(420, .1, .1, 'sine', 700); },
  boing() { K.tone(180, .25, .14, 'sine', 600); },
  smash() { K.noise(.3, 500, .6, .6, 'lowpass'); K.tone(110, .2, .3, 'square', 50); },
  goo() { K.noise(.25, 300, 1.2, .25, 'lowpass'); },
  float() { K.tone(700, .2, .06, 'sine', 900); },
  die() { K.tone(500, .4, .15, 'sawtooth', 100); },
  win() { K.fanfare(); },
  crystal() { K.tone(1400, .08, .1, 'triangle'); setTimeout(() => K.tone(2100, .12, .1, 'triangle'), 60); },
};
// forms: blob (jumps), rock (heavy, smashes cracked blocks, sinks in water), puddle (slips through grates, low), balloon (floats up)
const FORMS = {
  blob:    { key: '1', name: 'BLOB',    col: '#7ad84a', w: 30, h: 30, speed: 200, jump: 670, grav: 1700 },
  rock:    { key: '2', name: 'ROCK',    col: '#9a8a7a', w: 34, h: 34, speed: 110, jump: 0,   grav: 2600 },
  puddle:  { key: '3', name: 'PUDDLE',  col: '#4ac8f0', w: 34, h: 10, speed: 170, jump: 0,   grav: 1700 },
  balloon: { key: '4', name: 'BALLOON', col: '#ff7ab0', w: 30, h: 34, speed: 120, jump: 0,   grav: -500 },
};
const ORDER = ['blob', 'rock', 'puddle', 'balloon'];
// tiles: # wall, = grate (puddle passes, others stand), X cracked (rock breaks by falling/hitting), ^ spikes, ~ water (rock sinks + dies? no: rock walks along bottom), S start, E exit, * crystal, > fan
const LEVELS = [
  { name: 'Wake Up', hint: 'Press 1-4 to morph. Rock smashes cracked blocks. Puddle slips under gaps.', map: [
    '####################',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#........*.........#',
    '#.......###........#',
    '#..................#',
    '#.S...*.....#####..#',
    '#####XX####.#...#..#',
    '#....*....#.#...#..#',
    '#.........=.#.E.=..#',
    '####################'] },
  { name: 'Updraft', hint: 'Balloon floats up. Change back to fall. Spikes hurt every form!', map: [
    '####################',
    '#..........*....E..#',
    '#.........######...#',
    '#..................#',
    '#..*...............#',
    '#####..............#',
    '#......*...........#',
    '#....#####..####...#',
    '#....#.......#.....#',
    '#....#...*...#.....#',
    '#.S..#..XXX..#.....#',
    '######..###..#^^^^.#',
    '#.......#.#..#######',
    '#...*...=.=........#',
    '####################'] },
  { name: 'Mothership', hint: 'Puddle through the grate, balloon up the shaft, and blob down to the portal!', map: [
    '####################',
    '#..................#',
    '#E...*.....*.......#',
    '####^^^^#######....#',
    '#.........#...#....#',
    '#.........#.*.#....#',
    '#.........#...#....#',
    '#.........##.##....#',
    '#..*..........#....#',
    '#.............#....#',
    '#.S......XX...=....#',
    '#########XX####....#',
    '#.....*.......#....#',
    '#.............=.*..#',
    '####################'] },
];
let lv = null;
function loadLevel(i) {
  const d = LEVELS[i], grid = d.map.map(r => r.split(''));
  let sx = 0, sy = 0; const crystals = [];
  grid.forEach((row, y) => row.forEach((ch, x) => {
    if (ch === 'S') { sx = x; sy = y; row[x] = '.'; }
    if (ch === '*') { crystals.push({ x: x * T + T / 2, y: y * T + T / 2, got: false }); row[x] = '.'; }
  }));
  const ex = grid.findIndex(r => r.includes('E')), exitPos = { x: grid[ex].indexOf('E'), y: ex }; grid[ex][exitPos.x] = '.';
  lv = { i, d, grid, crystals, exit: exitPos, t: 0, fx: [], done: 0, dead: 0, morphs: 0, hintT: 6,
    p: { x: sx * T + 5, y: sy * T + T - 30, vx: 0, vy: 0, form: 'blob', on: false, face: 1, squash: 0, mt: 0, anim: 0 } };
  scene = 'play'; paused = false;
}
const tile = (tx, ty) => (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) ? '#' : lv.grid[ty][tx];
function solidFor(ch, form) { return ch === '#' || ch === 'X' || (ch === '=' && form !== 'puddle'); }
function blocked(x, y, w, h, form) {
  const x0 = Math.floor(x / T), x1 = Math.floor((x + w - .01) / T), y0 = Math.floor(y / T), y1 = Math.floor((y + h - .01) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidFor(tile(tx, ty), form)) return { tx, ty, ch: tile(tx, ty) };
  return null;
}
function touching(x, y, w, h, ch) {
  const x0 = Math.floor(x / T), x1 = Math.floor((x + w - .01) / T), y0 = Math.floor(y / T), y1 = Math.floor((y + h - .01) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (tile(tx, ty) === ch) return true;
  return false;
}
function morph(f) {
  const p = lv.p; if (p.form === f || lv.dead || lv.done) return;
  const a = FORMS[p.form], b = FORMS[f];
  // keep feet position (or head for balloon), check space
  let nx = p.x + a.w / 2 - b.w / 2, ny = p.y + a.h - b.h;
  for (const dx of [0, -6, 6, -12, 12]) if (!blocked(nx + dx, ny, b.w, b.h, f)) { nx += dx; break; }
  if (blocked(nx, ny, b.w, b.h, f)) { K.tone(160, .12, .1, 'square'); poof(p.x + a.w / 2, p.y + a.h / 2, '#ff6a6a', 6); return; }
  p.x = nx; p.y = ny; p.form = f; p.mt = .3; lv.morphs++; sfx.morph();
  poof(p.x + b.w / 2, p.y + b.h / 2, b.col, 14);
}
function poof(x, y, col, n) { for (let i = 0; i < n; i++) lv.fx.push({ x, y, vx: R(-160, 160), vy: R(-160, 100), life: R(.3, .6), r: R(3, 6), col }); }
function smash(tx, ty) {
  lv.grid[ty][tx] = '.'; sfx.smash();
  for (let i = 0; i < 12; i++) lv.fx.push({ x: tx * T + R(4, 36), y: ty * T + R(4, 36), vx: R(-200, 200), vy: R(-300, -50), life: R(.5, .9), r: R(3, 7), col: '#8a6a4a', grav: 1 });
}
function update(dt) {
  lv.t += dt; lv.hintT -= dt;
  for (const f of lv.fx) { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.grav) f.vy += 900 * dt; }
  lv.fx = lv.fx.filter(f => f.life > 0);
  const p = lv.p, F = FORMS[p.form];
  p.mt = Math.max(0, p.mt - dt); p.squash *= Math.pow(.02, dt);
  if (lv.dead) { lv.dead += dt; return; }
  if (lv.done) { lv.done += dt; return; }
  const keys = K.keys, dir = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
  if (dir) p.face = dir;
  p.vx = L(p.vx, dir * F.speed, Math.min(1, dt * (p.form === 'rock' ? 5 : 12)));
  if (p.form === 'blob' && p.jumpBuf > 0 && p.on) { p.vy = -F.jump; p.on = false; p.jumpBuf = 0; sfx.jump(); p.squash = -.3; }
  p.jumpBuf = (p.jumpBuf || 0) - dt;
  const inWater = touching(p.x, p.y, F.w, F.h, '~');
  let grav = F.grav * (inWater && p.form !== 'rock' ? -.3 : 1);
  p.vy = C(p.vy + grav * dt, -420, 900);
  if (p.form === 'balloon') p.vy = Math.max(p.vy, -200);
  // x
  p.x += p.vx * dt;
  let hit = blocked(p.x, p.y, F.w, F.h, p.form);
  if (hit) {
    if (p.form === 'rock' && hit.ch === 'X' && Math.abs(p.vx) > 90) { smash(hit.tx, hit.ty); }
    else { p.x = p.vx > 0 ? hit.tx * T - F.w : (hit.tx + 1) * T; p.vx = 0; }
  }
  // y
  const vy0 = p.vy;
  p.y += p.vy * dt; p.on = false;
  hit = blocked(p.x, p.y, F.w, F.h, p.form);
  if (hit) {
    if (vy0 > 0) {
      if (p.form === 'rock' && hit.ch === 'X' && vy0 > 300) { smash(hit.tx, hit.ty); const n = blocked(p.x, p.y, F.w, F.h, p.form); if (n) { p.y = n.ty * T - F.h; p.vy = 0; p.on = true; } }
      else { p.y = hit.ty * T - F.h; if (vy0 > 300) { p.squash = .35; if (p.form === 'rock') { K.noise(.15, 300, .8, .4, 'lowpass'); } else K.tone(240, .06, .06, 'sine'); } p.vy = 0; p.on = true; }
    } else { p.y = (hit.ty + 1) * T; p.vy = 0; if (p.form === 'balloon') p.on = true; }
  }
  // hazards
  if (touching(p.x + 4, p.y + 4, F.w - 8, F.h - 4, '^')) { die(); return; }
  // crystals
  for (const c of lv.crystals) if (!c.got && Math.abs(c.x - (p.x + F.w / 2)) < 24 && Math.abs(c.y - (p.y + F.h / 2)) < 26) { c.got = true; sfx.crystal(); poof(c.x, c.y, '#b0f8ff', 8); }
  // exit
  const ex = lv.exit.x * T + T / 2, ey = lv.exit.y * T + T / 2;
  if (Math.abs(ex - (p.x + F.w / 2)) < 24 && Math.abs(ey - (p.y + F.h / 2)) < 30) finish();
  p.anim += dt * (1 + Math.abs(p.vx) / 60);
}
function die() { lv.dead = .001; sfx.die(); const F = FORMS[lv.p.form]; poof(lv.p.x + F.w / 2, lv.p.y + F.h / 2, F.col, 26); }
function finish() {
  lv.done = .001; sfx.win();
  const got = lv.crystals.filter(c => c.got).length, all = got === lv.crystals.length;
  const stars = 1 + (all ? 1 : 0) + (lv.t < 60 ? 1 : 0);
  lv.result = { got, total: lv.crystals.length, stars, t: lv.t };
  const prev = save.best[lv.i]; if (!prev || stars > prev.stars || (stars === prev.stars && lv.t < prev.t)) save.best[lv.i] = { stars, t: +lv.t.toFixed(1) };
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, lv.i + 2)); persist();
}

// ---------- art ----------
const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
function buildBg() {
  const c = bg.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1458'); g.addColorStop(1, '#0e0628'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(255,255,255,${R(.2, .8)})`; c.beginPath(); c.arc(R(0, W), R(0, H), R(.5, 1.6), 0, 7); c.fill(); }
  const pl = c.createRadialGradient(660, 120, 10, 680, 140, 90); pl.addColorStop(0, '#ffb07a'); pl.addColorStop(.7, '#c8507a'); pl.addColorStop(1, '#5a1a5a');
  c.fillStyle = pl; c.beginPath(); c.arc(680, 140, 80, 0, 7); c.fill();
  c.strokeStyle = 'rgba(255,200,160,.5)'; c.lineWidth = 6; c.beginPath(); c.ellipse(680, 140, 130, 26, -.3, 0, 7); c.stroke();
  // lab panels
  c.fillStyle = 'rgba(120,200,255,.05)'; for (let x = 0; x < W; x += 80) c.fillRect(x, 0, 2, H);
}
function drawTile(c, ch, x, y) {
  if (ch === '#') {
    const g = c.createLinearGradient(x, y, x, y + T); g.addColorStop(0, '#5a6a8a'); g.addColorStop(1, '#3a4660');
    c.fillStyle = g; c.fillRect(x, y, T, T);
    c.fillStyle = '#7e90b4'; c.fillRect(x, y, T, 4); c.fillStyle = '#28324a'; c.fillRect(x, y + T - 4, T, 4);
    c.fillStyle = '#9aaad0'; for (const [bx, by] of [[x + 6, y + 9], [x + T - 6, y + 9], [x + 6, y + T - 9], [x + T - 6, y + T - 9]]) { c.beginPath(); c.arc(bx, by, 2, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(20,26,40,.6)'; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, T - 1, T - 1);
  } else if (ch === 'X') {
    const g = c.createLinearGradient(x, y, x, y + T); g.addColorStop(0, '#b08a5a'); g.addColorStop(1, '#7a5a32');
    c.fillStyle = g; c.fillRect(x, y, T, T); c.strokeStyle = '#3a2410'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, T - 2, T - 2);
    c.beginPath(); c.moveTo(x + 8, y + 6); c.lineTo(x + 18, y + 18); c.lineTo(x + 12, y + 28); c.lineTo(x + 22, y + 36); c.moveTo(x + 18, y + 18); c.lineTo(x + 32, y + 14); c.moveTo(x + 24, y + 26); c.lineTo(x + 34, y + 32); c.stroke();
  } else if (ch === '=') {
    c.fillStyle = '#3a4660'; c.fillRect(x, y, T, 6); c.fillRect(x, y + T - 6, T, 6);
    c.fillStyle = '#9aaad0'; for (let i = 0; i < 5; i++) c.fillRect(x + 3 + i * 8, y + 6, 3, T - 12);
  } else if (ch === '^') {
    c.fillStyle = '#3a4660'; c.fillRect(x, y + T - 8, T, 8);
    for (let i = 0; i < 4; i++) { const g = c.createLinearGradient(x + i * 10, y, x + i * 10 + 10, y); g.addColorStop(0, '#e8eef4'); g.addColorStop(1, '#7a8698'); c.fillStyle = g; c.beginPath(); c.moveTo(x + i * 10, y + T - 8); c.lineTo(x + i * 10 + 5, y + 10); c.lineTo(x + i * 10 + 10, y + T - 8); c.fill(); c.strokeStyle = '#2a3040'; c.lineWidth = 1; c.stroke(); }
  }
}
function drawAlien(c, form, x, y, w, h, face, t, squash, mt, s = 1) {
  const F = FORMS[form];
  c.save(); c.translate(x + w / 2, y + h); c.scale(s, s);
  const sq = 1 + squash, sx = 1 / Math.sqrt(Math.max(.4, sq));
  c.scale(sx * (1 + mt * .4), sq * (1 - mt * .3));
  const ol = shade(F.col, -100);
  if (form === 'blob') {
    const wob = Math.sin(t * 6) * 1.5;
    const g = c.createRadialGradient(-6, -22, 2, 0, -14, 22); g.addColorStop(0, '#d8ffb0'); g.addColorStop(.6, F.col); g.addColorStop(1, shade(F.col, -60));
    c.fillStyle = g; c.beginPath(); c.moveTo(-16, 0); c.bezierCurveTo(-18 - wob, -24, -10, -32, 0, -32); c.bezierCurveTo(10, -32, 18 + wob, -24, 16, 0); c.closePath(); c.fill();
    c.lineWidth = 2.5; c.strokeStyle = ol; c.stroke();
    // antennae
    for (const sd of [-1, 1]) { c.strokeStyle = ol; c.lineWidth = 2; c.beginPath(); c.moveTo(sd * 5, -30); c.quadraticCurveTo(sd * 10, -42, sd * 9 + Math.sin(t * 4 + sd) * 2, -44); c.stroke(); c.fillStyle = '#ffe14a'; c.beginPath(); c.arc(sd * 9 + Math.sin(t * 4 + sd) * 2, -44, 3.5, 0, 7); c.fill(); c.stroke(); }
    eyes(c, face, -16, 9, 6.5);
    c.strokeStyle = ol; c.lineWidth = 2; c.beginPath(); c.arc(face * 3, -8, 5, .2, Math.PI - .2); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.ellipse(-8, -24, 4, 6, -.5, 0, 7); c.fill();
  } else if (form === 'rock') {
    const g = c.createRadialGradient(-6, -24, 2, 0, -16, 26); g.addColorStop(0, '#d6ccc0'); g.addColorStop(.6, F.col); g.addColorStop(1, '#4e4438');
    c.fillStyle = g; c.beginPath(); c.moveTo(-17, 0); c.lineTo(-18, -16); c.lineTo(-10, -32); c.lineTo(6, -34); c.lineTo(17, -22); c.lineTo(17, 0); c.closePath(); c.fill();
    c.lineWidth = 2.5; c.strokeStyle = '#2e261e'; c.stroke();
    c.strokeStyle = 'rgba(40,30,20,.5)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-8, -6); c.lineTo(-2, -14); c.lineTo(-6, -22); c.stroke();
    c.fillStyle = 'rgba(122,216,74,.85)'; c.beginPath(); c.ellipse(8, -30, 6, 3, .3, 0, 7); c.fill();
    eyes(c, face, -18, 8, 5, true);
    c.strokeStyle = '#2e261e'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(face * 3 - 5, -8); c.lineTo(face * 3 + 5, -8); c.stroke();
  } else if (form === 'puddle') {
    const g = c.createLinearGradient(0, -12, 0, 0); g.addColorStop(0, '#c8f4ff'); g.addColorStop(1, '#1a88c8');
    c.fillStyle = g; c.beginPath(); c.moveTo(-18, 0); c.quadraticCurveTo(-20 + Math.sin(t * 5) * 2, -12, -6, -11); c.quadraticCurveTo(0, -14, 8, -11); c.quadraticCurveTo(20 + Math.sin(t * 5 + 1) * 2, -10, 18, 0); c.closePath(); c.fill();
    c.lineWidth = 2; c.strokeStyle = '#0a4a78'; c.stroke();
    for (const ex of [-4, 4]) { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(face * 2 + ex, -10, 3.5, 4, 0, 0, 7); c.fill(); c.strokeStyle = '#0a4a78'; c.lineWidth = 1.2; c.stroke(); c.fillStyle = '#111'; c.beginPath(); c.arc(face * 3 + ex, -10, 1.8, 0, 7); c.fill(); }
  } else if (form === 'balloon') {
    c.strokeStyle = '#7a3a5a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(Math.sin(t * 3) * 5, -6, 0, -10); c.stroke();
    const g = c.createRadialGradient(-6, -28, 2, 0, -22, 22); g.addColorStop(0, '#ffe0f0'); g.addColorStop(.5, F.col); g.addColorStop(1, '#a8306a');
    c.fillStyle = g; c.beginPath(); c.ellipse(0, -24, 15, 15, 0, 0, 7); c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#6a1a40'; c.stroke();
    c.fillStyle = '#a8306a'; c.beginPath(); c.moveTo(-3, -9); c.lineTo(3, -9); c.lineTo(0, -12); c.fill();
    eyes(c, face, -26, 8, 5.5);
    c.fillStyle = '#6a1a40'; c.beginPath(); c.ellipse(face * 3, -16, 3, 3.5, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(-7, -31, 3.5, 5, -.5, 0, 7); c.fill();
  }
  c.restore();
}
function eyes(c, face, y, gap, r, grumpy) {
  for (const sd of [-1, 1]) {
    const ex = face * 3 + sd * gap / 2 * 1.3;
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, y, r * .8, r, 0, 0, 7); c.fill(); c.strokeStyle = '#1a1a2a'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#1a1a2a'; c.beginPath(); c.arc(ex + face * r * .3, y + 1, r * .45, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + face * r * .3 - 1, y - 1, r * .17, 0, 7); c.fill();
    if (grumpy) { c.strokeStyle = '#2e261e'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(ex - r, y - r - 2 + sd * 2); c.lineTo(ex + r, y - r - 2 - sd * 2); c.stroke(); }
  }
}
function drawPortal(c, x, y, t, open) {
  c.save(); c.translate(x, y);
  for (let i = 0; i < 3; i++) { c.strokeStyle = `rgba(122,240,255,${.7 - i * .2})`; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 0, 16 + i * 5 + Math.sin(t * 4 + i) * 2, 22 + i * 5, 0, 0, 7); c.stroke(); }
  const g = c.createRadialGradient(0, 0, 2, 0, 0, 20); g.addColorStop(0, '#ffffff'); g.addColorStop(.5, '#7af0ff'); g.addColorStop(1, 'rgba(60,120,255,.2)');
  c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, 15, 21, 0, 0, 7); c.fill();
  c.rotate(t * 2); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 9, 0, 4); c.stroke();
  c.restore();
}
function drawCrystal(c, x, y, t, s = 1) {
  c.save(); c.translate(x, y + Math.sin(t * 3 + x) * 3); c.scale(s, s);
  c.shadowColor = '#7af0ff'; c.shadowBlur = 12;
  const g = c.createLinearGradient(-8, -12, 8, 12); g.addColorStop(0, '#ffffff'); g.addColorStop(.5, '#7af0ff'); g.addColorStop(1, '#2a6ad0');
  c.fillStyle = g; c.beginPath(); c.moveTo(0, -13); c.lineTo(8, -2); c.lineTo(4, 12); c.lineTo(-4, 12); c.lineTo(-8, -2); c.closePath(); c.fill();
  c.shadowBlur = 0; c.strokeStyle = '#1a3a7a'; c.lineWidth = 1.5; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.moveTo(0, -13); c.lineTo(0, 12); c.moveTo(-8, -2); c.lineTo(8, -2); c.stroke();
  c.restore();
}

// ---------- render ----------
function drawPlay() {
  ctx.drawImage(bg, 0, 0);
  ctx.save(); ctx.translate(0, 0);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const ch = lv.grid[y][x]; if (ch !== '.') drawTile(ctx, ch, x * T, y * T); }
  drawPortal(ctx, lv.exit.x * T + T / 2, lv.exit.y * T + T / 2, K.t);
  for (const c of lv.crystals) if (!c.got) drawCrystal(ctx, c.x, c.y, K.t);
  const p = lv.p, F = FORMS[p.form];
  if (!lv.dead) drawAlien(ctx, p.form, p.x, p.y, F.w, F.h, p.face, p.anim, p.squash, p.mt);
  if (lv.done) { ctx.globalAlpha = C(1 - lv.done, 0, 1); }
  ctx.globalAlpha = 1;
  for (const f of lv.fx) { ctx.globalAlpha = C(f.life * 3, 0, 1); ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.restore();
  // morph bar
  ctx.fillStyle = 'rgba(10,6,30,.8)'; rr(ctx, CX - 172, 6, 344, 30, 15); ctx.fill(); ctx.strokeStyle = '#7af0ff'; ctx.lineWidth = 2; ctx.stroke();
  ORDER.forEach((f, i) => {
    const x = CX - 128 + i * 86, on = p.form === f;
    if (on) { ctx.fillStyle = FORMS[f].col; rr(ctx, x - 40, 9, 80, 24, 12); ctx.fill(); }
    ctx.font = 'bold 12px Verdana'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = on ? '#10102a' : '#cfe6ff';
    ctx.fillText(`${i + 1} ${FORMS[f].name}`, x, 21);
    K.btns.push({ x: x - 40, y: 9, w: 80, h: 24, fn: () => morph(f) });
  });
  ctx.font = 'bold 13px Verdana'; ctx.textAlign = 'left'; ctx.fillStyle = '#cfe6ff'; ctx.fillText(`Level ${lv.i + 1}: ${lv.d.name}`, 8, 52);
  drawCrystal(ctx, W - 80, 52, 0, .7); ctx.fillText(`${lv.crystals.filter(c => c.got).length}/${lv.crystals.length}`, W - 66, 53);
  if (lv.hintT > 0 && !lv.done && !lv.dead) { ctx.globalAlpha = C(lv.hintT, 0, 1); ctx.fillStyle = 'rgba(10,6,30,.85)'; rr(ctx, 70, 74, 660, 40, 10); ctx.fill(); ctx.strokeStyle = '#7af0ff'; ctx.stroke(); ctx.font = 'bold 14px Verdana'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(lv.d.hint, CX, 95); ctx.globalAlpha = 1; }
  K.hudButtons(() => { if (!lv.done && !lv.dead) paused = true; });
  if (lv.dead > .8) {
    K.panel(230, 170, 340, 240, '#5a2a8a', '#22104a', '#d8b0ff');
    K.outline('SPLAT!', CX, 220, 52, '#ff7ab0', '#22104a');
    K.button('TRY AGAIN ▶', CX, 300, 240, 56, () => loadLevel(lv.i), { primary: true, size: 22 });
    K.button('LEVELS', CX, 364, 150, 42, () => { scene = 'levels'; }, { size: 16 });
  }
  if (lv.done > 1) {
    const r = lv.result;
    K.panel(210, 130, 380, 340, '#5a2a8a', '#22104a', '#d8b0ff');
    K.outline('ESCAPED!', CX, 180, 46, '#7af0ff', '#22104a');
    for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(CX - 60 + i * 60, 248); ctx.fillStyle = i < r.stars ? '#ffd21f' : 'rgba(0,0,0,.4)'; ctx.strokeStyle = '#22104a'; ctx.lineWidth = 3; ctx.beginPath(); for (let k = 0; k < 10; k++) { const rr2 = k % 2 ? 10 : 24, a = k * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
    ctx.font = 'bold 14px Verdana'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8e0ff';
    ctx.fillText(`Crystals ${r.got}/${r.total}   Time ${r.t.toFixed(1)}s`, CX, 300); ctx.font = '12px Verdana'; ctx.fillText('Stars: finish, all crystals, under 60 seconds', CX, 322);
    const last = lv.i === LEVELS.length - 1;
    if (!last) K.button('NEXT LEVEL ▶', CX, 380, 240, 54, () => loadLevel(lv.i + 1), { primary: true, size: 22 });
    else K.outline('BLOB IS FREE!', CX, 380, 26, '#ffe14a', '#22104a');
    K.button('LEVELS', CX, 440, 150, 40, () => { scene = 'levels'; }, { size: 16 });
  }
  if (paused) {
    K.panel(250, 180, 300, 240, '#5a2a8a', '#22104a', '#d8b0ff');
    K.outline('PAUSED', CX, 230, 44, '#fff', '#22104a');
    K.button('RESUME ▶', CX, 305, 220, 54, () => { paused = false; }, { primary: true, size: 22 });
    K.button('LEVELS', CX, 370, 140, 42, () => { paused = false; scene = 'levels'; }, { size: 16 });
  }
}
let scene = 'loading', paused = false;
function logo(y) {
  ctx.save(); ctx.translate(CX, y); ctx.rotate(-.04);
  const g = ctx.createLinearGradient(0, -40, 0, 30); g.addColorStop(0, '#e8ffb0'); g.addColorStop(.5, '#7ad84a'); g.addColorStop(1, '#2a8a1a');
  K.outline('MORPH', 0, -18, 74, g, '#1a0a3a');
  const g2 = ctx.createLinearGradient(0, 20, 0, 70); g2.addColorStop(0, '#ffe0f0'); g2.addColorStop(1, '#ff5aa8');
  K.outline('BLOB', 0, 48, 60, g2, '#1a0a3a');
  ctx.restore();
}
function drawTitle() {
  ctx.drawImage(bg, 0, 0);
  logo(110);
  const b = Math.sin(K.t * 3) * 4;
  ORDER.forEach((f, i) => { const F = FORMS[f]; drawAlien(ctx, f, 110 + i * 190 - F.w / 2, 560 + b * (i % 2 ? 1 : -1) - F.h, F.w, F.h, 1, K.t + i, 0, 0, 2.4); });
  K.button('PLAY ▶', CX, 270, 240, 72, () => { scene = 'levels'; }, { primary: true, size: 38 });
  ctx.fillStyle = 'rgba(10,6,30,.82)'; rr(ctx, CX - 190, 330, 380, 104, 12); ctx.fill(); ctx.strokeStyle = '#7af0ff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = 'bold 14px Verdana'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.fillText('← → move    ↑ jump (blob only)', CX, 356); ctx.fillText('1 2 3 4 or Q / E to change form', CX, 380);
  ctx.font = '12px Verdana'; ctx.fillStyle = '#cfe6ff'; ctx.fillText('Each form can do something the others cannot.', CX, 406);
  ctx.fillText('Reach the glowing portal to escape the lab!', CX, 424);
  K.iconBtn(16, 16, K.muted ? 'muted' : 'sound', K.toggleMute); K.iconBtn(W - 50, H - 46, 'full', K.toggleFs); K.watermark();
}
function drawLevels() {
  ctx.drawImage(bg, 0, 0); logo(90);
  K.outline('CHOOSE A LAB', CX, 200, 26, '#fff', '#1a0a3a');
  LEVELS.forEach((d, i) => {
    const x = 200 + i * 200, y = 330, locked = i + 1 > save.unlocked, best = save.best[i];
    const hov = !locked && Math.hypot(K.ptr.x - x, K.ptr.y - y) < 60;
    ctx.save(); ctx.translate(x, y); if (hov) ctx.scale(1.06, 1.06);
    const g = ctx.createRadialGradient(-16, -18, 6, 0, 0, 64); g.addColorStop(0, locked ? '#8a86a0' : '#d0f8ff'); g.addColorStop(.6, locked ? '#4a4660' : '#5a8ad0'); g.addColorStop(1, locked ? '#28263a' : '#22346a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 58, 0, 7); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = locked ? '#6a6680' : '#7af0ff'; ctx.stroke();
    if (locked) { ctx.fillStyle = '#1a1830'; rr(ctx, -16, -4, 32, 26, 5); ctx.fill(); ctx.strokeStyle = '#1a1830'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, -6, 11, Math.PI, 0); ctx.stroke(); }
    else K.outline(String(i + 1), 0, 4, 50, '#fff', '#1a0a3a');
    ctx.restore();
    ctx.font = 'bold 15px Verdana'; ctx.textAlign = 'center'; ctx.fillStyle = locked ? '#8a86a0' : '#fff'; ctx.fillText(d.name, x, y + 82);
    if (best) ctx.fillText('★'.repeat(best.stars) + '☆'.repeat(3 - best.stars), x, y + 104);
    if (!locked) K.btns.push({ x: x - 58, y: y - 58, w: 116, h: 116, fn: () => loadLevel(i), primary: i + 1 === save.unlocked });
  });
  K.button('◀ BACK', 110, 545, 150, 44, () => { scene = 'title'; }, { size: 18 });
  K.iconBtn(W - 50, H - 46, 'full', K.toggleFs);
}
K.loop(dt => {
  if (scene === 'loading') K.loading(dt, () => { buildBg(); scene = 'title'; });
  else if (scene === 'title') drawTitle();
  else if (scene === 'levels') drawLevels();
  else { if (!paused) update(dt); drawPlay(); }
});
const KEYMAP = { ArrowRight: 'r', KeyD: 'r', ArrowLeft: 'l', KeyA: 'l', ArrowUp: 'u', KeyW: 'u', Space: 'u' };
addEventListener('keydown', e => {
  const k = KEYMAP[e.code];
  if (k && scene === 'play') e.preventDefault();
  if (k) K.keys[k] = 1;
  if (e.repeat) return;
  K.audio();
  if (scene === 'play' && lv && !paused) {
    if (k === 'u') lv.p.jumpBuf = .12;
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
    if (n !== undefined) morph(ORDER[n]);
    if (e.code === 'KeyQ' || e.code === 'KeyE') { const i = ORDER.indexOf(lv.p.form); morph(ORDER[(i + (e.code === 'KeyE' ? 1 : 3)) % 4]); }
    if (e.code === 'KeyR') loadLevel(lv.i);
  }
  if (e.code === 'Enter') K.pressPrimary();
  if ((e.code === 'KeyP' || e.code === 'Escape') && scene === 'play' && !lv.done && !lv.dead) paused = !paused;
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) K.keys[k] = 0; });
addEventListener('blur', () => { K.keys = {}; if (scene === 'play' && lv && !lv.done && !lv.dead) paused = true; });
K.bindPad(k => { if (!lv || scene !== 'play') return; if (k === 'u') lv.p.jumpBuf = .12; if (k === 'm') { const i = ORDER.indexOf(lv.p.form); morph(ORDER[(i + 1) % 4]); } });
window.MorphBlob = { drawAlien, drawCrystal, drawPortal, drawTile, FORMS, debug: { loadLevel, morph, get lv() { return lv; }, K } };
})();
