/* Ember & Tide - two-player co-op ice temple platformer. Canvas 2D, no libraries. */
(() => {
'use strict';
const cv = document.getElementById('et');
const ctx = cv.getContext('2d');
const W = 800, H = 600, T = 32, COLS = 25, ROWS = 18, OY = 12;
const G = 1800, JUMP = 690, MAXV = 210;

// ---------- storage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
let save = Object.assign({ unlocked: 1, best: {} }, store.get('et-save', {}));
let muted = store.get('et-mute', false);
function persist() { store.set('et-save', save); window.dispatchEvent(new CustomEvent('et-awards', { detail: save })); }

const L = (a, b, k) => a + (b - a) * k;
const C = (v, a, b) => v < a ? a : v > b ? b : v;
const R = (a, b) => a + Math.random() * (b - a);
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
function noise(dur, f, q, vol) {
  if (muted || !ac) return;
  if (!nb) { nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ac.createBufferSource(); s.buffer = nb;
  const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
  const g = ac.createGain(), n = ac.currentTime; g.gain.setValueAtTime(vol, n); g.gain.exponentialRampToValueAtTime(.001, n + dur);
  s.connect(fl).connect(g).connect(ac.destination); s.start(n); s.stop(n + dur + .05);
}
const sfx = {
  jump() { tone(380, .12, .1, 'square', 700); },
  gem() { tone(988, .08, .14, 'triangle'); setTimeout(() => tone(1480, .14, .14, 'triangle'), 70); },
  die() { noise(.35, 700, .7, .5); tone(320, .55, .2, 'sawtooth', 60); },
  lever() { noise(.07, 1800, 3, .35); tone(220, .08, .12, 'square'); },
  button() { tone(300, .06, .12, 'square'); },
  door() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .25, .14, 'triangle'), i * 110)); },
  click() { tone(520, .05, .12, 'square'); },
};

// ---------- levels ----------
function blank() {
  const g = [];
  for (let y = 0; y < ROWS; y++) { const r = []; for (let x = 0; x < COLS; x++) r.push(y === 0 || y === ROWS - 1 || x === 0 || x === COLS - 1 ? '#' : '.'); g.push(r); }
  return g;
}
function fill(g, y, x1, x2, ch) { for (let x = x1; x <= x2; x++) g[y][x] = ch; }
const LEVELS = [
  { name: 'Frozen Gate', par: 45, hint: 'Ember walks on lava. Tide walks on water. Nobody touches the green goo!',
    build() {
      const g = blank();
      fill(g, 17, 7, 9, 'L'); fill(g, 17, 13, 15, 'W');
      fill(g, 14, 19, 23, '='); fill(g, 11, 11, 16, '='); fill(g, 8, 18, 22, '=');
      fill(g, 5, 1, 15, '#'); fill(g, 5, 9, 10, 'G');
      return { g, start: { fire: [2, 16], water: [3, 16] }, doors: { fire: [4, 4], water: [7, 4] },
        gems: [['fire', 8, 16], ['water', 14, 16], ['fire', 13, 10], ['water', 20, 7], ['fire', 12, 3], ['water', 14, 3]],
        levers: [], buttons: [], plats: [] };
    } },
  { name: 'Lever Hall', par: 90, hint: 'Pull the lever to open the gate. Stand on a button to call the lift down.',
    build() {
      const g = blank();
      fill(g, 17, 4, 5, 'L'); fill(g, 17, 9, 10, 'W');
      for (let y = 1; y <= 6; y++) g[y][12] = '#';
      fill(g, 5, 16, 23, '#');
      return { g, start: { fire: [1, 16], water: [2, 16] }, doors: { fire: [20, 4], water: [22, 4] },
        gems: [['fire', 5, 16], ['water', 10, 16], ['fire', 14, 12], ['water', 14, 10], ['fire', 19, 2], ['water', 21, 2]],
        levers: [{ id: 'a', x: 7, y: 16 }],
        buttons: [{ id: 'b', x: 19, y: 16 }, { id: 'b', x: 17, y: 4 }],
        plats: [
          { ax: 12, ay: 12, bx: 12, by: 7, w: 1, h: 5, on: 'a', col: '#b06ad8' },
          { ax: 13, ay: 5, bx: 13, by: 16.5, w: 3, h: .5, on: 'b', col: '#e8c13a' },
        ] };
    } },
  { name: 'Slippery Summit', par: 60, hint: 'Ice is slippery! Start your jumps early and land carefully.',
    build() {
      const g = blank();
      fill(g, 17, 1, 23, '='); fill(g, 17, 10, 11, 'G');
      fill(g, 14, 17, 23, '='); fill(g, 14, 22, 23, 'L');
      fill(g, 11, 9, 15, '='); fill(g, 11, 10, 11, 'W');
      fill(g, 8, 17, 23, '='); fill(g, 8, 20, 21, 'G');
      fill(g, 5, 1, 15, '#');
      return { g, start: { fire: [1, 16], water: [2, 16] }, doors: { fire: [3, 4], water: [6, 4] },
        gems: [['fire', 22, 13], ['water', 10, 10], ['fire', 7, 15], ['water', 21, 7], ['fire', 10, 3], ['water', 12, 3]],
        levers: [], buttons: [], plats: [] };
    } },
  { name: 'Twin Gates', par: 80, hint: 'Hold the button so your partner can pass. Then return the favor!',
    build() {
      const g = blank();
      for (let y = 1; y <= 6; y++) g[y][8] = '#';
      fill(g, 17, 11, 12, 'L'); fill(g, 17, 15, 16, 'W');
      fill(g, 14, 20, 23, '#'); fill(g, 11, 13, 17, '='); fill(g, 8, 19, 23, '#'); fill(g, 5, 9, 16, '#');
      return { g, start: { fire: [1, 16], water: [2, 16] }, doors: { fire: [10, 4], water: [13, 4] },
        gems: [['fire', 11, 16], ['water', 15, 16], ['fire', 15, 10], ['water', 21, 7], ['fire', 12, 3], ['water', 15, 3]],
        levers: [], buttons: [{ id: 'c', x: 5, y: 16 }, { id: 'c', x: 18, y: 16 }],
        plats: [{ ax: 8, ay: 12, bx: 8, by: 7, w: 1, h: 5, on: 'c', col: '#e8c13a' }] };
    } },
  { name: 'Goo Bridge', par: 75, hint: 'Pull the lever to raise the bridge out of the goo.',
    build() {
      const g = blank();
      fill(g, 17, 1, 8, '='); fill(g, 17, 9, 15, 'G'); fill(g, 17, 16, 23, '=');
      fill(g, 14, 19, 23, '='); fill(g, 14, 22, 23, 'L');
      fill(g, 11, 12, 17, '='); fill(g, 11, 12, 13, 'W');
      fill(g, 8, 18, 23, '#');
      fill(g, 5, 1, 15, '#'); fill(g, 5, 10, 11, 'G');
      return { g, start: { fire: [1, 16], water: [2, 16] }, doors: { fire: [4, 4], water: [7, 4] },
        gems: [['fire', 22, 13], ['water', 12, 10], ['fire', 12, 15], ['water', 21, 7], ['fire', 13, 3], ['water', 8, 3]],
        levers: [{ id: 'e', x: 5, y: 16 }], buttons: [],
        plats: [{ ax: 9, ay: 17.6, bx: 9, by: 16.5, w: 7, h: .5, on: 'e', col: '#b06ad8' }] };
    } },
  { name: 'Crystal Stairs', par: 70, hint: 'Climb the stairs. Remember who can touch what!',
    build() {
      const g = blank();
      fill(g, 17, 5, 6, 'L'); fill(g, 17, 10, 11, 'W'); fill(g, 17, 15, 16, 'G');
      fill(g, 14, 19, 23, '#');
      fill(g, 11, 13, 17, '='); fill(g, 11, 14, 14, 'L');
      fill(g, 8, 6, 11, '#'); fill(g, 8, 8, 9, 'W');
      fill(g, 5, 13, 23, '#'); fill(g, 5, 16, 17, 'G');
      return { g, start: { fire: [1, 16], water: [2, 16] }, doors: { fire: [20, 4], water: [22, 4] },
        gems: [['fire', 5, 16], ['water', 10, 16], ['fire', 14, 9], ['water', 21, 13], ['fire', 8, 6], ['water', 16, 3]],
        levers: [], buttons: [], plats: [] };
    } },
  { name: 'Sinking Bridge', par: 90, hint: 'The bridge only stays up while someone stands on a button. Take turns!',
    build() {
      const g = blank();
      fill(g, 17, 7, 16, 'G');
      fill(g, 14, 19, 23, '#');
      fill(g, 11, 13, 17, '='); fill(g, 11, 14, 14, 'W');
      fill(g, 8, 6, 11, '#'); fill(g, 8, 8, 8, 'L');
      fill(g, 5, 13, 23, '#');
      return { g, start: { fire: [1, 16], water: [2, 16] }, doors: { fire: [18, 4], water: [21, 4] },
        gems: [['fire', 9, 14], ['water', 13, 14], ['fire', 15, 10], ['water', 7, 7], ['fire', 10, 7], ['water', 22, 13]],
        levers: [], buttons: [{ id: 'g', x: 4, y: 16 }, { id: 'g', x: 19, y: 16 }],
        plats: [{ ax: 7, ay: 17.6, bx: 7, by: 16.5, w: 10, h: .5, on: 'g', col: '#e8c13a' }] };
    } },
  { name: 'Frost Lift', par: 95, hint: 'The lift comes down while a button is pressed. Send each other up!',
    build() {
      const g = blank();
      fill(g, 17, 6, 7, 'L'); fill(g, 17, 11, 12, 'W'); fill(g, 17, 15, 16, 'G');
      fill(g, 14, 19, 23, '#');
      fill(g, 11, 9, 17, '='); fill(g, 11, 9, 12, '#'); fill(g, 11, 10, 10, 'L'); fill(g, 11, 13, 13, 'W');
      fill(g, 8, 1, 7, '#');
      fill(g, 5, 11, 23, '#');
      return { g, start: { fire: [1, 16], water: [2, 16] }, doors: { fire: [20, 4], water: [22, 4] },
        gems: [['fire', 6.5, 16], ['water', 11.5, 16], ['fire', 21, 13], ['water', 16, 10], ['fire', 10, 9.6], ['water', 13, 9.6], ['fire', 4, 7], ['water', 16, 4]],
        levers: [], buttons: [{ id: 'b', x: 2, y: 7 }, { id: 'b', x: 13, y: 4 }],
        plats: [{ ax: 8, ay: 5, bx: 8, by: 8, w: 3, h: .5, on: 'b', col: '#e8c13a' }] };
    } },
  { name: 'Lava Falls', par: 85, hint: 'Pools on every floor. Watch your step and help each other climb.',
    build() {
      const g = blank();
      fill(g, 17, 4, 6, 'W'); fill(g, 17, 9, 11, 'L'); fill(g, 17, 12, 13, 'W');
      fill(g, 17, 15, 16, 'G');
      fill(g, 14, 19, 23, '#'); fill(g, 14, 22, 22, 'L');
      fill(g, 11, 10, 17, '#'); fill(g, 11, 13, 14, 'G');
      fill(g, 8, 1, 8, '#'); fill(g, 8, 4, 4, 'W'); fill(g, 8, 6, 6, 'L');
      fill(g, 5, 10, 23, '#');
      return { g, start: { fire: [1, 16], water: [2, 16] }, doors: { fire: [16, 4], water: [19, 4] },
        gems: [['water', 5, 16], ['fire', 10, 16], ['water', 12.5, 16], ['fire', 22, 13], ['water', 13.5, 9], ['fire', 6, 7], ['water', 4, 7], ['fire', 12, 4], ['water', 22, 4]],
        levers: [], buttons: [], plats: [] };
    } },
  { name: 'Temple Heart', par: 120, hint: 'Raise the bridge, climb the heart of the temple, and hold the gate for each other.',
    build() {
      const g = blank();
      fill(g, 17, 8, 15, 'G'); fill(g, 17, 18, 19, 'L'); fill(g, 17, 21, 22, 'W');
      fill(g, 14, 9, 14, '=');
      fill(g, 11, 1, 7, '#'); fill(g, 11, 3, 3, 'W'); fill(g, 11, 5, 5, 'L');
      fill(g, 8, 9, 15, '#'); fill(g, 8, 12, 12, 'G');
      fill(g, 5, 17, 23, '#');
      return { g, start: { fire: [1, 16], water: [2, 16] }, doors: { fire: [20, 4], water: [21, 4] },
        gems: [['water', 12, 15], ['fire', 18.5, 16], ['water', 21.5, 16], ['fire', 11, 13], ['water', 3, 10], ['fire', 5, 10], ['water', 12, 6.6], ['fire', 14, 7]],
        levers: [{ id: 'e', x: 4, y: 16 }], buttons: [{ id: 'h', x: 10, y: 7 }, { id: 'h', x: 23, y: 4 }],
        plats: [{ ax: 8, ay: 17.6, bx: 8, by: 16.5, w: 8, h: .5, on: 'e', col: '#b06ad8' }, { ax: 19, ay: 1, bx: 19, by: -3.2, w: 1, h: 4, on: 'h', col: '#e8c13a' }] };
    } },
];

// ---------- art: characters ----------
// ---------- characters ----------
function legs(c, walk, moving, air, col, dark) {
  const p = walk * .16, a = moving ? Math.sin(p) * .7 : 0;
  for (const [s, ph] of [[-1, a], [1, -a]]) {
    const hx = s * 4, kx = hx + Math.sin(ph) * 5, ky = -6 + Math.cos(ph) * 3;
    c.lineCap = 'round'; c.strokeStyle = dark; c.lineWidth = 6.5; c.beginPath(); c.moveTo(hx, -10); c.lineTo(kx, air ? -4 : -2); c.stroke();
    c.strokeStyle = col; c.lineWidth = 4; c.stroke();
    c.fillStyle = dark; c.beginPath(); c.ellipse(kx + 1.5, air ? -3 : -1, 4, 2.6, 0, 0, 7); c.fill();
  }
}
let ARM_AIR = false;
function arms(c, walk, moving, col, dark, face, sy = -16, hand) {
  const a = moving ? Math.sin(walk * .16) * .8 : Math.sin(walk * .02) * .1;
  for (const [s, ph] of [[-1, a], [1, -a]]) {
    const sx = s * 7.5, ex = ARM_AIR ? sx + s * 7 : sx + s * 3 + Math.sin(ph) * 5, ey = ARM_AIR ? sy - 6 : sy + 7 + Math.cos(ph) * 2;
    c.lineCap = 'round'; c.strokeStyle = dark; c.lineWidth = 5; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
    c.strokeStyle = col; c.lineWidth = 3; c.stroke();
    c.fillStyle = hand || col; c.strokeStyle = dark; c.lineWidth = 1; c.beginPath(); c.arc(ex, ey, 2.6, 0, 7); c.fill(); c.stroke();
  }
}
function face(c, fx, y, pupil, mouth, blink, big = 1) {
  for (const s2 of [-1, 1]) {
    const ex = fx + s2 * 4.6;
    if (blink) { c.strokeStyle = pupil; c.lineWidth = 2; c.beginPath(); c.moveTo(ex - 3, y); c.lineTo(ex + 3, y); c.stroke(); continue; }
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, y, 3.6 * big, 4.6 * big, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = pupil; c.beginPath(); c.ellipse(ex + (fx > 0 ? 1.1 : fx < 0 ? -1.1 : 0), y + .6, 2.1, 2.7, 0, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + .5, y - 1.3, .9, 0, 7); c.fill();
  }
  c.strokeStyle = mouth; c.lineWidth = 1.6; c.lineCap = 'round'; c.beginPath(); c.arc(fx, y + 5.5, 2.8, .3, Math.PI - .3); c.stroke();
}
// Ember: a fire boy. Glowing ember skin, crown of live flames, soot-red tunic.
function drawEmber(c, x, y, fdir, t, walk, s = 1, st = {}) {
  c.save(); c.translate(x, y); c.scale(s * 1.25, s * 1.25);
  const air = !!st.air;
  if (!st.sink) { c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, 0, 10, 2.4, 0, 0, 7); c.fill(); }
  legs(c, walk, st.moving, air, '#5a1a10', '#1a0604');
  const bob = st.moving ? Math.abs(Math.sin(walk * .16)) * 1.4 : 0;
  c.translate(0, -bob);
  // tunic
  const tg = c.createLinearGradient(-8, 0, 8, 0); tg.addColorStop(0, '#7a160c'); tg.addColorStop(.5, '#c8301a'); tg.addColorStop(1, '#6a1208');
  c.fillStyle = tg; c.strokeStyle = '#1a0604'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-7, -17); c.lineTo(7, -17); c.lineTo(9, -8); c.lineTo(-9, -8); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#2a0e06'; c.fillRect(-9, -11, 18, 2.4); c.save(); c.shadowColor = '#ffb030'; c.shadowBlur = 6; c.fillStyle = '#ffc23a'; c.fillRect(-1.8, -11.6, 3.6, 3.6); c.restore();
  // flame crown (behind head)
  const f = k => Math.sin(t * 14 + k) * 2.2;
  c.save(); c.shadowColor = '#ff6a00'; c.shadowBlur = 18;
  const tongues = [[-9, -34, 1], [-4, -44, 1.15], [1, -48, 1.25], [6, -42, 1.1], [10, -34, .9]];
  [['#e8300a', 1.12], ['#ff7a00', .9], ['#ffc23a', .66]].forEach(([col, k], li) => {
    c.fillStyle = col; c.beginPath(); c.moveTo(-11 * k, -24);
    for (const [tx, ty] of tongues) { const yy = -26 + (ty + 26) * k; c.quadraticCurveTo(tx * k - 4, yy + 8, tx * k - fdir * 2 + f(tx + li), yy + f(ty)); c.quadraticCurveTo(tx * k + 1, yy + 9, tx * k + 3, -28); }
    c.lineTo(11 * k, -24); c.closePath(); c.fill();
  });
  c.restore();
  // head: glowing ember skin
  const hg = c.createRadialGradient(-3, -29, 1, 0, -26, 12); hg.addColorStop(0, '#ffd27a'); hg.addColorStop(.55, '#ff8a2a'); hg.addColorStop(1, '#c8400a');
  c.fillStyle = hg; c.strokeStyle = '#5a1404'; c.lineWidth = 1.8; c.beginPath(); c.ellipse(0, -25.5, 10, 9.5, 0, 0, 7); c.fill(); c.stroke();
  // flame fringe over forehead
  c.fillStyle = '#ffdf6a'; c.beginPath(); c.moveTo(-9, -29); c.quadraticCurveTo(-6, -36, -2 + fdir, -33); c.quadraticCurveTo(1, -38, 4 + fdir, -33); c.quadraticCurveTo(8, -36, 9, -29); c.quadraticCurveTo(0, -31, -9, -29); c.fill();
  c.fillStyle = 'rgba(255,90,40,.5)'; c.beginPath(); c.ellipse(-6 + fdir * 1.5, -22, 2.2, 1.4, 0, 0, 7); c.ellipse(6 + fdir * 1.5, -22, 2.2, 1.4, 0, 0, 7); c.fill();
  face(c, fdir * 2.2, -25, '#3a0a00', '#6a1400', Math.floor(t * 1.3 + x) % 4 === 0 && (t * 1.3 + x) % 1 < .12);
  ARM_AIR = air; arms(c, walk, st.moving, '#c8301a', '#1a0604', fdir, -16, '#ff9a3a'); ARM_AIR = false;
  c.restore();
}
// Tide: a water girl. Clear blue skin, flowing wave hair tied back, sea-teal dress.
function drawTide(c, x, y, fdir, t, walk, s = 1, st = {}) {
  c.save(); c.translate(x, y); c.scale(s * 1.25, s * 1.25);
  const air = !!st.air;
  if (!st.sink) { c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, 0, 10, 2.4, 0, 0, 7); c.fill(); }
  legs(c, walk, st.moving, air, '#3a9ae8', '#0a3366');
  const bob = st.moving ? Math.abs(Math.sin(walk * .16)) * 1.4 : 0;
  c.translate(0, -bob);
  const wob = Math.sin(t * 5) * 1.5;
  // flowing hair behind (wave tail streaming away from facing)
  const hb = c.createLinearGradient(0, -38, 0, -10); hb.addColorStop(0, '#bff0ff'); hb.addColorStop(.5, '#4ab2f6'); hb.addColorStop(1, '#1a5ac8');
  c.save(); c.shadowColor = '#3aa8ff'; c.shadowBlur = 12; c.fillStyle = hb; c.strokeStyle = '#0a3366'; c.lineWidth = 1.5;
  const bk = -fdir;
  c.beginPath(); c.moveTo(-10 * bk * -1, -30); c.moveTo(bk * 2, -36);
  c.bezierCurveTo(bk * 16, -36, bk * (20 + wob), -24, bk * (15 + wob), -14);
  c.quadraticCurveTo(bk * (19 + wob), -12, bk * (22 + wob * 1.5), -8);
  c.quadraticCurveTo(bk * 12, -10, bk * 8, -18); c.lineTo(bk * 2, -22); c.closePath(); c.fill(); c.stroke(); c.restore();
  // dress with wave hem
  const dg = c.createLinearGradient(-9, 0, 9, 0); dg.addColorStop(0, '#0e7a8a'); dg.addColorStop(.5, '#22b8c8'); dg.addColorStop(1, '#0a6070');
  c.fillStyle = dg; c.strokeStyle = '#0a3340'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-6, -17); c.lineTo(6, -17); c.lineTo(10, -7);
  for (let i = 0; i < 4; i++) c.quadraticCurveTo(10 - i * 5 - 2.5, -3.5, 10 - (i + 1) * 5, -7);
  c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(220,250,255,.8)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-8, -10); c.quadraticCurveTo(-5, -12, -2, -10); c.quadraticCurveTo(1, -8, 4, -10); c.quadraticCurveTo(7, -12, 9, -10); c.stroke();
  // head: clear water skin
  const hg = c.createRadialGradient(-3, -29, 1, 0, -26, 12); hg.addColorStop(0, '#e8fbff'); hg.addColorStop(.5, '#8ad4fa'); hg.addColorStop(1, '#2a80d8');
  c.save(); c.shadowColor = '#5ab8ff'; c.shadowBlur = 8; c.fillStyle = hg; c.strokeStyle = '#0a3366'; c.lineWidth = 1.8; c.beginPath(); c.ellipse(0, -25.5, 9.6, 9.4, 0, 0, 7); c.fill(); c.stroke(); c.restore();
  // hair cap with a curling wave on top and side bangs
  c.fillStyle = '#5ac0fa'; c.strokeStyle = '#0a3366'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(-10, -24); c.quadraticCurveTo(-11, -36, 0, -36); c.quadraticCurveTo(11, -36, 10, -24); c.quadraticCurveTo(7, -31, 2 * fdir, -30); c.quadraticCurveTo(-5, -31, -10, -24); c.fill(); c.stroke();
  c.fillStyle = '#d8f6ff'; c.beginPath(); c.moveTo(-2, -35); c.quadraticCurveTo(3 + wob, -45, 10, -41); c.quadraticCurveTo(5, -41, 5, -37); c.quadraticCurveTo(8, -38, 9, -36); c.quadraticCurveTo(5, -33, -2, -35); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.65)'; c.beginPath(); c.ellipse(-5, -32, 2.6, 1.3, -.4, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,140,190,.35)'; c.beginPath(); c.ellipse(-6 + fdir * 1.5, -22, 2, 1.3, 0, 0, 7); c.ellipse(6 + fdir * 1.5, -22, 2, 1.3, 0, 0, 7); c.fill();
  face(c, fdir * 2.2, -25, '#0b2a52', '#0b2a52', Math.floor(t * 1.1 + x) % 5 === 0 && (t * 1.1 + x) % 1 < .12);
  // eyelashes
  c.strokeStyle = '#0b2a52'; c.lineWidth = 1.1; for (const s2 of [-1, 1]) { const ex = fdir * 2.2 + s2 * 4.6; c.beginPath(); c.moveTo(ex + s2 * 2.5, -29); c.lineTo(ex + s2 * 4, -31); c.stroke(); }
  ARM_AIR = air; arms(c, walk, st.moving, '#22b8c8', '#0a3340', fdir, -16, '#8ad4fa'); ARM_AIR = false;
  c.restore();
}
function drawGem(c, x, y, el, t, s = 1) {
  const b = Math.sin(t * 3 + x) * 2, col = el === 'fire' ? '#ff2a2a' : '#2a8cff';
  c.save(); c.translate(x, y + b); c.scale(s, s);
  const gl = c.createRadialGradient(0, 0, 2, 0, 0, 20); gl.addColorStop(0, el === 'fire' ? 'rgba(255,80,60,.5)' : 'rgba(60,160,255,.5)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gl; c.beginPath(); c.arc(0, 0, 20, 0, 7); c.fill();
  // faceted diamond
  const top = [[-11, -3], [-6, -10], [6, -10], [11, -3]];
  c.fillStyle = shade(col, -40); c.beginPath(); c.moveTo(-11, -3); c.lineTo(0, 12); c.lineTo(11, -3); c.closePath(); c.fill();
  c.fillStyle = col; c.beginPath(); c.moveTo(-5, -3); c.lineTo(0, 12); c.lineTo(5, -3); c.closePath(); c.fill();
  c.fillStyle = shade(col, 70); c.beginPath(); c.moveTo(-11, -3); c.lineTo(-6, -10); c.lineTo(6, -10); c.lineTo(11, -3); c.closePath(); c.fill();
  c.fillStyle = shade(col, 120); c.beginPath(); c.moveTo(-6, -10); c.lineTo(-2, -3); c.lineTo(2, -3); c.lineTo(6, -10); c.closePath(); c.fill();
  c.strokeStyle = shade(col, -110); c.lineWidth = 1.4; c.beginPath(); c.moveTo(-11, -3); for (const [px, py] of top) c.lineTo(px, py); c.lineTo(0, 12); c.closePath(); c.stroke();
  const tw = (t * 1.5 + x * .01) % 2.2; if (tw < .25) { c.fillStyle = '#fff'; c.save(); c.translate(-4, -7); c.rotate(tw * 6); c.fillRect(-4, -.7, 8, 1.4); c.fillRect(-.7, -4, 1.4, 8); c.restore(); }
  c.restore();
}
function drawDoor(c, el, x, yb, open, glow, t) {
  const col = el === 'fire' ? '#e0461c' : '#2f7fd8';
  c.save();
  // carved stone frame
  const fg = c.createLinearGradient(x - 28, 0, x + 28, 0); fg.addColorStop(0, '#5a5a4a'); fg.addColorStop(.5, '#8a8a72'); fg.addColorStop(1, '#4a4a3c');
  c.fillStyle = fg; c.beginPath(); c.moveTo(x - 28, yb); c.lineTo(x - 28, yb - 64); c.quadraticCurveTo(x - 28, yb - 84, x, yb - 86); c.quadraticCurveTo(x + 28, yb - 84, x + 28, yb - 64); c.lineTo(x + 28, yb); c.closePath(); c.fill();
  c.strokeStyle = '#2a2a20'; c.lineWidth = 2.5; c.stroke();
  c.strokeStyle = 'rgba(255,255,230,.25)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - 24, yb - 2); c.lineTo(x - 24, yb - 62); c.quadraticCurveTo(x - 24, yb - 79, x, yb - 81); c.stroke();
  // keystone emblem
  c.fillStyle = col; c.beginPath(); c.arc(x, yb - 76, 6, 0, 7); c.fill(); c.strokeStyle = '#1a1a14'; c.lineWidth = 1.5; c.stroke();
  // dark opening
  c.fillStyle = '#0a0806'; c.beginPath(); c.moveTo(x - 19, yb); c.lineTo(x - 19, yb - 56); c.quadraticCurveTo(x, yb - 74, x + 19, yb - 56); c.lineTo(x + 19, yb); c.closePath(); c.fill();
  c.save(); c.clip();
  const oy = -open * 74;
  if (glow) { c.shadowColor = col; c.shadowBlur = 22; }
  const pg = c.createLinearGradient(x - 19, 0, x + 19, 0); pg.addColorStop(0, shade(col, -60)); pg.addColorStop(.5, shade(col, 10)); pg.addColorStop(1, shade(col, -70));
  c.fillStyle = pg; c.fillRect(x - 19, yb - 74 + oy, 38, 74);
  c.shadowBlur = 0;
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(x - 19, yb - k * 15 + oy); c.lineTo(x + 19, yb - k * 15 + oy); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,.88)';
  const cy = yb - 36 + oy;
  if (el === 'fire') { c.beginPath(); c.moveTo(x, cy - 15); c.quadraticCurveTo(x + 12, cy - 2, x + 7, cy + 8); c.quadraticCurveTo(x, cy + 13, x - 7, cy + 8); c.quadraticCurveTo(x - 12, cy - 2, x, cy - 15); c.fill(); c.fillStyle = col; c.beginPath(); c.moveTo(x, cy - 3); c.quadraticCurveTo(x + 5, cy + 3, x + 3, cy + 7); c.quadraticCurveTo(x, cy + 9, x - 3, cy + 7); c.quadraticCurveTo(x - 5, cy + 3, x, cy - 3); c.fill(); }
  else { c.beginPath(); c.moveTo(x, cy - 15); c.quadraticCurveTo(x + 11, cy, x + 9, cy + 5); c.arc(x, cy + 5, 9, 0, Math.PI); c.quadraticCurveTo(x - 11, cy, x, cy - 15); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(x - 2, cy + 4, 3, 0, 7); c.fill(); }
  c.restore();
  if (glow) { c.save(); c.globalAlpha = .55 + Math.sin(t * 8) * .35; c.strokeStyle = col; c.lineWidth = 3; c.shadowColor = col; c.shadowBlur = 16; c.beginPath(); c.moveTo(x - 21, yb); c.lineTo(x - 21, yb - 56); c.quadraticCurveTo(x, yb - 77, x + 21, yb - 56); c.lineTo(x + 21, yb); c.stroke(); c.restore(); }
  c.restore();
}

// ---------- static background ----------
const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
const SOLID = '#=LWG', LIQ = 'LWG';
let lv = null;
function tileAt(tx, ty) { if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#'; return lv.g[ty][tx]; }
function solidAt(tx, ty) { return SOLID.includes(tileAt(tx, ty)); }
function backdrop(c) {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a4a4a'); g.addColorStop(1, '#1e2828');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // big irregular temple bricks
  let s = 9; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (let y = 0; y < H; y += 26) {
    let x = -(r() * 40);
    while (x < W) {
      const w = 40 + r() * 46, tone = 48 + r() * 18;
      const bgc = c.createLinearGradient(0, y, 0, y + 24); bgc.addColorStop(0, `rgb(${tone + 8},${tone + 14},${tone + 10})`); bgc.addColorStop(1, `rgb(${tone - 6},${tone},${tone - 4})`);
      c.fillStyle = bgc; c.fillRect(x + 1, y + 1, w - 2, 24);
      c.fillStyle = 'rgba(255,255,230,.06)'; c.fillRect(x + 1, y + 1, w - 2, 2);
      c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x + 1, y + 23, w - 2, 2);
      if (r() < .05) { c.strokeStyle = 'rgba(120,180,170,.25)'; c.lineWidth = 1.5; const cx = x + w / 2, cy = y + 12; c.beginPath(); c.arc(cx, cy, 7, 0, 7); c.moveTo(cx - 10, cy); c.lineTo(cx + 10, cy); c.moveTo(cx, cy - 10); c.lineTo(cx, cy + 10); c.stroke(); }
      if (r() < .07) { c.fillStyle = 'rgba(80,120,60,.3)'; c.beginPath(); c.ellipse(x + r() * w, y + 22, 10 + r() * 10, 4, 0, 0, 7); c.fill(); }
      x += w;
    }
  }
  // frosty light shafts and vignette
  for (const sx of [160, 520]) { const lg = c.createLinearGradient(sx, 0, sx + 120, H); lg.addColorStop(0, 'rgba(200,240,255,.12)'); lg.addColorStop(1, 'rgba(200,240,255,0)'); c.fillStyle = lg; c.beginPath(); c.moveTo(sx, 0); c.lineTo(sx + 70, 0); c.lineTo(sx + 260, H); c.lineTo(sx + 120, H); c.fill(); }
  const v = c.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 560); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
function drawStone(c, px, py, cap, x, y) {
  const n = ((x * 73856093) ^ (y * 19349663)) >>> 0, tone = 108 + (n % 18);
  const g = c.createLinearGradient(px, py, px, py + T); g.addColorStop(0, `rgb(${tone + 10},${tone + 14},${tone + 4})`); g.addColorStop(1, `rgb(${tone - 30},${tone - 26},${tone - 34})`);
  c.fillStyle = g; c.fillRect(px, py, T, T);
  c.fillStyle = 'rgba(255,255,230,.22)'; c.fillRect(px, py, T, 3); c.fillRect(px, py, 2, T);
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(px, py + T - 3, T, 3); c.fillRect(px + T - 2, py, 2, T);
  c.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 6; i++) { const k = (n >> (i * 4)) & 15; c.fillRect(px + 3 + (k * 7) % 25, py + 4 + (k * 5) % 22, 2, 2); }
  if (n % 5 === 0) { c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px + 8, py + 6); c.lineTo(px + 14, py + 14); c.lineTo(px + 11, py + 24); c.stroke(); }
  if (cap) {
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(px, py + 7, T, 2);
    const sg = c.createLinearGradient(0, py - 4, 0, py + 7); sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#c8e6f4');
    c.fillStyle = sg; c.beginPath(); c.moveTo(px - 1, py + 6); c.quadraticCurveTo(px + 8, py - 5, px + 16, py); c.quadraticCurveTo(px + 24, py - 5, px + T + 1, py + 6); c.lineTo(px + T + 1, py + 7); c.lineTo(px - 1, py + 7); c.closePath(); c.fill();
  }
}
function drawIce(c, px, py, x, y) {
  const g = c.createLinearGradient(px, py, px + T, py + T); g.addColorStop(0, '#e6faff'); g.addColorStop(.4, '#9adcf8'); g.addColorStop(1, '#3a8ac8');
  c.fillStyle = g; c.fillRect(px, py, T, T);
  c.strokeStyle = 'rgba(20,70,120,.6)'; c.lineWidth = 1.5; c.strokeRect(px + .75, py + .75, T - 1.5, T - 1.5);
  c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(px + 5, py + 26); c.lineTo(px + 17, py + 7); c.stroke();
  c.lineWidth = 1.2; c.beginPath(); c.moveTo(px + 13, py + 27); c.lineTo(px + 25, py + 12); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(px + 20, py + 4); c.lineTo(px + 28, py + 9); c.lineTo(px + 24, py + 18); c.stroke();
  c.fillStyle = '#fff'; c.fillRect(px, py, T, 3);
}
function buildBg() {
  const c = bg.getContext('2d');
  backdrop(c);
  c.save(); c.translate(0, OY);
  // shadows cast by platforms onto the wall
  c.fillStyle = 'rgba(0,0,0,.28)';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (SOLID.includes(lv.g[y][x]) && y < ROWS - 1 && !SOLID.includes(lv.g[y + 1][x])) c.fillRect(x * T + 5, (y + 1) * T, T, 8);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = lv.g[y][x], px = x * T, py = y * T;
    const cap = y > 0 && !solidAt(x, y - 1);
    if (ch === '#') drawStone(c, px, py, cap, x, y);
    else if (ch === '=') drawIce(c, px, py, x, y);
    else if (LIQ.includes(ch)) drawStone(c, px, py, false, x, y);
  }
  // icicles under ledges
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
    if (solidAt(x, y) && !solidAt(x, y + 1) && (x * 31 + y * 17) % 3 === 0) {
      const px = x * T + 8 + (x * 7) % 14, py = (y + 1) * T, len = 10 + (x % 3) * 5;
      const ig = c.createLinearGradient(0, py, 0, py + len); ig.addColorStop(0, 'rgba(240,252,255,.95)'); ig.addColorStop(1, 'rgba(160,220,250,.5)');
      c.fillStyle = ig; c.beginPath(); c.moveTo(px - 4, py); c.lineTo(px, py + len); c.lineTo(px + 4, py); c.fill();
    }
  }
  c.restore();
}

// ---------- level runtime ----------
function mkChar(el, [cx, cy]) { return { el, x: cx * T + 5, y: cy * T + T - 30, w: 22, h: 30, vx: 0, vy: 0, ground: null, plat: null, face: el === 'fire' ? 1 : -1, walk: 0, atDoor: false }; }
function loadLevel(i) {
  const d = LEVELS[i].build();
  lv = {
    i, def: LEVELS[i], g: d.g, doors: d.doors, t: 0, done: 0, complete: null, dead: null, deadT: 0, hintT: 5,
    gems: d.gems.map(([el, x, y]) => ({ el, x: x * T + T / 2, y: y * T + T / 2, got: false })),
    levers: d.levers.map(l => ({ ...l, on: false, ang: -.6 })),
    buttons: d.buttons.map(b => ({ ...b, down: false, press: 0 })),
    plats: d.plats.map(p => ({ ...p, px: p.ax * T, py: p.ay * T, pw: p.w * T, ph: p.h * T })),
    chars: { fire: mkChar('fire', d.start.fire), water: mkChar('water', d.start.water) },
    fx: [],
  };
  buildBg();
  scene = 'play'; paused = false;
}

// ---------- physics ----------
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const pr = p => ({ x: p.px, y: p.py, w: p.pw, h: p.ph });
function colBlocked(tx, y, h) { const y0 = Math.floor(y / T), y1 = Math.floor((y + h - .01) / T); for (let ty = y0; ty <= y1; ty++) if (solidAt(tx, ty)) return true; return false; }
function rowBlocked(ty, x, w) { const x0 = Math.floor(x / T), x1 = Math.floor((x + w - .01) / T); for (let tx = x0; tx <= x1; tx++) if (solidAt(tx, ty)) return true; return false; }
function rowHas(ty, x, w, chs) { const x0 = Math.floor(x / T), x1 = Math.floor((x + w - .01) / T); for (let tx = x0; tx <= x1; tx++) if (chs.includes(tileAt(tx, ty))) return true; return false; }

function control(c, k, dt) {
  const dir = (k.r ? 1 : 0) - (k.l ? 1 : 0), ice = c.ground === 'ice';
  const acc = c.ground ? (ice ? 1000 : 1700) : 1200, fric = c.ground ? (ice ? 900 : 2000) : 280;
  if (dir) { c.vx += dir * acc * dt; c.face = dir; }
  else { const d = Math.min(Math.abs(c.vx), fric * dt); c.vx -= Math.sign(c.vx) * d; }
  c.vx = C(c.vx, -MAXV, MAXV);
  if (k.j && c.ground) { c.vy = -JUMP; c.ground = null; c.plat = null; sfx.jump(); }
  c.walk += Math.abs(c.vx) * dt;
}
function moveChar(c, dt) {
  c.x += c.vx * dt;
  if (c.vx > 0) { const tx = Math.floor((c.x + c.w - .01) / T); if (colBlocked(tx, c.y, c.h)) { c.x = tx * T - c.w; c.vx = 0; } }
  else if (c.vx < 0) { const tx = Math.floor(c.x / T); if (colBlocked(tx, c.y, c.h)) { c.x = (tx + 1) * T; c.vx = 0; } }
  for (const p of lv.plats) {
    const r = pr(p);
    if (!overlap(c, r)) continue;
    if (c.vy >= 0 && c.y + c.h - r.y <= 18 && !rowBlocked(Math.floor((r.y - c.h) / T), c.x, c.w)) { c.y = r.y - c.h; c.vy = 0; c.plat = p; continue; }
    if (c.x + c.w / 2 < r.x + r.w / 2) c.x = r.x - c.w; else c.x = r.x + r.w; c.vx = 0;
  }
  c.vy = Math.min(c.vy + G * dt, 900);
  c.y += c.vy * dt; c.ground = null; c.plat = null;
  if (c.vy > 0) {
    const ty = Math.floor((c.y + c.h - .01) / T);
    if (rowBlocked(ty, c.x, c.w)) { c.y = ty * T - c.h; c.vy = 0; c.ground = rowHas(ty, c.x, c.w, '=') ? 'ice' : 'stone'; }
  } else if (c.vy < 0) {
    const ty = Math.floor(c.y / T);
    if (rowBlocked(ty, c.x, c.w)) { c.y = (ty + 1) * T; c.vy = 0; }
  }
  for (const p of lv.plats) {
    const r = pr(p);
    if (!overlap(c, r)) continue;
    if (c.vy >= 0 && c.y + c.h - r.y <= 20) { c.y = r.y - c.h; c.vy = 0; c.ground = 'stone'; c.plat = p; }
    else if (c.vy < 0 && r.y + r.h - c.y <= 20) { c.y = r.y + r.h; c.vy = 0; }
    else { if (c.x + c.w / 2 < r.x + r.w / 2) c.x = r.x - c.w; else c.x = r.x + r.w; }
  }
}
function triggered(id) {
  const lever = lv.levers.find(l => l.id === id); if (lever) return lever.on;
  return lv.buttons.some(b => b.id === id && b.down);
}
function updatePlats(dt) {
  for (const p of lv.plats) {
    const on = triggered(p.on), tx = (on ? p.bx : p.ax) * T, ty = (on ? p.by : p.ay) * T;
    const dx = tx - p.px, dy = ty - p.py, d = Math.hypot(dx, dy);
    if (d < .5) { p.px = tx; p.py = ty; continue; }
    const step = Math.min(d, 120 * dt), mx = dx / d * step, my = dy / d * step;
    const next = { x: p.px + mx, y: p.py + my, w: p.pw, h: p.ph };
    const riders = Object.values(lv.chars).filter(c => c.plat === p);
    const blocked = Object.values(lv.chars).some(c => c.plat !== p && overlap(c, next));
    if (blocked) continue;
    p.px += mx; p.py += my;
    for (const c of riders) { c.x += mx; c.y += my; }
  }
}
function die(c, why) {
  if (lv.dead) return;
  lv.dead = { el: c.el, why }; lv.deadT = 0; sfx.die();
  const col = why === 'G' ? '#7be04a' : why === 'L' ? '#ff7a1a' : '#4aa8ff';
  for (let i = 0; i < 30; i++) lv.fx.push({ x: c.x + c.w / 2, y: c.y + c.h, vx: R(-180, 180), vy: R(-420, -120), life: R(.5, 1), col, r: R(2, 5) });
  for (let i = 0; i < 10; i++) lv.fx.push({ x: c.x + c.w / 2 + R(-8, 8), y: c.y + c.h - R(0, 20), vx: R(-20, 20), vy: R(-80, -40), life: R(1, 1.6), col: 'rgba(220,220,220,.6)', r: R(6, 10), smoke: true });
  c.gone = true;
}
function update(dt) {
  lv.t += dt; lv.hintT -= dt;
  for (const f of lv.fx) { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; if (!f.smoke) f.vy += 900 * dt; else f.r += 8 * dt; }
  lv.fx = lv.fx.filter(f => f.life > 0);
  if (lv.dead) { lv.deadT += dt; return; }
  const chars = Object.values(lv.chars);
  // triggers
  for (const b of lv.buttons) {
    const r = { x: b.x * T + 4, y: b.y * T + 20, w: 24, h: 12 };
    const was = b.down; b.down = chars.some(c => overlap(c, r));
    if (b.down && !was) sfx.button();
    b.press = L(b.press, b.down ? 1 : 0, Math.min(1, dt * 14));
  }
  for (const l of lv.levers) {
    const r = { x: l.x * T + 2, y: l.y * T + 6, w: 28, h: 26 };
    for (const c of chars) if (overlap(c, r)) {
      if (c.vx > 40 && !l.on) { l.on = true; sfx.lever(); }
      else if (c.vx < -40 && l.on) { l.on = false; sfx.lever(); }
    }
    l.ang = L(l.ang, l.on ? .6 : -.6, Math.min(1, dt * 12));
  }
  updatePlats(dt);
  for (const c of chars) {
    const wasGround = !!c.ground, preVy = c.vy;
    control(c, keys[c.el], dt);
    if (wasGround && !c.ground && c.vy < 0) c.stretch = 1;
    moveChar(c, dt);
    // squash on landing, with a puff of dust; little embers / droplets while running
    if (!wasGround && c.ground && preVy > 300) {
      c.squash = Math.min(1, preVy / 700);
      for (let i = 0; i < 6; i++) lv.fx.push({ x: c.x + c.w / 2 + R(-10, 10), y: c.y + c.h, vx: R(-70, 70), vy: R(-60, -10), life: R(.25, .45), col: 'rgba(220,225,230,.7)', r: R(2, 4) });
    }
    c.squash = Math.max(0, (c.squash || 0) - dt * 5); c.stretch = Math.max(0, (c.stretch || 0) - dt * 4);
    if (c.ground && Math.abs(c.vx) > 60 && Math.random() < dt * 14) lv.fx.push(c.el === 'fire'
      ? { x: c.x + c.w / 2 + R(-6, 6), y: c.y + 4, vx: R(-20, 20) - c.vx * .1, vy: R(-90, -40), life: R(.3, .5), col: Math.random() < .5 ? '#ffd23a' : '#ff6a1a', r: R(1.2, 2.4), smoke: false }
      : { x: c.x + c.w / 2 + R(-6, 6), y: c.y + 10, vx: R(-20, 20) - c.vx * .1, vy: R(-20, 10), life: R(.3, .5), col: 'rgba(160,220,255,.9)', r: R(1.2, 2.2) });
    // hazards under feet
    if (c.ground) {
      const ty = Math.floor((c.y + c.h + 1) / T);
      for (const px of [c.x + c.w / 2]) {
        const ch = tileAt(Math.floor(px / T), ty);
        if (ch === 'G' || (ch === 'L' && c.el === 'water') || (ch === 'W' && c.el === 'fire')) { die(c, ch); return; }
      }
    }
    for (const g of lv.gems) if (!g.got && g.el === c.el && Math.abs(c.x + c.w / 2 - g.x) < 20 && Math.abs(c.y + c.h / 2 - g.y) < 24) {
      g.got = true; sfx.gem();
      for (let i = 0; i < 10; i++) lv.fx.push({ x: g.x, y: g.y, vx: R(-120, 120), vy: R(-160, 40), life: R(.3, .6), col: c.el === 'fire' ? '#ffb0a0' : '#b0e0ff', r: 2 });
    }
    const [dx, dy] = lv.doors[c.el];
    c.atDoor = Math.abs(c.x + c.w / 2 - (dx * T + T / 2)) < 16 && Math.abs(c.y + c.h - (dy + 1) * T) < 6;
  }
  if (lv.chars.fire.atDoor && lv.chars.water.atDoor) {
    if (lv.done === 0) sfx.door();
    lv.done += dt;
    if (lv.done > 1) finishLevel();
  } else lv.done = Math.max(0, lv.done - dt * 2);
}
function finishLevel() {
  const got = lv.gems.filter(g => g.got).length, all = got === lv.gems.length, under = lv.t <= lv.def.par;
  const rank = all && under ? 'A' : all || under ? 'B' : 'C';
  lv.complete = { time: lv.t, got, total: lv.gems.length, rank };
  const prev = save.best[lv.i];
  if (!prev || rank < prev.rank || (rank === prev.rank && lv.t < prev.time)) save.best[lv.i] = { rank, time: lv.t, got };
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, lv.i + 2));
  persist();
}

// ---------- play render ----------
function liquid(c, px, py, ch, t, front) {
  const cols = { L: ['#ff4a0a', '#ffd23a', '#7a1a00'], W: ['#1a7ae0', '#bfeaff', '#0a2a6a'], G: ['#3aa82a', '#d0ff7a', '#0e4a0a'] }[ch];
  // sunken basin cut into the stone
  if (!front) { c.fillStyle = '#1a1a14'; c.fillRect(px, py, T, 12); }
  const g = c.createLinearGradient(0, py + 2, 0, py + 14); g.addColorStop(0, cols[1]); g.addColorStop(.3, cols[0]); g.addColorStop(1, cols[2]);
  c.fillStyle = g; c.beginPath(); c.moveTo(px, py + 13);
  for (let i = 0; i <= 8; i++) c.lineTo(px + i * 4, py + 4 + Math.sin(t * 4 + (px + i * 4) * .22) * 1.8);
  c.lineTo(px + T, py + 13); c.closePath(); c.fill();
  if (front) return;
  c.save(); c.globalAlpha = .35 + Math.sin(t * 3 + px) * .1; const gl = c.createLinearGradient(0, py - 22, 0, py + 4); gl.addColorStop(0, 'rgba(0,0,0,0)'); gl.addColorStop(1, cols[0]); c.fillStyle = gl; c.fillRect(px, py - 22, T, 26); c.restore();
  c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(px + ((t * 30 + px) % 28), py + 4, 4, 1.5);
  if (ch === 'G' && Math.random() < .03) lv.fx.push({ x: px + R(4, 28), y: py + OY + 4, vx: 0, vy: R(-40, -20), life: .6, col: 'rgba(200,255,120,.8)', r: R(1.5, 3), world: true });
  if (ch === 'L' && Math.random() < .03) lv.fx.push({ x: px + R(4, 28), y: py + OY + 2, vx: R(-20, 20), vy: R(-160, -60), life: .5, col: '#ffd23a', r: 2, world: true });
  if (ch === 'W' && Math.random() < .015) lv.fx.push({ x: px + R(4, 28), y: py + OY + 4, vx: 0, vy: R(-30, -10), life: .5, col: 'rgba(220,245,255,.8)', r: 1.5, world: true });
}
function drawPlay(dt) {
  ctx.drawImage(bg, 0, 0);
  ctx.save(); ctx.translate(0, OY);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const ch = lv.g[y][x]; if (LIQ.includes(ch)) liquid(ctx, x * T, y * T, ch, tt); }
  for (const el of ['fire', 'water']) { const [dx, dy] = lv.doors[el]; drawDoor(ctx, el, dx * T + T / 2, (dy + 1) * T, C(lv.done, 0, 1), lv.chars[el].atDoor, tt); }
  for (const b of lv.buttons) {
    const px = b.x * T, py = b.y * T + T, col = '#e8c13a';
    ctx.fillStyle = '#34495e'; rr(ctx, px + 2, py - 6, 28, 6, 2); ctx.fill();
    const hgt = 8 - b.press * 5; ctx.fillStyle = col; rr(ctx, px + 7, py - 6 - hgt, 18, hgt + 2, 4); ctx.fill();
    ctx.strokeStyle = shade(col, -90); ctx.lineWidth = 1.5; ctx.stroke();
  }
  for (const l of lv.levers) {
    const cx = l.x * T + T / 2, cy = l.y * T + T, col = '#b06ad8';
    ctx.save(); ctx.translate(cx, cy - 6); ctx.rotate(l.ang);
    ctx.strokeStyle = '#1b2430'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -28); ctx.stroke(); ctx.strokeStyle = '#c9d6e2'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -29, 7, 0, 7); ctx.fill(); ctx.strokeStyle = shade(col, -90); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#7f98ad'; ctx.beginPath(); ctx.arc(cx, cy, 14, Math.PI, 0); ctx.fill(); ctx.strokeStyle = '#2a3e52'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = l.on ? '#7dff7a' : '#ff6a5a'; ctx.beginPath(); ctx.arc(cx, cy - 4, 2.5, 0, 7); ctx.fill();
  }
  for (const p of lv.plats) {
    const col = p.col;
    const g = ctx.createLinearGradient(0, p.py, 0, p.py + p.ph); g.addColorStop(0, '#a8a890'); g.addColorStop(1, '#5a5a48');
    ctx.fillStyle = g; rr(ctx, p.px, p.py, p.pw, p.ph, 3); ctx.fill();
    ctx.strokeStyle = '#2a2a20'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.fillStyle = col; if (p.ph > T) ctx.fillRect(p.px + p.pw / 2 - 3, p.py + 4, 6, p.ph - 8); else ctx.fillRect(p.px + 4, p.py + p.ph / 2 - 2, p.pw - 8, 4); ctx.restore();
    if (p.ph > T) { ctx.strokeStyle = 'rgba(0,0,0,.25)'; for (let y = p.py + 10; y < p.py + p.ph; y += 14) { ctx.beginPath(); ctx.moveTo(p.px + 4, y); ctx.lineTo(p.px + p.pw - 4, y); ctx.stroke(); } }
    else { ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(p.px + 3, p.py + 2, p.pw - 6, 2); }
  }
  for (const g of lv.gems) if (!g.got) drawGem(ctx, g.x, g.y, g.el, tt);
  for (const c of Object.values(lv.chars)) {
    if (c.gone) continue;
    const draw = c.el === 'fire' ? drawEmber : drawTide;
    const under = c.ground ? tileAt(Math.floor((c.x + c.w / 2) / T), Math.floor((c.y + c.h + 1) / T)) : '';
    c.sink = L(c.sink || 0, LIQ.includes(under) ? 9 : 0, Math.min(1, dt * 12));
    const sq = (c.squash || 0) * .28 - (c.stretch || 0) * .18 - (!c.ground && c.vy < -100 ? .06 : 0);
    ctx.save(); ctx.translate(c.x + c.w / 2, c.y + c.h + c.sink); ctx.scale(1 + sq, 1 - sq);
    draw(ctx, 0, 0, c.face, tt, c.walk, 1, { moving: !!c.ground && Math.abs(c.vx) > 25, air: !c.ground, sink: c.sink > 1 });
    ctx.restore();
    if (c.sink > 1 && Math.random() < .2 && Math.abs(c.vx) > 25) lv.fx.push({ x: c.x + c.w / 2 + R(-8, 8), y: c.y + c.h + OY + 2, vx: R(-60, 60), vy: R(-140, -60), life: .35, col: c.el === 'fire' ? '#ffb030' : '#bfeaff', r: R(1.5, 2.5), world: true });
  }
  // liquid surface drawn again in front, so feet look submerged
  for (const c of Object.values(lv.chars)) {
    if (c.gone || (c.sink || 0) < 1) continue;
    const ty = Math.floor((c.y + c.h + 1) / T);
    for (let tx = Math.floor((c.x - 8) / T); tx <= Math.floor((c.x + c.w + 8) / T); tx++) { const ch = tileAt(tx, ty); if (LIQ.includes(ch)) { ctx.save(); ctx.globalAlpha = .88; ctx.beginPath(); ctx.rect(tx * T, ty * T - 4, T, 20); ctx.clip(); liquid(ctx, tx * T, ty * T, ch, tt, true); ctx.restore(); } }
  }
  ctx.restore();
  for (const f of lv.fx) {
    ctx.globalAlpha = C(f.life * 2, 0, 1); ctx.fillStyle = f.col;
    ctx.beginPath(); ctx.arc(f.x, f.y + (f.world ? 0 : OY), f.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  hud();
  if (lv.hintT > 0 && !lv.dead && !lv.complete) {
    ctx.save(); ctx.globalAlpha = C(lv.hintT, 0, 1);
    plaque(110, 60, 580, 52);
    ctx.font = '21px "Pirata One", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f6f0d0';
    ctx.fillText(lv.def.hint, CX, 90); ctx.restore();
  }
  if (lv.dead && lv.deadT > 1) deadOverlay();
  if (lv.complete) completeOverlay();
  if (paused) pauseOverlay();
}
function plaque(x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#9a9a80'); g.addColorStop(1, '#5a5a48');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x + 10, y); ctx.lineTo(x + w - 10, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w - 10, y + h); ctx.lineTo(x + 10, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#2a2a20'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,230,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 12, y + 3); ctx.lineTo(x + w - 12, y + 3); ctx.stroke();
}
function hud() {
  plaque(CX - 80, 0, 160, 40);
  const s = Math.floor(lv.t), mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  outline(`${mm}:${ss}`, CX, 21, 26, '#f6f0d0', '#2a2a20', '"Pirata One", Georgia, serif');
  for (const [el, x] of [['fire', CX - 140], ['water', CX + 140]]) {
    plaque(x - 46, 6, 92, 28);
    drawGem(ctx, x - 22, 20, el, 0, .75);
    const got = lv.gems.filter(g => g.el === el && g.got).length, tot = lv.gems.filter(g => g.el === el).length;
    ctx.font = '20px "Pirata One", Georgia, serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f6f0d0'; ctx.fillText(`${got} / ${tot}`, x - 6, 21);
  }
  ctx.font = '17px "Pirata One", Georgia, serif'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(240,235,210,.9)'; ctx.fillText(`Level ${lv.i + 1}: ${lv.def.name}`, 12, 22);
  iconBtn(W - 50, H - 42, muted ? 'muted' : 'sound', toggleMute);
  iconBtn(W - 92, H - 42, 'pause', () => { paused = true; });
  iconBtn(W - 134, H - 42, 'full', toggleFs);
  watermark();
}

// ---------- shared UI ----------
const CX = W / 2;
let btns = [], ptr = { x: -1, y: -1 }, scene = 'loading', loadT = 0, paused = false, tt = 0, helpOpen = false;
const keys = { fire: { l: 0, r: 0, j: 0 }, water: { l: 0, r: 0, j: 0 } };
function outline(txt, x, y, size, fill, stroke, font = 'Bungee, Impact, sans-serif') {
  ctx.font = `${size}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size / 5); ctx.strokeStyle = stroke; ctx.strokeText(txt, x, y); ctx.fillStyle = fill; ctx.fillText(txt, x, y);
}
const inside = (p, x, y, w, h) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
function button(label, x, y, w, h, fn, opts = {}) {
  const dis = opts.disabled, hov = !dis && inside(ptr, x - w / 2, y - h / 2, w, h);
  ctx.save(); ctx.translate(x, y); if (hov) ctx.scale(1.05, 1.05);
  ctx.fillStyle = dis ? '#333' : '#5a2306'; rr(ctx, -w / 2, -h / 2 + 5, w, h, 14); ctx.fill();
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  if (dis) { g.addColorStop(0, '#9aa4ad'); g.addColorStop(1, '#69737c'); } else { g.addColorStop(0, '#ffc04a'); g.addColorStop(1, '#f07a10'); }
  ctx.fillStyle = g; rr(ctx, -w / 2, -h / 2, w, h, 14); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = dis ? '#555' : '#fff1c4'; rr(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 10); ctx.stroke();
  outline(label, 0, 2, opts.size || Math.min(32, h * .5), '#fff', dis ? '#444' : '#7a2a06');
  ctx.restore();
  if (!dis) btns.push({ x: x - w / 2, y: y - h / 2, w, h, fn, primary: opts.primary });
}
function iconBtn(x, y, kind, fn) {
  const hov = inside(ptr, x, y, 34, 34);
  ctx.fillStyle = hov ? '#ffb43a' : '#f08a14'; rr(ctx, x, y, 34, 34, 7); ctx.fill();
  ctx.strokeStyle = '#7a3a06'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = '#3a1a04'; ctx.strokeStyle = '#3a1a04';
  if (kind === 'pause') { ctx.fillRect(x + 11, y + 9, 5, 16); ctx.fillRect(x + 19, y + 9, 5, 16); }
  else if (kind === 'full') {
    ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(x + 8, y + 15); ctx.lineTo(x + 8, y + 8); ctx.lineTo(x + 15, y + 8);
    ctx.moveTo(x + 19, y + 8); ctx.lineTo(x + 26, y + 8); ctx.lineTo(x + 26, y + 15);
    ctx.moveTo(x + 26, y + 19); ctx.lineTo(x + 26, y + 26); ctx.lineTo(x + 19, y + 26);
    ctx.moveTo(x + 15, y + 26); ctx.lineTo(x + 8, y + 26); ctx.lineTo(x + 8, y + 19); ctx.stroke();
  } else if (kind === 'help') { outline('?', x + 17, y + 19, 20, '#3a1a04', '#f08a14'); }
  else {
    ctx.beginPath(); ctx.moveTo(x + 8, y + 13); ctx.lineTo(x + 13, y + 13); ctx.lineTo(x + 19, y + 8); ctx.lineTo(x + 19, y + 26); ctx.lineTo(x + 13, y + 21); ctx.lineTo(x + 8, y + 21); ctx.fill();
    ctx.lineWidth = 2.5; ctx.beginPath();
    if (kind === 'sound') { ctx.arc(x + 20, y + 17, 6, -1, 1); }
    else { ctx.moveTo(x + 22, y + 12); ctx.lineTo(x + 29, y + 22); ctx.moveTo(x + 29, y + 12); ctx.lineTo(x + 22, y + 22); }
    ctx.stroke();
  }
  btns.push({ x, y, w: 34, h: 34, fn });
}
function toggleMute() { muted = !muted; store.set('et-mute', muted); if (!muted) audio(); }
function toggleFs() {
  const f = cv.parentElement;
  try { const r = document.fullscreenElement ? document.exitFullscreen() : f.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch {}
}
function watermark() {
  ctx.save();
  ctx.font = '22px "Lilita One", "Arial Black", Impact, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#5a1e00'; ctx.strokeText('GIANTCLIP', 14, H - 16);
  const g = ctx.createLinearGradient(0, H - 38, 0, H - 14); g.addColorStop(0, '#ffd23a'); g.addColorStop(1, '#ff7a10');
  ctx.fillStyle = g; ctx.fillText('GIANTCLIP', 14, H - 16);
  ctx.restore();
}
function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#8a8a70'); g.addColorStop(1, '#4a4a3a');
  ctx.fillStyle = g; rr(ctx, x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = '#2a2a20'; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,230,.3)'; ctx.lineWidth = 2; rr(ctx, x + 8, y + 8, w - 16, h - 16, 6); ctx.stroke();
  for (const [cx, cy] of [[x + 16, y + 16], [x + w - 16, y + 16], [x + 16, y + h - 16], [x + w - 16, y + h - 16]]) { ctx.fillStyle = '#3a3a2e'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 7); ctx.fill(); }
}

// ---------- overlays ----------
function deadOverlay() {
  panel(200, 150, 400, 280);
  outline('OH NO!', CX, 205, 52, '#ffe14a', '#5a1e00');
  const who = lv.dead.el === 'fire' ? 'Ember' : 'Tide';
  const what = lv.dead.why === 'G' ? 'the green goo' : lv.dead.why === 'L' ? 'the lava' : 'the water';
  ctx.font = 'bold 18px Verdana, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8f6ff'; ctx.fillText(`${who} fell in ${what}.`, CX, 262);
  button('RETRY ▶', CX, 320, 220, 56, () => loadLevel(lv.i), { primary: true, size: 24 });
  button('LEVELS', CX, 388, 160, 44, () => { scene = 'levels'; }, { size: 18 });
}
function completeOverlay() {
  const k = lv.complete;
  panel(190, 110, 420, 380);
  outline('LEVEL COMPLETE!', CX, 160, 36, '#ffe14a', '#5a1e00');
  const s = Math.floor(k.time), mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
  ctx.font = 'bold 18px Verdana, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#e8f6ff';
  ctx.fillText(`Time: ${mm}:${ss}  (par ${Math.floor(lv.def.par / 60)}:${String(lv.def.par % 60).padStart(2, '0')})`, 230, 215);
  ctx.fillText(`Gems: ${k.got} of ${k.total}`, 230, 250);
  const rc = { A: ['#ffe066', '#c99400'], B: ['#e8eef4', '#8a98a8'], C: ['#f0b27a', '#9a5a22'] }[k.rank];
  const gx = 510, gy = 232, g = ctx.createRadialGradient(gx - 12, gy - 14, 4, gx, gy, 44);
  g.addColorStop(0, '#fff'); g.addColorStop(.4, rc[0]); g.addColorStop(1, rc[1]);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, 42, 0, 7); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
  outline(k.rank, gx, gy + 3, 48, '#ffffff', '#3a2a10');
  const last = lv.i === LEVELS.length - 1;
  if (!last) button('NEXT LEVEL ▶', CX, 330, 260, 58, () => loadLevel(lv.i + 1), { primary: true, size: 24 });
  else outline('YOU BEAT THE TEMPLE!', CX, 330, 26, '#9fe0ff', '#0d2350');
  button('RETRY', CX - 90, 410, 150, 46, () => loadLevel(lv.i), { size: 18, primary: last });
  button('LEVELS', CX + 90, 410, 150, 46, () => { scene = 'levels'; }, { size: 18 });
}
function pauseOverlay() {
  panel(250, 170, 300, 260);
  outline('PAUSED', CX, 220, 52, '#ffe14a', '#5a1e00');
  button('RESUME ▶', CX, 300, 220, 56, () => { paused = false; }, { primary: true, size: 24 });
  button('LEVELS', CX, 372, 160, 44, () => { paused = false; scene = 'levels'; }, { size: 18 });
}

// ---------- menus ----------
let snow = [];
function snowfall(dt) {
  if (snow.length < 80) snow.push({ x: R(0, W), y: -10, v: R(30, 80), r: R(1, 3), s: R(0, 6) });
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (const f of snow) { f.y += f.v * dt; f.x += Math.sin(tt + f.s) * 12 * dt; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); }
  snow = snow.filter(f => f.y < H + 10);
}
const menuBg = document.createElement('canvas'); menuBg.width = W; menuBg.height = H;
function buildMenuBg() {
  const c = menuBg.getContext('2d');
  backdrop(c);
  // temple pillars
  for (const x of [60, 680]) {
    const g = c.createLinearGradient(x, 0, x + 60, 0); g.addColorStop(0, '#4a4a3c'); g.addColorStop(.4, '#a8a890'); g.addColorStop(1, '#3a3a2e');
    c.fillStyle = g; c.fillRect(x, 60, 60, 480);
    c.fillStyle = '#8a8a72'; c.fillRect(x - 10, 50, 80, 16); c.fillRect(x - 10, 530, 80, 16);
    c.fillStyle = '#eef8ff'; rr(c, x - 12, 44, 84, 10, 5); c.fill();
  }
  c.fillStyle = '#6a6a56'; c.fillRect(0, 548, W, 52);
  c.fillStyle = '#eef8ff'; rr(c, -4, 542, W + 8, 12, 6); c.fill();
  const v = c.createRadialGradient(CX, 300, 120, CX, 300, 520); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
}
function logo(y, s = 1) {
  ctx.save(); ctx.translate(CX, y); ctx.scale(s, s);
  ctx.save(); ctx.shadowColor = 'rgba(120,200,255,.8)'; ctx.shadowBlur = 30;
  const fg = ctx.createLinearGradient(0, -40, 0, 20); fg.addColorStop(0, '#ffe066'); fg.addColorStop(.5, '#ff8a00'); fg.addColorStop(1, '#d83a0a');
  outline('EMBER', -150, 0, 70, fg, '#4a1400', '"Lilita One", Impact, sans-serif');
  const wg = ctx.createLinearGradient(0, -40, 0, 20); wg.addColorStop(0, '#e8fbff'); wg.addColorStop(.5, '#5fc0ff'); wg.addColorStop(1, '#1f6fd0');
  outline('TIDE', 160, 0, 70, wg, '#0b2a52', '"Lilita One", Impact, sans-serif');
  outline('&', 8, 0, 56, '#ffffff', '#2a3e52', '"Lilita One", Impact, sans-serif');
  ctx.restore();
  outline('IN THE ICE TEMPLE', 0, 54, 22, '#dff3ff', '#1a3550');
  ctx.restore();
}
function drawTitle(dt) {
  ctx.drawImage(menuBg, 0, 0);
  snowfall(dt);
  logo(130);
  const b = Math.sin(tt * 3) * 4;
  drawEmber(ctx, 150, 545 + b, 1, tt, 0, 2.6);
  drawTide(ctx, 650, 545 - b, -1, tt, tt * 40, 2.6);
  button('PLAY ▶', CX, 290, 240, 74, () => { scene = 'levels'; }, { primary: true, size: 38 });
  ctx.fillStyle = 'rgba(8,20,36,.8)'; rr(ctx, CX - 170, 350, 340, 128, 12); ctx.fill(); ctx.strokeStyle = '#8fc7ee'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 16px Verdana, sans-serif'; ctx.fillStyle = '#ffb27a'; ctx.fillText('EMBER:  ← → move,  ↑ jump', CX, 382);
  ctx.fillStyle = '#9fdcff'; ctx.fillText('TIDE:  A D move,  W jump', CX, 414);
  ctx.font = '13px Verdana, sans-serif'; ctx.fillStyle = '#cfe0f0'; ctx.fillText('Two players, one keyboard.', CX, 444); ctx.fillText('Get both heroes to their doors!', CX, 462);
  iconBtn(16, 16, muted ? 'muted' : 'sound', toggleMute);
  iconBtn(W - 50, H - 42, 'full', toggleFs);
  watermark();
}
function drawLevels(dt) {
  ctx.drawImage(menuBg, 0, 0);
  snowfall(dt);
  logo(90, .7);
  outline('CHOOSE A TEMPLE ROOM', CX, 165, 26, '#ffffff', '#1a3550');
  LEVELS.forEach((d, i) => {
    const x = 100 + (i % 5) * 150, y = i < 5 ? 255 : 410, locked = i + 1 > save.unlocked, best = save.best[i];
    const hov = !locked && Math.hypot(ptr.x - x, ptr.y - y) < 50;
    ctx.save(); ctx.translate(x, y); ctx.scale(.84, .84); if (hov) ctx.scale(1.06, 1.06);
    const g = ctx.createRadialGradient(-20, -24, 8, 0, 0, 80);
    g.addColorStop(0, locked ? '#8a96a3' : '#cfe9fb'); g.addColorStop(.6, locked ? '#4f5b67' : '#5d8fb6'); g.addColorStop(1, locked ? '#2c343c' : '#244a6c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 56, 0, 7); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = locked ? '#6b7680' : '#eef8ff'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(0, 0, 46, 0, 7); ctx.stroke();
    if (locked) {
      ctx.fillStyle = '#20262c'; rr(ctx, -18, -6, 36, 30, 5); ctx.fill();
      ctx.strokeStyle = '#20262c'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, -8, 12, Math.PI, 0); ctx.stroke();
    } else outline(String(i + 1), 0, 4, 56, '#ffffff', '#163a5c');
    ctx.restore();
    ctx.font = 'bold 14px Verdana, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = locked ? '#8a96a3' : '#ffffff'; ctx.fillText(d.name, x, y + 64);
    if (best) {
      const rc = { A: '#ffd23a', B: '#e0e6ec', C: '#e8a060' }[best.rank];
      ctx.fillStyle = rc; ctx.beginPath(); ctx.arc(x + 36, y - 36, 15, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      outline(best.rank, x + 36, y - 34, 17, '#fff', '#3a2a10');
    }
    if (!locked) btns.push({ x: x - 48, y: y - 48, w: 96, h: 96, fn: () => loadLevel(i), primary: i + 1 === save.unlocked });
  });
  button('◀ BACK', 110, 545, 150, 44, () => { scene = 'title'; }, { size: 18 });
  iconBtn(W - 50, H - 42, 'full', toggleFs);
}
function drawLoading(dt) {
  loadT += dt;
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d2350'); g.addColorStop(1, '#03091a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = .08; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(CX, 250, 60 + i * 40, 0, 7); ctx.stroke(); }
  ctx.restore();
  const lg = ctx.createLinearGradient(0, 195, 0, 265); lg.addColorStop(0, '#ffe066'); lg.addColorStop(.5, '#ff9a10'); lg.addColorStop(1, '#e2500a');
  outline('GIANTCLIP', CX, 230, 78, lg, '#5a1e00', '"Lilita One", "Arial Black", Impact, sans-serif');
  outline('PLAY ONLINE GAMES', CX, 290, 18, '#ffffff', '#0d2350');
  const k = Math.min(1, loadT / 2.4), bw = 360, bx = CX - bw / 2, by = 360;
  ctx.fillStyle = '#0a1530'; rr(ctx, bx - 4, by - 4, bw + 8, 30, 15); ctx.fill(); ctx.strokeStyle = '#4b93e0'; ctx.lineWidth = 2; ctx.stroke();
  const pg = ctx.createLinearGradient(0, by, 0, by + 22); pg.addColorStop(0, '#ffd27a'); pg.addColorStop(.5, '#ff8a00'); pg.addColorStop(1, '#e25f00');
  ctx.fillStyle = pg; rr(ctx, bx, by, Math.max(22, bw * k), 22, 11); ctx.fill();
  ctx.font = 'bold 15px Verdana, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#cfe0ff';
  ctx.fillText(k < 1 ? `Loading Ember & Tide... ${Math.floor(k * 100)}%` : 'Ready!', CX, 420);
  if (loadT > 2.7) scene = 'title';
}

// ---------- loop ----------
let last = 0;
function frame(ts) {
  const now = ts / 1000, dt = Math.min(.033, now - (last || now)); last = now; tt += dt;
  btns = [];
  if (scene === 'loading') drawLoading(dt);
  else if (scene === 'title') drawTitle(dt);
  else if (scene === 'levels') drawLevels(dt);
  else if (scene === 'play') { if (!paused && !lv.complete) update(dt); drawPlay(dt); }
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
const MAP = { ArrowLeft: ['fire', 'l'], ArrowRight: ['fire', 'r'], ArrowUp: ['fire', 'j'], KeyA: ['water', 'l'], KeyD: ['water', 'r'], KeyW: ['water', 'j'] };
addEventListener('keydown', e => {
  const m = MAP[e.code];
  if (m) { keys[m[0]][m[1]] = 1; if (scene === 'play') e.preventDefault(); }
  if (e.code === 'ArrowDown' || e.code === 'Space') { if (scene === 'play') e.preventDefault(); }
  if (e.repeat) return;
  audio();
  if (e.code === 'Enter') { const b = btns.find(x => x.primary); if (b) { sfx.click(); b.fn(); } }
  if (scene === 'play' && (e.code === 'KeyP' || e.code === 'Escape') && !lv.complete && !lv.dead) paused = !paused;
  if (scene === 'play' && e.code === 'KeyR' && !lv.complete) loadLevel(lv.i);
});
addEventListener('keyup', e => { const m = MAP[e.code]; if (m) keys[m[0]][m[1]] = 0; });
addEventListener('blur', () => { for (const k of Object.values(keys)) k.l = k.r = k.j = 0; if (scene === 'play' && lv && !lv.complete && !lv.dead) paused = true; });

window.EmberTide = { drawEmber, drawTide, drawGem, drawDoor, debug: { loadLevel, get lv() { return lv; }, keys, step(n) { for (let i = 0; i < n; i++) update(1 / 60); } } };
const go = () => { buildMenuBg(); requestAnimationFrame(frame); };
if (document.fonts) Promise.all(['20px Bungee', '20px "Lilita One"', '20px "Pirata One"'].map(f => document.fonts.load(f).catch(() => {}))).then(go); else go();
})();
