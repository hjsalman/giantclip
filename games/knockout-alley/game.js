/* Knockout Alley - behind-the-back arcade boxing. Canvas 2D, no libraries. */
(() => {
'use strict';
const cv = document.getElementById('ka');
const ctx = cv.getContext('2d');
const W = 800, H = 600, CX = 400, DODGE = 0.5;

// ---------- storage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
let save = Object.assign({ beaten: 0, champ: false, bestDef: 0 }, store.get('ka-save', {}));
let muted = store.get('ka-mute', false);
function persist() { store.set('ka-save', save); window.dispatchEvent(new CustomEvent('ka-awards', { detail: save })); }

const L = (a, b, k) => a + (b - a) * k;
const C = (v, a, b) => v < a ? a : v > b ? b : v;
const E = k => { k = C(k, 0, 1); return 1 - (1 - k) ** 3; };
const R = (a, b) => a + Math.random() * (b - a);

// ---------- fighters ----------
const HERO = { name: 'You', look: 'hero', skin: '#eab48a', hair: '#6a3418', trunks: '#2f6fe0', glove: '#d8362b', cuff: '#ffffff' };
const ROSTER = [
  { name: 'Mailman Mo', blurb: 'Never misses a delivery. Misses most punches.', look: 'cap',
    skin: '#efc39b', hair: '#6b4426', trunks: '#28458c', glove: '#f1f1f1', cuff: '#28458c',
    wind: .74, gap: [1.3, 2.3], dmg: 8, mix: { hook: .65, jab: .3, upper: .05 }, combo: 0, feint: 0, high: .4, open: 1.15, hp: 1 },
  { name: 'Lumberjack Lars', blurb: 'Swings like he is chopping an oak.', look: 'beard',
    skin: '#f3c9a3', hair: '#9a4a1a', trunks: '#7d1e1e', glove: '#3d6e36', cuff: '#1d2a1b',
    wind: .62, gap: [1.1, 2.0], dmg: 11, mix: { hook: .55, jab: .2, upper: .25 }, combo: .12, feint: .05, high: .5, open: .95, hp: 1.15 },
  { name: 'Disco Dante', blurb: 'Fast hands, faster feet, louder shorts.', look: 'disco',
    skin: '#b07650', hair: '#1b1b1b', trunks: '#d6a21a', glove: '#b93ad0', cuff: '#ffd84a',
    wind: .5, gap: [.8, 1.5], dmg: 9, mix: { hook: .4, jab: .45, upper: .15 }, combo: .3, feint: .15, high: .55, open: .78, hp: 1.1 },
  { name: 'Professor Knuckles', blurb: 'Wrote the book on feints. Twice.', look: 'prof',
    skin: '#dcaa82', hair: '#cfcfcf', trunks: '#2f3a2f', glove: '#7a4f2c', cuff: '#e8e1d0',
    wind: .5, gap: [.8, 1.4], dmg: 11, mix: { hook: .4, jab: .3, upper: .3 }, combo: .25, feint: .35, high: .7, open: .66, hp: 1.25 },
  { name: 'Brick Malone', blurb: 'Undefeated champion of the Alley.', look: 'champ',
    skin: '#c88d60', hair: '#c4262f', trunks: '#151515', glove: '#e0b021', cuff: '#151515',
    wind: .43, gap: [.6, 1.2], dmg: 14, mix: { hook: .4, jab: .3, upper: .3 }, combo: .4, feint: .2, high: .6, open: .6, hp: 1.4 },
];

// ---------- audio ----------
let ac = null;
function audio() {
  if (muted) return;
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } }
  if (ac.state === 'suspended') ac.resume();
}
let nb = null;
function nbuf() {
  if (nb) return nb;
  nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return nb;
}
function noise(dur, f, q, vol, type = 'bandpass') {
  if (muted || !ac) return;
  const s = ac.createBufferSource(); s.buffer = nbuf();
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ac.createGain(); const n = ac.currentTime;
  g.gain.setValueAtTime(vol, n); g.gain.exponentialRampToValueAtTime(.001, n + dur);
  s.connect(fl).connect(g).connect(ac.destination); s.start(n, Math.random()); s.stop(n + dur + .05);
}
function tone(f, dur, vol, type = 'sine', f2) {
  if (muted || !ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), n = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, n); if (f2) o.frequency.exponentialRampToValueAtTime(f2, n + dur);
  g.gain.setValueAtTime(vol, n); g.gain.exponentialRampToValueAtTime(.001, n + dur);
  o.connect(g).connect(ac.destination); o.start(n); o.stop(n + dur + .05);
}
const sfx = {
  hit() { noise(.16, 700, .8, .9, 'lowpass'); tone(120, .14, .6, 'sine', 50); },
  light() { noise(.09, 1400, 1, .5); tone(170, .07, .35, 'sine', 90); },
  block() { noise(.07, 2600, 3, .35); },
  whoosh() { noise(.18, 900, .6, .22); },
  hurt() { noise(.2, 400, .7, .9, 'lowpass'); tone(90, .2, .7, 'sine', 40); },
  bell() { tone(1046, 1.4, .22, 'triangle'); tone(1568, 1.1, .1, 'sine'); },
  tick() { tone(720, .06, .14, 'square'); },
  cheer() { noise(1.8, 1500, .4, .35); noise(1.4, 800, .3, .25); },
  big() { noise(.45, 300, .5, 1, 'lowpass'); tone(70, .45, .9, 'sine', 30); },
  click() { tone(520, .05, .12, 'square'); },
};

// ---------- static arena (pre-rendered) ----------
const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
function buildArena() {
  const c = bg.getContext('2d'); c.clearRect(0, 0, W, H);
  let g = c.createLinearGradient(0, 0, 0, 330);
  g.addColorStop(0, '#05060b'); g.addColorStop(.6, '#15121d'); g.addColorStop(1, '#231a22');
  c.fillStyle = g; c.fillRect(0, 0, W, 340);
  // light rig
  c.fillStyle = '#2a2a33'; c.fillRect(0, 0, W, 26);
  for (let i = 0; i < 34; i++) {
    const x = 12 + i * 23.6;
    const rg = c.createRadialGradient(x, 13, 0, x, 13, 12);
    rg.addColorStop(0, 'rgba(255,255,235,1)'); rg.addColorStop(.35, 'rgba(255,250,210,.7)'); rg.addColorStop(1, 'rgba(255,250,210,0)');
    c.fillStyle = rg; c.fillRect(x - 12, 1, 24, 24);
  }
  // spotlight haze
  for (const sx of [140, 400, 660]) {
    const sg = c.createLinearGradient(sx, 26, sx, 330);
    sg.addColorStop(0, 'rgba(255,240,200,.10)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = sg; c.beginPath(); c.moveTo(sx - 20, 26); c.lineTo(sx + 20, 26); c.lineTo(sx + 140, 330); c.lineTo(sx - 140, 330); c.fill();
  }
  // crowd tiers
  const tones = ['#3a2430', '#2c2236', '#40302a', '#2a2a3a', '#4a2a2a', '#30303a', '#523434', '#2f3c4c'];
  for (let row = 0; row < 16; row++) {
    const y = 60 + row * 14, r = 5 + row * .45, dim = .35 + row * .04;
    c.globalAlpha = dim;
    for (let x = -10; x < W + 10; x += r * 2.1 + Math.random() * 3) {
      c.fillStyle = tones[(Math.random() * tones.length) | 0];
      c.beginPath(); c.ellipse(x, y + r * 1.6, r * 1.3, r, 0, 0, 7); c.fill();
      c.beginPath(); c.arc(x + R(-1, 1), y, r * .75, 0, 7); c.fill();
    }
  }
  c.globalAlpha = 1;
  // barrier
  c.fillStyle = '#121016'; c.fillRect(0, 286, W, 50);
  // ropes
  const rope = (y, h) => {
    const rg2 = c.createLinearGradient(0, y, 0, y + h);
    rg2.addColorStop(0, '#ff6b5e'); rg2.addColorStop(.5, '#d0262a'); rg2.addColorStop(1, '#7a1216');
    c.fillStyle = rg2; c.fillRect(0, y, W, h);
  };
  rope(236, 7); rope(266, 7); rope(296, 8);
  // floor
  g = c.createLinearGradient(0, 330, 0, H);
  g.addColorStop(0, '#2c6fd2'); g.addColorStop(1, '#4b94f2');
  c.fillStyle = g; c.fillRect(0, 330, W, H - 330);
  c.fillStyle = '#e9eef7'; c.fillRect(0, 326, W, 6);
  // floor logo, flattened for perspective
  c.save(); c.translate(CX, 500); c.scale(1, .36);
  burst(c, 0, 0, 330, 250, 18, '#ff9a1f', '#9b3d06');
  c.font = '92px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 14; c.strokeStyle = '#9b3d06'; c.strokeText('KNOCKOUT', 0, -60); c.strokeText('ALLEY', 0, 60);
  c.fillStyle = '#ffe07a'; c.fillText('KNOCKOUT', 0, -60); c.fillText('ALLEY', 0, 60);
  c.restore();
  // depth haze on the near floor
  g = c.createLinearGradient(0, 520, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,30,.25)');
  c.fillStyle = g; c.fillRect(0, 520, W, 80);
}
buildArena();

function burst(c, x, y, ro, ri, n, fill, stroke, rot = 0) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro, a = rot + i * Math.PI / n - Math.PI / 2;
    c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  c.closePath(); c.fillStyle = fill; c.fill();
  if (stroke) { c.lineWidth = 5; c.strokeStyle = stroke; c.stroke(); }
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
function star(c, x, y, r, fill) { burst(c, x, y, r, r * .45, 5, fill); }

// ---------- shading helpers ----------
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = C((n >> 16) + amt, 0, 255), g = C((n >> 8 & 255) + amt, 0, 255), b = C((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}
// per-fighter build: shoulder half-width, waist half-width, belly, arm thickness, head radius, jaw width, teeth grin
const BUILD = {
  hero:  { sh: 116, wa: 80, belly: 0,   arm: 34, head: 54, jaw: 1.05, teeth: false },
  cap:   { sh: 114, wa: 100, belly: .9, arm: 32, head: 58, jaw: 1.1, teeth: false },
  beard: { sh: 136, wa: 104, belly: .45, arm: 42, head: 56, jaw: 1.15, teeth: false },
  disco: { sh: 108, wa: 72, belly: 0,   arm: 30, head: 52, jaw: 1.0, teeth: true },
  prof:  { sh: 100, wa: 78, belly: .2,  arm: 27, head: 56, jaw: .92, teeth: false },
  champ: { sh: 148, wa: 94, belly: 0,   arm: 46, head: 50, jaw: 1.25, teeth: true },
};
function outlineOf(skin) { return shade(skin, -105); }
// tapered capsule with cylindrical shading
function limb(c, x1, y1, r1, x2, y2, r2, col) {
  const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a), ny = Math.cos(a);
  c.beginPath();
  c.moveTo(x1 + nx * r1, y1 + ny * r1); c.lineTo(x2 + nx * r2, y2 + ny * r2);
  c.arc(x2, y2, r2, a + Math.PI / 2, a - Math.PI / 2, true);
  c.lineTo(x1 - nx * r1, y1 - ny * r1);
  c.arc(x1, y1, r1, a - Math.PI / 2, a + Math.PI / 2, true);
  c.closePath();
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, r = Math.max(r1, r2);
  const g = c.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r);
  g.addColorStop(0, shade(col, 40)); g.addColorStop(.35, col); g.addColorStop(.8, shade(col, -40)); g.addColorStop(1, shade(col, -70));
  c.fillStyle = g; c.fill();
  c.lineWidth = 3; c.strokeStyle = outlineOf(col); c.stroke();
}
function sphere(c, x, y, rx, ry, col, lightX = -.35, lightY = -.4) {
  const g = c.createRadialGradient(x + rx * lightX, y + ry * lightY, Math.min(rx, ry) * .1, x, y, Math.max(rx, ry) * 1.05);
  g.addColorStop(0, shade(col, 55)); g.addColorStop(.45, col); g.addColorStop(1, shade(col, -60));
  c.fillStyle = g; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill();
  c.lineWidth = 3; c.strokeStyle = outlineOf(col); c.stroke();
}

// ---------- head ----------
function facePath(c, jw) {
  c.beginPath(); c.moveTo(-45, -6);
  c.bezierCurveTo(-48, -66, 48, -66, 45, -6);
  c.bezierCurveTo(46 * jw, 28, 34 * jw, 58, 0, 60);
  c.bezierCurveTo(-34 * jw, 58, -46 * jw, 28, -45, -6);
  c.closePath();
}
function drawHead(c, pr, x, y, r, mood) {
  const b = BUILD[pr.look] || BUILD.hero;
  c.save(); c.translate(x, y); c.scale(r / 52, r / 52);
  const skin = pr.skin, dark = shade(skin, -55), lit = shade(skin, 35), ol = outlineOf(skin);
  const hurt = mood === 'hurt';
  // ears
  for (const s of [-1, 1]) {
    c.fillStyle = skin; c.beginPath(); c.ellipse(s * 47, 4, 11, 15, 0, 0, 7); c.fill();
    c.lineWidth = 3; c.strokeStyle = ol; c.stroke();
    c.fillStyle = dark; c.beginPath(); c.ellipse(s * 47, 5, 5, 8, 0, 0, 7); c.fill();
  }
  // face with jaw, shading, rim light
  facePath(c, b.jaw);
  const fg = c.createRadialGradient(-16, -22, 6, 0, 6, 70);
  fg.addColorStop(0, lit); fg.addColorStop(.55, skin); fg.addColorStop(1, dark);
  c.fillStyle = fg; c.fill();
  c.save(); facePath(c, b.jaw); c.clip();
  c.fillStyle = 'rgba(60,20,0,.16)'; c.beginPath(); c.ellipse(46, 10, 30, 70, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.ellipse(-30, -26, 12, 22, -.3, 0, 7); c.fill();
  c.fillStyle = 'rgba(220,70,50,.16)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 26, 16, 10, 6, 0, 0, 7); c.fill(); }
  if (pr.look === 'champ' || pr.look === 'beard') { c.fillStyle = 'rgba(30,15,5,.16)'; c.beginPath(); c.ellipse(0, 42, 38, 20, 0, 0, 7); c.fill(); }
  c.restore();
  facePath(c, b.jaw); c.lineWidth = 3.5; c.strokeStyle = ol; c.stroke();
  if (b.jaw > 1.1) { c.strokeStyle = 'rgba(60,20,0,.35)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, 52); c.quadraticCurveTo(0, 48, 6, 52); c.stroke(); }

  // eyes
  if (pr.look === 'disco') {
    c.fillStyle = '#121212'; c.strokeStyle = '#ffcf3a'; c.lineWidth = 3.5;
    rr(c, -38, -17, 32, 19, 7); c.fill(); c.stroke();
    rr(c, 6, -17, 32, 19, 7); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-6, -10); c.lineTo(6, -10); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(-32, -13); c.lineTo(-24, -5); c.moveTo(12, -13); c.lineTo(20, -5); c.stroke();
  } else if (hurt) {
    c.strokeStyle = '#2a1408'; c.lineWidth = 4.5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-28, -11); c.lineTo(-12, -4); c.lineTo(-28, 3);
    c.moveTo(28, -11); c.lineTo(12, -4); c.lineTo(28, 3); c.stroke();
  } else {
    for (const s of [-1, 1]) {
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(s * 18, -5, 11, 8, 0, 0, 7); c.fill();
      c.lineWidth = 2.5; c.strokeStyle = ol; c.stroke();
      c.fillStyle = pr.look === 'champ' ? '#5a2a10' : '#3b5f8a'; c.beginPath(); c.arc(s * 15, -4, 5.5, 0, 7); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.arc(s * 15, -4, 2.8, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(s * 13.5, -6, 1.7, 0, 7); c.fill();
      c.strokeStyle = 'rgba(60,20,0,.35)'; c.lineWidth = 2; c.beginPath(); c.arc(s * 18, 0, 10, .3, Math.PI - .3); c.stroke();
    }
  }
  if (pr.look === 'prof') {
    c.strokeStyle = '#222'; c.lineWidth = 3.5;
    for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 18, -5, 14, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(-4, -7); c.lineTo(4, -7); c.moveTo(-32, -6); c.lineTo(-46, -10); c.moveTo(32, -6); c.lineTo(46, -10); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.25)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 18 - 5, -10, 4, 2.5, -.5, 0, 7); c.fill(); }
  }
  // heavy brows
  const bc = pr.look === 'prof' ? '#9a9a9a' : shade(pr.hair, -25);
  const bd = hurt ? -5 : 0;
  c.fillStyle = bc;
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(s * 34, -24 + bd); c.quadraticCurveTo(s * 20, -30 + bd, s * 6, -17 - bd);
    c.lineTo(s * 8, -12 - bd); c.quadraticCurveTo(s * 20, -21 + bd, s * 33, -17 + bd); c.closePath(); c.fill();
  }
  // nose
  c.fillStyle = shade(skin, -12); c.beginPath(); c.ellipse(0, 12, 10, 8, 0, 0, 7); c.fill();
  c.lineWidth = 2.5; c.strokeStyle = ol; c.beginPath(); c.arc(0, 12, 9, .2, Math.PI - .2); c.stroke();
  c.beginPath(); c.moveTo(-3, -4); c.quadraticCurveTo(-6, 6, -8, 10); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.ellipse(-3, 9, 3, 2, 0, 0, 7); c.fill();
  // mouth
  if (hurt) {
    c.fillStyle = '#3a0f0a'; c.beginPath(); c.ellipse(0, 34, 11, 13, 0, 0, 7); c.fill(); c.lineWidth = 2.5; c.strokeStyle = ol; c.stroke();
    c.fillStyle = '#c94a4a'; c.beginPath(); c.ellipse(0, 41, 7, 4, 0, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.fillRect(-7, 22, 14, 4);
  } else if (mood === 'grin' || b.teeth) {
    c.fillStyle = '#5a1a10'; rr(c, -19, 25, 38, 15, 7); c.fill();
    c.fillStyle = '#fff'; rr(c, -17, 26, 34, 12, 5); c.fill();
    c.strokeStyle = '#8a8a8a'; c.lineWidth = 1.2; c.beginPath();
    for (let i = -2; i <= 2; i++) { c.moveTo(i * 6, 26); c.lineTo(i * 6, 38); } c.moveTo(-17, 32); c.lineTo(17, 32); c.stroke();
    if (pr.look === 'disco') { c.fillStyle = '#ffcf3a'; c.fillRect(5, 26, 6, 6); }
    c.lineWidth = 2.5; c.strokeStyle = ol; rr(c, -19, 25, 38, 15, 7); c.stroke();
  } else {
    c.strokeStyle = '#4a1e12'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-16, 33); c.quadraticCurveTo(0, 28, 18, 28); c.stroke();
  }

  // look extras
  const hair = pr.hair;
  c.lineWidth = 3; c.strokeStyle = shade(hair, -60);
  if (pr.look === 'hero') {
    const hg = c.createLinearGradient(0, -80, 0, -20); hg.addColorStop(0, shade(hair, 40)); hg.addColorStop(1, hair);
    c.fillStyle = hg;
    c.beginPath(); c.moveTo(-48, 2);
    const pts = [[-52, -26], [-44, -54], [-36, -42], [-28, -72], [-16, -54], [-4, -82], [8, -58], [24, -76], [28, -52], [44, -64], [40, -40], [52, -30], [48, 2]];
    for (const [px, py] of pts) c.lineTo(px, py);
    c.quadraticCurveTo(44, -30, 20, -36); c.quadraticCurveTo(0, -28, -22, -36); c.quadraticCurveTo(-44, -30, -48, 2); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-20, -60); c.lineTo(-12, -44); c.moveTo(6, -66); c.lineTo(10, -46); c.stroke();
  } else if (pr.look === 'cap') {
    sphere(c, 0, -30, 51, 34, '#2c4fa0', -.3, -.6);
    c.fillStyle = '#1b336e'; c.fillRect(-51, -32, 102, 10); c.strokeRect(-51, -32, 102, 10);
    c.fillStyle = '#16294f'; c.beginPath(); c.ellipse(0, -22, 50, 11, 0, 0, Math.PI); c.fill(); c.stroke();
    sphere(c, 0, -52, 8, 8, '#ffd54a');
    c.fillStyle = hair; c.strokeStyle = shade(hair, -60);
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 13, 23, 17, 8, s * .25, 0, 7); c.fill(); c.stroke(); }
  } else if (pr.look === 'beard') {
    c.fillStyle = hair;
    c.beginPath(); c.moveTo(-48, -2); c.quadraticCurveTo(-54, 58, 0, 78); c.quadraticCurveTo(54, 58, 48, -2);
    c.quadraticCurveTo(36, 22, 18, 20); c.quadraticCurveTo(0, 15, -18, 20); c.quadraticCurveTo(-36, 22, -48, -2); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,200,140,.3)'; c.lineWidth = 2;
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 10, 40); c.quadraticCurveTo(i * 12, 56, i * 9, 66); c.stroke(); }
    c.fillStyle = '#2a0d06'; c.beginPath(); c.ellipse(0, hurt ? 38 : 35, 10, hurt ? 10 : 4, 0, 0, 7); c.fill();
    sphere(c, 0, -28, 51, 36, '#c42e2e', -.3, -.6);
    c.fillStyle = '#ece4d6'; c.strokeStyle = '#8a7a60'; c.fillRect(-52, -36, 104, 14); c.strokeRect(-52, -36, 104, 14);
    sphere(c, 0, -72, 12, 12, '#ece4d6');
  } else if (pr.look === 'disco') {
    c.fillStyle = hair;
    c.beginPath(); c.ellipse(12, -56, 58, 32, -.15, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(-12, -42, 42, 22, 0, 0, 7); c.fill();
    for (const s of [-1, 1]) { c.fillRect(s * 45 - 5, -16, 10, 34); }
    c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 4;
    c.beginPath(); c.arc(16, -56, 38, Math.PI * 1.1, Math.PI * 1.6); c.stroke();
    c.beginPath(); c.arc(16, -50, 26, Math.PI * 1.15, Math.PI * 1.55); c.stroke();
  } else if (pr.look === 'prof') {
    c.fillStyle = hair;
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 44, -16, 13, 22, 0, 0, 7); c.fill(); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(-12, -44, 16, 8, -.4, 0, 7); c.fill();
    c.fillStyle = '#e6e6e6'; c.strokeStyle = '#8a8a8a';
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 12, 22, 15, 6, s * .1, 0, 7); c.fill(); c.stroke(); }
  } else if (pr.look === 'champ') {
    const hg = c.createLinearGradient(0, -90, 0, -44); hg.addColorStop(0, '#ff6a5e'); hg.addColorStop(1, hair);
    c.fillStyle = hg;
    for (let i = -3; i <= 3; i++) {
      c.beginPath(); c.moveTo(i * 8 - 8, -48 + Math.abs(i) * 2); c.lineTo(i * 9, -90 + Math.abs(i) * 6); c.lineTo(i * 8 + 8, -48 + Math.abs(i) * 2); c.closePath(); c.fill(); c.stroke();
    }
    c.fillStyle = '#f4f4f4'; c.strokeStyle = '#888'; c.fillRect(-50, -40, 100, 13); c.strokeRect(-50, -40, 100, 13);
    c.fillStyle = '#c4262f'; c.fillRect(-50, -35, 100, 4);
    c.strokeStyle = '#8a3b26'; c.lineWidth = 3; c.beginPath(); c.moveTo(22, -28); c.lineTo(34, -6); c.moveTo(24, -20); c.lineTo(31, -22); c.moveTo(28, -13); c.lineTo(35, -15); c.stroke();
  }
  c.restore();
}

// ---------- front-facing boxer ----------
function glove(c, x, y, r, col, cuff, ex, ey, glow) {
  const a = Math.atan2(ey - y, ex - x), dx = Math.cos(a), dy = Math.sin(a);
  limb(c, x + dx * r * .55, y + dy * r * .55, r * .52, x + dx * r * 1.15, y + dy * r * 1.15, r * .5, cuff);
  c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = Math.max(2, r * .08);
  c.beginPath(); c.moveTo(x + dx * r * .85 - dy * r * .48, y + dy * r * .85 + dx * r * .48); c.lineTo(x + dx * r * .85 + dy * r * .48, y + dy * r * .85 - dx * r * .48); c.stroke();
  if (glow) { c.save(); c.shadowColor = glow; c.shadowBlur = 34; }
  const base = glow && glow !== '#ffffff' ? glow : col;
  const gg = c.createRadialGradient(x - r * .35, y - r * .45, r * .08, x, y, r * 1.05);
  gg.addColorStop(0, shade(base, 80)); gg.addColorStop(.4, base); gg.addColorStop(1, shade(base, -75));
  c.fillStyle = gg;
  c.beginPath(); c.ellipse(x, y, r * 1.02, r * .96, a, 0, 7); c.fill();
  c.lineWidth = Math.max(2.5, r * .07); c.strokeStyle = outlineOf(base); c.stroke();
  if (glow) c.restore();
  // thumb
  const tx = x - dy * r * .72 + dx * r * .1, ty = y + dx * r * .72 + dy * r * .1;
  c.fillStyle = shade(base, -10); c.beginPath(); c.ellipse(tx, ty, r * .34, r * .26, a, 0, 7); c.fill();
  c.lineWidth = 2; c.strokeStyle = outlineOf(base); c.stroke();
  // knuckle crease and shine
  c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = Math.max(1.5, r * .05);
  c.beginPath(); c.arc(x, y, r * .62, a + 2.2, a + 4.1); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(x - r * .38, y - r * .42, r * .28, r * .14, -.6, 0, 7); c.fill();
  if (glow) { c.lineWidth = 4; c.strokeStyle = '#fff'; c.beginPath(); c.arc(x, y, r + 4, 0, 7); c.stroke(); }
}
function arm(c, sx, sy, gx, gy, side, skin, w) {
  const ex = (sx + gx) / 2 + side * 38, ey = (sy + gy) / 2 + 30;
  limb(c, ex, ey, w * .46, gx, gy, w * .4, skin);
  limb(c, sx, sy, w * .6, ex, ey, w * .48, skin);
  // bicep bulge
  const bx = L(sx, ex, .45), by = L(sy, ey, .45);
  c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.ellipse(bx - side * 4, by - 6, w * .32, w * .22, Math.atan2(ey - sy, ex - sx), 0, 7); c.fill();
}
function drawFront(c, pr, ox, hy, hx, gl, mood, legs) {
  const b = BUILD[pr.look] || BUILD.hero;
  const skin = pr.skin, dark = shade(skin, -60), ol = outlineOf(skin);
  const sy = hy + 80, wy = hy + 242, sh = b.sh, wa = b.wa, bel = b.belly * 34;
  if (legs) {
    for (const s of [-1, 1]) {
      limb(c, ox + s * 48, wy + 70, 34, ox + s * 54, wy + 210, 24, skin);
      c.fillStyle = '#fafafa'; rr(c, ox + s * 54 - 24, wy + 196, 48, 40, 6); c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#777'; c.stroke();
      sphere(c, ox + s * 56, wy + 244, 34, 16, '#222222');
    }
  }
  // trunks
  const tg = c.createLinearGradient(ox - wa - 20, 0, ox + wa + 20, 0);
  tg.addColorStop(0, shade(pr.trunks, -50)); tg.addColorStop(.35, shade(pr.trunks, 25)); tg.addColorStop(1, shade(pr.trunks, -60));
  c.fillStyle = tg;
  c.beginPath(); c.moveTo(ox - wa - 14, wy - 8); c.lineTo(ox + wa + 14, wy - 8); c.lineTo(ox + wa + 22, wy + 92); c.lineTo(ox + 6, wy + 96); c.lineTo(ox, wy + 70); c.lineTo(ox - 6, wy + 96); c.lineTo(ox - wa - 22, wy + 92); c.closePath(); c.fill();
  c.lineWidth = 3; c.strokeStyle = outlineOf(pr.trunks); c.stroke();
  c.fillStyle = pr.look === 'champ' ? '#e0b021' : shade(pr.trunks, 60); c.fillRect(ox - wa - 14, wy - 10, (wa + 14) * 2, 16);
  c.strokeRect(ox - wa - 14, wy - 10, (wa + 14) * 2, 16);
  // torso
  c.beginPath();
  c.moveTo(ox - sh, sy + 8);
  c.bezierCurveTo(ox - sh - 12, sy + 70, ox - wa - bel - 10, wy - 70, ox - wa, wy);
  c.lineTo(ox + wa, wy);
  c.bezierCurveTo(ox + wa + bel + 10, wy - 70, ox + sh + 12, sy + 70, ox + sh, sy + 8);
  c.quadraticCurveTo(ox, sy - 26, ox - sh, sy + 8); c.closePath();
  const bg2 = c.createLinearGradient(ox - sh, 0, ox + sh, 0);
  bg2.addColorStop(0, dark); bg2.addColorStop(.28, skin); bg2.addColorStop(.48, shade(skin, 22)); bg2.addColorStop(.8, shade(skin, -20)); bg2.addColorStop(1, dark);
  c.fillStyle = bg2; c.fill(); c.lineWidth = 3.5; c.strokeStyle = ol; c.stroke();
  // pecs
  for (const s of [-1, 1]) {
    const px = ox + s * sh * .42, py = sy + 46;
    c.fillStyle = 'rgba(70,25,5,.22)'; c.beginPath(); c.ellipse(px, py + 16, sh * .4, 14, 0, 0, Math.PI); c.fill();
    c.fillStyle = 'rgba(255,255,255,.16)'; c.beginPath(); c.ellipse(px - s * 6, py - 4, sh * .3, 14, 0, 0, 7); c.fill();
  }
  c.strokeStyle = 'rgba(70,25,5,.3)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(ox, sy + 20); c.lineTo(ox, sy + 70); c.stroke();
  // abs or belly
  if (b.belly > .5) {
    c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.ellipse(ox - 10, wy - 60, wa * .7, 36, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(70,25,5,.3)'; c.beginPath(); c.arc(ox, wy - 46, 5, 0, 7); c.stroke();
  } else {
    for (let r2 = 0; r2 < 3; r2++) for (const s of [-1, 1]) {
      const ax = ox + (s < 0 ? -26 : 4), ay = sy + 90 + r2 * 24;
      c.fillStyle = 'rgba(70,25,5,.16)'; rr(c, ax, ay, 22, 19, 8); c.fill();
      c.fillStyle = 'rgba(255,255,255,.13)'; rr(c, ax + 3, ay + 2, 15, 7, 4); c.fill();
    }
  }
  // traps and neck
  c.fillStyle = shade(skin, -10);
  c.beginPath(); c.moveTo(hx - 26, hy + 34); c.lineTo(hx + 26, hy + 34); c.lineTo(hx + 30 + sh * .25, sy + 6); c.quadraticCurveTo(hx, sy - 10, hx - 30 - sh * .25, sy + 6); c.closePath(); c.fill();
  c.lineWidth = 3; c.strokeStyle = ol; c.stroke();
  c.fillStyle = 'rgba(70,25,5,.25)'; c.beginPath(); c.ellipse(hx, hy + 50, 20, 7, 0, 0, 7); c.fill();
  if (pr.look === 'prof') {
    c.fillStyle = '#b3262f'; c.strokeStyle = '#5a0a10'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(hx, hy + 76); c.lineTo(hx - 26, hy + 63); c.lineTo(hx - 26, hy + 91); c.closePath();
    c.moveTo(hx, hy + 76); c.lineTo(hx + 26, hy + 63); c.lineTo(hx + 26, hy + 91); c.closePath(); c.fill(); c.stroke();
    sphere(c, hx, hy + 76, 7, 7, '#b3262f');
  }
  if (pr.look === 'disco') {
    c.strokeStyle = '#a0780a'; c.lineWidth = 8; c.beginPath(); c.arc(hx, hy + 60, 36, .35, Math.PI - .35); c.stroke();
    c.strokeStyle = '#ffd84a'; c.lineWidth = 5; c.stroke();
    sphere(c, hx, hy + 98, 9, 9, '#ffd84a');
  }
  if (pr.look === 'cap') { // mail satchel strap
    c.strokeStyle = '#6b4a2b'; c.lineWidth = 14; c.beginPath(); c.moveTo(ox - sh + 20, sy + 4); c.lineTo(ox + wa - 6, wy - 14); c.stroke();
    c.strokeStyle = outlineOf('#6b4a2b'); c.lineWidth = 2; c.stroke();
  }
  drawHead(c, pr, hx, hy, b.head, mood);
  for (const s of [-1, 1]) {
    const g = gl[s];
    arm(c, ox + s * (sh - 6), sy + 20, g.x, g.y, s, skin, b.arm);
    sphere(c, ox + s * (sh - 4), sy + 18, b.arm * .78, b.arm * .72, skin);
    glove(c, g.x, g.y, g.r, pr.glove, pr.cuff, ox + s * sh, sy + 20, g.glow);
  }
}

// ---------- player from behind ----------
function drawBack(c, px, py, gl) {
  const p = HERO, skin = p.skin, ol = outlineOf(skin), dark = shade(skin, -60);
  for (const s of [-1, 1]) {
    const g = gl[s];
    arm(c, px + s * 150, py + 500, g.x, g.y, s, skin, 46);
    glove(c, g.x, g.y, g.r, p.glove, p.cuff, px + s * 150, py + 500);
  }
  // V-shaped back
  c.beginPath();
  c.moveTo(px - 128, py + 660);
  c.bezierCurveTo(px - 140, py + 600, px - 186, py + 540, px - 172, py + 492);
  c.quadraticCurveTo(px - 150, py + 466, px - 60, py + 456);
  c.quadraticCurveTo(px, py + 448, px + 60, py + 456);
  c.quadraticCurveTo(px + 150, py + 466, px + 172, py + 492);
  c.bezierCurveTo(px + 186, py + 540, px + 140, py + 600, px + 128, py + 660); c.closePath();
  const tg = c.createLinearGradient(px - 180, 0, px + 180, 0);
  tg.addColorStop(0, dark); tg.addColorStop(.25, skin); tg.addColorStop(.45, shade(skin, 20)); tg.addColorStop(.75, shade(skin, -15)); tg.addColorStop(1, dark);
  c.fillStyle = tg; c.fill(); c.lineWidth = 3.5; c.strokeStyle = ol; c.stroke();
  // muscle shading
  c.save(); c.clip();
  for (const s of [-1, 1]) {
    c.fillStyle = 'rgba(70,25,5,.2)'; c.beginPath(); c.ellipse(px + s * 70, py + 540, 46, 56, s * .35, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.ellipse(px + s * 62, py + 520, 30, 36, s * .35, 0, 7); c.fill();
    c.fillStyle = 'rgba(70,25,5,.16)'; c.beginPath(); c.ellipse(px + s * 130, py + 580, 30, 70, s * -.3, 0, 7); c.fill();
  }
  c.restore();
  c.strokeStyle = 'rgba(70,25,5,.4)'; c.lineWidth = 4; c.beginPath(); c.moveTo(px, py + 486); c.lineTo(px, py + 640); c.stroke();
  // trunks
  const trg = c.createLinearGradient(px - 150, 0, px + 150, 0);
  trg.addColorStop(0, shade(p.trunks, -50)); trg.addColorStop(.4, shade(p.trunks, 25)); trg.addColorStop(1, shade(p.trunks, -60));
  c.fillStyle = trg; c.fillRect(px - 140, py + 588, 280, 70);
  c.fillStyle = '#fff'; c.fillRect(px - 140, py + 584, 280, 9);
  c.fillStyle = '#3cb043'; c.fillRect(px - 46, py + 584, 30, 9); c.fillStyle = '#e8463a'; c.fillRect(px + 16, py + 584, 30, 9);
  // deltoids
  for (const s of [-1, 1]) sphere(c, px + s * 152, py + 498, 40, 36, skin, s * -.3, -.5);
  // traps, neck and head
  c.fillStyle = shade(skin, -8);
  c.beginPath(); c.moveTo(px - 30, py + 430); c.lineTo(px + 30, py + 430); c.lineTo(px + 92, py + 470); c.quadraticCurveTo(px, py + 456, px - 92, py + 470); c.closePath(); c.fill();
  c.lineWidth = 3; c.strokeStyle = ol; c.stroke();
  for (const s of [-1, 1]) { c.fillStyle = skin; c.beginPath(); c.ellipse(px + s * 46, py + 428, 10, 14, 0, 0, 7); c.fill(); c.stroke(); }
  c.fillStyle = skin; c.beginPath(); c.ellipse(px, py + 420, 46, 52, 0, 0, 7); c.fill(); c.stroke();
  const hg = c.createLinearGradient(0, py + 330, 0, py + 450); hg.addColorStop(0, shade(p.hair, 40)); hg.addColorStop(1, p.hair);
  c.fillStyle = hg; c.strokeStyle = shade(p.hair, -60);
  c.beginPath(); c.moveTo(px - 48, py + 436);
  const pts = [[-52, 398], [-44, 376], [-50, 360], [-30, 356], [-30, 334], [-12, 344], [0, 320], [14, 342], [30, 330], [32, 352], [50, 356], [46, 378], [52, 398], [48, 436]];
  for (const [dx, y] of pts) c.lineTo(px + dx, py + y);
  c.quadraticCurveTo(px + 22, py + 448, px, py + 444); c.quadraticCurveTo(px - 22, py + 448, px - 48, py + 436); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 2;
  for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(px + i * 10, py + 352); c.lineTo(px + i * 12, py + 424); c.stroke(); }
}

// ---------- game state ----------
let scene = 'loading', loadT = 0, st = null, t = 0, paused = false, helpOpen = false;
let mode = 'career', defStreak = 0, ptr = { x: -1, y: -1 }, btns = [], sceneT = 0;
const keys = { up: false, block: false };
let oh = { x: CX, y: 168 };

function newFight(idx, sc) {
  const pr = ROSTER[idx];
  st = {
    pr, idx, sc, oHP: 100, pHP: 100, pow: 0, oKD: 0, pKD: 0, time: 180, phase: 'ready', pt: 0,
    o: { st: 'idle', t: 0, dur: 0, guard: 'high', guardT: 1.2, atkT: 1.8, side: 1, kind: 'hook', feint: false, chain: 0, res: false, open: false,
         hitSide: 0, hitKind: '', combo: 0, comboT: 0, fall: 0, fly: 0, flySide: 1, tight: false },
    p: { act: null, t: 0, dur: 0, hit: 0, side: 1, res: false, next: 1, dodge: null, dT: 0, block: false, fl: 0, flSide: 0, fall: 0 },
    og: { '-1': { x: CX - 52, y: 198, r: 42 }, '1': { x: CX + 52, y: 198, r: 42 } },
    fx: [], pops: [], shake: 0, flash: 0, count: 0, ct: 0, mash: 0, need: 0, getUp: 0, res: null, slow: 0,
  };
  scene = 'fight'; paused = false;
}

function startCareer() { mode = 'career'; const idx = Math.min(save.beaten, ROSTER.length - 1); toVs(idx); }
function startDefense() { mode = 'defense'; defStreak = 0; toVs((Math.random() * ROSTER.length) | 0); }
let vsIdx = 0;
function toVs(idx) { vsIdx = idx; scene = 'vs'; sceneT = 0; sfx.cheer(); }
function scaleFor() { return mode === 'defense' ? 1 + defStreak * .12 + .15 : 1; }

function pop(txt, x, y, col = '#ffe14a', size = 30) { st.pops.push({ txt, x, y, t: 0, col, size }); }
function sparks(x, y, n, big) {
  for (let i = 0; i < n; i++) st.fx.push({ x, y, vx: R(-1, 1) * (big ? 520 : 320), vy: R(-1, 1) * (big ? 420 : 260), life: R(.3, .55), c: Math.random() < .5 ? '#fff6c0' : '#ffd23a' });
  st.fx.push({ x, y, burst: true, life: big ? .32 : .2, big });
}

// ---------- player actions ----------
function pOff() {
  const p = st.p; let x = 0, y = 0;
  if (p.dT > 0) {
    const k = Math.sin(Math.PI * (1 - p.dT / DODGE));
    if (p.dodge === 'L') x = -160 * k; else if (p.dodge === 'R') x = 160 * k; else y = 110 * k;
  }
  if (p.fl > 0) x += -p.flSide * 30 * (p.fl / .4);
  return { x, y };
}
function canAct() { const p = st.p; return st.phase === 'live' && !paused && !p.act && p.dT <= 0 && p.fl <= 0; }
function punch(kind) {
  if (scene !== 'fight' || paused) return;
  if (st.phase === 'pDown') { st.mash++; sfx.click(); return; }
  if (!canAct() || keys.block) return;
  const p = st.p;
  p.next *= -1;
  p.act = kind; p.side = p.next; p.t = 0; p.res = false;
  if (kind === 'jab') { p.dur = .26; p.hit = .11; } else { p.dur = .42; p.hit = .21; }
  sfx.whoosh();
}
function superPunch() {
  if (scene !== 'fight' || !canAct() || st.pow < 100) return;
  const p = st.p; p.act = 'super'; p.side = 1; p.t = 0; p.dur = .72; p.hit = .42; p.res = false; st.pow = 0;
  pop('SUPER PUNCH!', CX, 300, '#ffe14a', 38);
}
function dodge(dir) {
  if (scene !== 'fight' || !canAct()) return;
  st.p.dodge = dir; st.p.dT = DODGE;
}

function landPunch() {
  const o = st.o, p = st.p, k = p.act;
  const base = { jab: 4, hook: 7.5, super: 24 }[k];
  let m = 1, label = '', blocked = false;
  if (k !== 'super') {
    if (o.st === 'recover' && o.open) { m = 1.8; label = 'COUNTER!'; }
    else if (o.st === 'windup') {
      if (p.side === o.side) { m = 1.3; if (k === 'hook') label = 'INTERRUPT!'; } else blocked = true;
    } else if (o.st === 'idle') {
      if (o.guard === 'tight') blocked = true;
      else if (o.guard === 'high' && k === 'jab') blocked = true;
    }
  }
  const hx = oh.x + p.side * 26, hy = oh.y + 6;
  if (blocked) {
    sfx.block(); pop('BLOCKED', hx, hy - 60, '#d8e6ff', 22);
    st.fx.push({ x: hx, y: hy + 20, burst: true, life: .12, small: true });
    o.combo = 0;
    if (o.st === 'idle' && Math.random() < .5) startAttack(true);
    return;
  }
  const dmg = base * m / (st.pr.hp * st.sc);
  st.oHP -= dmg;
  st.pow = Math.min(100, st.pow + (k === 'jab' ? 6 : k === 'hook' ? 10 : 0) * (m > 1 ? 1.6 : 1));
  const interrupted = o.st === 'windup';
  o.st = 'stagger'; o.t = 0; o.dur = k === 'jab' ? .22 : k === 'hook' ? .36 : .7; o.hitSide = p.side; o.hitKind = k;
  if (interrupted && k === 'hook') o.chain = 0;
  o.combo++; o.comboT = 1.3;
  if (o.combo >= 3) { o.tight = true; o.combo = 0; }
  sparks(hx, hy, k === 'super' ? 26 : 12, k !== 'jab');
  st.shake = k === 'super' ? 18 : k === 'hook' ? 8 : 4;
  (k === 'jab' ? sfx.light : k === 'super' ? sfx.big : sfx.hit)();
  if (label) pop(label, oh.x, oh.y - 90, '#ffe14a', 32);
  if (st.oHP <= 0) { st.oHP = 0; oKnock(k === 'super'); }
}

// ---------- opponent ----------
function pickKind(mix) { const r = Math.random(); return r < mix.hook ? 'hook' : r < mix.hook + mix.jab ? 'jab' : 'upper'; }
function startAttack(quick) {
  const o = st.o, pr = st.pr;
  o.side = Math.random() < .5 ? -1 : 1; o.kind = pickKind(pr.mix);
  o.feint = !quick && Math.random() < pr.feint;
  o.st = 'windup'; o.t = 0;
  const wind = pr.wind / Math.min(1.6, st.sc);
  o.dur = quick ? .3 : wind + (o.kind === 'upper' ? .14 : o.kind === 'jab' ? -.1 : 0);
  if (o.feint) o.dur *= .6;
}
function updOpp(dt) {
  const o = st.o, pr = st.pr;
  o.t += dt; o.comboT -= dt; if (o.comboT <= 0) o.combo = 0;
  if (o.st === 'idle') {
    o.guardT -= dt;
    if (o.guardT <= 0) { o.guard = Math.random() < pr.high ? 'high' : 'low'; o.guardT = R(.7, 1.8); }
    o.atkT -= dt;
    if (o.atkT <= 0) { if (Math.random() < .5 && st.oHP < 30) { o.guard = 'tight'; o.guardT = .6; } startAttack(false); }
  } else if (o.st === 'windup') {
    if (o.t >= o.dur) {
      if (o.feint) { o.st = 'idle'; o.t = 0; o.atkT = .35; o.guard = 'high'; }
      else { o.st = 'strike'; o.t = 0; o.dur = .17; o.res = false; sfx.whoosh(); }
    }
  } else if (o.st === 'strike') {
    if (!o.res && o.t >= .12) { o.res = true; resolveOpp(); }
  } else if (o.st === 'recover') {
    if (o.t >= o.dur) {
      o.open = false;
      if (o.chain > 0) { o.chain--; startAttack(true); }
      else { o.st = 'idle'; o.t = 0; o.atkT = R(pr.gap[0], pr.gap[1]) / Math.min(1.5, st.sc); }
    }
  } else if (o.st === 'stagger') {
    o.atkT -= dt * .6;
    if (o.t >= o.dur) {
      o.st = 'idle'; o.t = 0; o.atkT = Math.max(o.atkT, .25);
      if (o.tight) { o.guard = 'tight'; o.guardT = 1.3; o.tight = false; }
    }
  }
}
function resolveOpp() {
  const p = st.p, o = st.o, pr = st.pr;
  let dmg = pr.dmg * st.sc * { hook: 1, jab: .7, upper: 1.45 }[o.kind];
  const prog = p.dT > 0 ? 1 - p.dT / DODGE : -1;
  const active = prog > .05 && prog < .88;
  let dodged = false;
  if (active) {
    if (o.kind === 'hook') dodged = p.dodge === 'D' || (p.dodge === 'L' && o.side === 1) || (p.dodge === 'R' && o.side === -1);
    else if (o.kind === 'jab') dodged = true;
    else dodged = p.dodge !== 'D';
  }
  if (dodged) {
    o.st = 'recover'; o.t = 0;
    if (o.chain > 0) { o.dur = .12; o.open = false; }
    else { o.dur = pr.open; o.open = true; pop('MISS!', CX, 250, '#9fe0ff', 26); }
    st.pow = Math.min(100, st.pow + 8);
    return;
  }
  if (p.block) {
    dmg *= o.kind === 'upper' ? .6 : .15;
    sfx.block(); pop('BLOCK', CX, 330, '#d8e6ff', 22);
    st.pow = Math.min(100, st.pow + 2); o.chain = 0;
  } else {
    p.fl = .4; p.act = null; p.flSide = o.side; st.shake = 14; st.flash = .22; sfx.hurt();
    o.chain = Math.max(0, o.chain - 1);
  }
  st.pHP -= dmg;
  o.st = 'recover'; o.t = 0; o.dur = .4; o.open = false;
  if (st.pHP <= 0) { st.pHP = 0; pKnock(); }
}

// ---------- knockdowns ----------
function oKnock(isSuper) {
  const o = st.o;
  st.oKD++; st.phase = 'oDown'; st.pt = 0; st.count = 0; st.ct = -1;
  o.st = 'down'; o.fall = 0; o.fly = 0; o.flySide = st.p.side || 1;
  st.p.act = null;
  const final = st.oKD >= 3;
  st.getUp = final ? 99 : st.oKD === 1 ? 4 : (Math.random() < .25 ? 99 : 7);
  if (isSuper || final || st.getUp > 10) { o.fly = .001; st.slow = 1; }
  sfx.cheer(); pop('KNOCKDOWN!', CX, 260, '#ffe14a', 46);
}
function pKnock() {
  st.pKD++; st.phase = 'pDown'; st.pt = 0; st.count = 0; st.ct = -1; st.mash = 0;
  st.need = 12 + st.pKD * 8; st.p.act = null; st.p.dT = 0;
  st.o.st = 'idle'; st.o.atkT = 99; sfx.big(); sfx.cheer();
}
function endFight(how, won) {
  st.phase = 'end'; st.pt = 0; st.res = { how, won, time: 180 - st.time };
  sfx.bell(); if (won) sfx.cheer();
  if (won) {
    if (mode === 'career') {
      if (st.idx >= save.beaten) save.beaten = Math.min(ROSTER.length, st.idx + 1);
      if (st.idx === ROSTER.length - 1) save.champ = true;
    } else { defStreak++; save.bestDef = Math.max(save.bestDef, defStreak); }
    persist();
  }
}
function decision() {
  const score = (st.oKD - st.pKD) * 40 + (st.pHP - st.oHP);
  endFight('DECISION', score >= 0);
}

// ---------- update ----------
function update(dt) {
  if (st.slow > 0) { st.slow -= dt; dt *= .35; }
  st.pt += dt;
  const p = st.p, o = st.o;
  // effects
  for (const f of st.fx) { f.life -= dt; if (f.vx) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 600 * dt; } }
  st.fx = st.fx.filter(f => f.life > 0);
  for (const q of st.pops) q.t += dt;
  st.pops = st.pops.filter(q => q.t < 1);
  st.shake *= .86; st.flash = Math.max(0, st.flash - dt);
  if (p.fl > 0) p.fl -= dt;
  if (p.dT > 0) { p.dT -= dt; if (p.dT <= 0) { p.dT = 0; p.dodge = null; } }
  p.block = keys.block && !p.act && p.dT <= 0 && p.fl <= 0 && st.phase === 'live';
  if (p.act) {
    p.t += dt;
    if (!p.res && p.t >= p.hit) { p.res = true; if (st.phase === 'live') landPunch(); }
    if (p.t >= p.dur) p.act = null;
  }
  p.fall = st.phase === 'pDown' || (st.phase === 'end' && st.res && !st.res.won && st.res.how !== 'DECISION')
    ? Math.min(1, p.fall + dt * 2.5) : Math.max(0, p.fall - dt * 3);

  if (st.phase === 'ready') {
    if (st.pt > 2.4) { st.phase = 'live'; st.pt = 0; sfx.bell(); }
    return;
  }
  if (st.phase === 'live') {
    st.time -= dt;
    if (st.time <= 0) { st.time = 0; decision(); return; }
    updOpp(dt);
    return;
  }
  if (st.phase === 'oDown') {
    if (o.fly > 0) o.fly = Math.min(1, o.fly + dt * 1.4); else o.fall = Math.min(1, o.fall + dt * 2.4);
    st.ct += dt;
    if (st.ct >= 1) {
      st.ct -= 1; st.count++; sfx.tick();
      if (st.oKD >= 3 && st.count >= 3) { endFight('TKO', true); return; }
      if (st.count >= 10) { endFight('KO', true); return; }
      if (st.count >= st.getUp) {
        st.oHP = st.oKD === 1 ? 60 : 40; st.phase = 'live'; o.st = 'idle'; o.fall = 0; o.fly = 0;
        o.guard = 'tight'; o.guardT = 1.5; o.atkT = 1.4; o.combo = 0;
        pop("HE'S UP!", CX, 250, '#ffffff', 34);
      }
    }
    return;
  }
  if (st.phase === 'pDown') {
    st.ct += dt;
    if (st.ct >= 1) {
      st.ct -= 1; st.count++; sfx.tick();
      if (st.pKD >= 3 && st.count >= 3) { endFight('TKO', false); return; }
      if (st.count >= 10) { endFight('KO', false); return; }
    }
    if (st.pKD < 3 && st.mash >= st.need && st.count >= 2) {
      st.pHP = Math.max(25, 60 - st.pKD * 15); st.phase = 'live';
      o.st = 'idle'; o.atkT = 1.6; o.guard = 'high';
      pop('BACK UP!', CX, 300, '#9fe0ff', 34);
    }
    return;
  }
  if (st.phase === 'end') {
    if (o.fly > 0 && o.fly < 1) o.fly = Math.min(1, o.fly + dt * 1.4);
    if (st.pt > 2.8) { scene = 'result'; sceneT = 0; }
  }
}

// ---------- fight render ----------
let flashes = [];
function drawCrowdFlashes(dt) {
  if (Math.random() < (scene === 'fight' && st && st.phase === 'oDown' ? .5 : .08)) flashes.push({ x: R(10, W - 10), y: R(60, 280), life: .12 });
  for (const f of flashes) {
    f.life -= dt;
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 26);
    g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(f.x - 26, f.y - 26, 52, 52);
  }
  flashes = flashes.filter(f => f.life > 0);
}

function oppGloveTargets(ox, hy) {
  const o = st.o, out = {};
  for (const s of [-1, 1]) {
    const gd = { high: [74, 62, 40], low: [92, 146, 40], tight: [40, 50, 44] }[o.guard] || [74, 62, 40];
    let x = ox + s * gd[0], y = hy + gd[1], r = gd[2], glow = null;
    if (o.st === 'windup' && s === o.side) {
      const k = E(o.t / .22), sh = Math.sin(t * 70) * 3 * k;
      if (o.kind === 'hook') { x = L(x, ox + s * 178 + sh, k); y = L(y, hy + 44, k); r = L(r, 36, k); }
      else if (o.kind === 'jab') { x = L(x, ox + s * 44 + sh, k); y = L(y, hy + 58, k); r = L(r, 33, k); }
      else { x = L(x, ox + s * 96 + sh, k); y = L(y, hy + 220, k); r = L(r, 38, k); }
      const blink = Math.floor(t * 14) % 2 === 0;
      if (!o.feint || o.t > .1) glow = o.kind === 'upper' ? (blink ? '#ffc61a' : '#ffe46a') : o.kind === 'hook' ? (blink ? '#ff2a1f' : '#ff7a6e') : '#ffffff';
    } else if (o.st === 'strike' && s === o.side) {
      const k = Math.min(1, o.t / .12);
      let sx, sy, tx, ty, tr;
      if (o.kind === 'hook') { sx = ox + s * 178; sy = hy + 44; tx = CX + s * 30; ty = 372; tr = 104; }
      else if (o.kind === 'jab') { sx = ox + s * 44; sy = hy + 58; tx = CX + s * 12; ty = 365; tr = 108; }
      else { sx = ox + s * 96; sy = hy + 220; tx = CX + s * 10; ty = 330; tr = 110; }
      x = L(sx, tx, k) + (o.kind === 'hook' ? s * 110 * Math.sin(Math.PI * k) : 0);
      y = L(sy, ty, k); r = L(36, tr, k * k);
    } else if (o.st === 'recover') {
      if (o.open) { x = ox + s * 118; y = hy + 158; r = 40; }
    } else if (o.st === 'stagger') { x = ox + s * 100; y = hy + 115; r = 40; }
    else if (o.st === 'down') { x = ox + s * 150; y = hy + 150; r = 38; }
    out[s] = { x, y, r, glow };
  }
  return out;
}

function drawFight(dt) {
  const o = st.o, p = st.p;
  const off = pOff();
  ctx.save();
  if (st.shake > .5) ctx.translate(R(-1, 1) * st.shake, R(-1, 1) * st.shake);
  ctx.drawImage(bg, 0, 0);
  drawCrowdFlashes(dt);

  // opponent placement
  const bob = Math.sin(t * 3.2) * 5;
  let ox = CX + Math.sin(t * 1.3) * 12 - off.x * .22;
  let hx = ox, hy = 168 + bob;
  const hurt = o.st === 'stagger' || o.st === 'down' || (o.st === 'recover' && o.open && o.t < .3);
  if (o.st === 'stagger') {
    const k = 1 - o.t / o.dur;
    if (o.hitKind === 'hook') hx += -o.hitSide * 32 * k;
    else if (o.hitKind === 'super') { hy -= 30 * k; hx += -o.hitSide * 20 * k; }
    else hy -= 8 * k;
  }
  if (o.st === 'windup') hx += o.side * 6;
  if (o.st === 'strike') hx += o.side * -10;
  oh = { x: hx, y: hy };

  const tg = oppGloveTargets(ox, hy);
  const snap = o.st === 'strike';
  const rate = snap ? 1 : 1 - Math.exp(-dt * 20);
  for (const s of [-1, 1]) {
    const g = st.og[s], tt = tg[s];
    g.x = L(g.x, tt.x, rate); g.y = L(g.y, tt.y, rate); g.r = L(g.r, tt.r, rate); g.glow = tt.glow;
  }

  ctx.save();
  if (o.fall > 0 || o.fly > 0) {
    ctx.translate(ox, 560);
    if (o.fly > 0) {
      const k = o.fly;
      ctx.translate(o.flySide * 130 * k, -250 * Math.sin(Math.PI * Math.min(1, k * 1.1)));
      ctx.rotate(o.flySide * .55 * k);
      const s2 = 1 - .45 * k; ctx.scale(s2, s2 * (1 - .35 * Math.max(0, k - .8) * 5));
    } else {
      ctx.scale(1 - .12 * o.fall, 1 - .5 * o.fall);
    }
    ctx.translate(-ox, -560);
  }
  ctx.fillStyle = 'rgba(0,10,40,.35)'; ctx.beginPath(); ctx.ellipse(ox, hy + 488, 150, 26, 0, 0, 7); ctx.fill();
  drawFront(ctx, st.pr, ox, hy, hx, st.og, hurt ? 'hurt' : 'norm', true);
  if (o.st === 'down') {
    for (let i = 0; i < 4; i++) { const a = t * 4 + i * Math.PI / 2; star(ctx, hx + Math.cos(a) * 60, hy - 50 + Math.sin(a) * 14, 9, '#ffe14a'); }
  }
  ctx.restore();

  // player
  const px = CX + off.x, py = off.y + p.fall * 220 + 26;
  const pb = Math.sin(t * 3.2 + 1.2) * 4;
  const pg = {};
  for (const s of [-1, 1]) {
    let x = px + s * 90, y = py + 430 + pb, r = 46;
    if (p.block) { x = px + s * 34; y = py + 398; r = 52; }
    if (p.dodge === 'D' && p.dT > 0) { x = px + s * 70; y = py + 420; }
    if (p.fl > 0) { x = px + s * 120; y = py + 470; }
    if (p.act && s === p.side) {
      const k = p.t < p.hit ? E(p.t / p.hit) : 1 - E((p.t - p.hit) / (p.dur - p.hit));
      if (p.act === 'jab') { x = L(x, hx + s * 22, k); y = L(y, hy + 8, k); r = L(r, 26, k); }
      else if (p.act === 'hook') {
        const ex = hx + s * 30, ey = hy + 4, cx2 = px + s * 210, cy2 = hy + 70;
        const u = k; x = (1 - u) * (1 - u) * x + 2 * (1 - u) * u * cx2 + u * u * ex;
        y = (1 - u) * (1 - u) * y + 2 * (1 - u) * u * cy2 + u * u * ey; r = L(r, 28, u);
      } else if (p.act === 'super') {
        if (p.t < .3) { const w = E(p.t / .3); x = L(x, px + s * 160, w); y = L(y, py + 540, w); r = L(r, 54, w); }
        else { const w = p.t < p.hit ? E((p.t - .3) / (p.hit - .3)) : 1 - E((p.t - p.hit) / (p.dur - p.hit));
          const sx = px + s * 160, sy = py + 540; x = L(sx, hx, w); y = L(sy, hy + 14, w); r = L(54, 32, w); }
      }
    }
    if (st.phase === 'end' && st.res && st.res.won && st.pt > .6) {
      const w = E((st.pt - .6) / .4);
      if (s === 1) { x = L(x, px + 46, w); y = L(y, py + 130, w); r = L(r, 40, w); }
      else { x = L(x, px - 130, w); y = L(y, py + 530, w); }
    }
    pg[s] = { x, y, r };
  }
  drawBack(ctx, px, py, pg);

  // effects
  for (const f of st.fx) {
    if (f.burst) {
      const k = f.life / (f.big ? .32 : .2);
      ctx.save(); ctx.globalAlpha = k;
      burst(ctx, f.x, f.y, (f.small ? 30 : f.big ? 90 : 60) * (1.2 - k * .4), (f.small ? 14 : f.big ? 40 : 26), 9, f.small ? '#cfe0ff' : '#fffbe0', null, t);
      ctx.restore();
    } else { ctx.fillStyle = f.c; ctx.globalAlpha = Math.min(1, f.life * 3); ctx.fillRect(f.x - 2, f.y - 2, 5, 5); ctx.globalAlpha = 1; }
  }
  ctx.restore();

  if (st.flash > 0) { ctx.fillStyle = `rgba(255,40,40,${st.flash * 1.4})`; ctx.fillRect(0, 0, W, H); }
  drawHud();

  // popups
  for (const q of st.pops) {
    const k = q.t, s = q.t < .12 ? .6 + q.t * 4 : 1;
    ctx.save(); ctx.globalAlpha = 1 - Math.max(0, k - .6) / .4; ctx.translate(q.x, q.y - k * 40); ctx.scale(s, s);
    outlineText(q.txt, 0, 0, q.size, q.col, '#3a1206'); ctx.restore();
  }

  // center messages
  if (st.phase === 'ready') {
    const word = st.pt < 1.5 ? 'READY?' : 'FIGHT!';
    const k = st.pt < 1.5 ? st.pt : st.pt - 1.5;
    bigBurstText(word, Math.min(1, .5 + k * 3));
  }
  if (st.phase === 'oDown' || st.phase === 'pDown') {
    if (st.count > 0) { ctx.save(); ctx.translate(CX, 240); const s = 1 + Math.max(0, .4 - st.ct) ; ctx.scale(s, s); outlineText(String(st.count), 0, 0, 110, '#ffffff', '#1a1a2a'); ctx.restore(); }
  }
  if (st.phase === 'pDown') {
    ctx.fillStyle = 'rgba(20,0,0,.35)'; ctx.fillRect(0, 0, W, H);
    if (st.pKD < 3) {
      outlineText('MASH X TO GET UP!', CX, 360, 32, '#ffe14a', '#3a1206');
      ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(ctx, CX - 160, 390, 320, 22, 11); ctx.fill();
      ctx.fillStyle = '#4ee06a'; rr(ctx, CX - 156, 394, 312 * Math.min(1, st.mash / st.need), 14, 7); ctx.fill();
    }
  }
  if (st.phase === 'end' && st.pt > .3) {
    const txt = st.res.how === 'DECISION' ? 'TIME!' : st.res.how === 'TKO' ? 'T.K.O.!' : 'K.O.!';
    bigBurstText(txt, Math.min(1, (st.pt - .3) * 3));
  }
  if (paused) drawPause();
}

function outlineText(txt, x, y, size, fill, stroke) {
  ctx.font = `${size}px Bungee, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(4, size / 6); ctx.strokeStyle = stroke; ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill; ctx.fillText(txt, x, y);
}
function bigBurstText(txt, s) {
  ctx.save(); ctx.translate(CX, 250); ctx.scale(s, s);
  burst(ctx, 0, 0, 120, 80, 14, 'rgba(255,214,90,.9)', null, t * .3);
  const g = ctx.createLinearGradient(0, -40, 0, 40); g.addColorStop(0, '#fff3a6'); g.addColorStop(1, '#ff9a1f');
  outlineText(txt, 0, 0, 78, g, '#7a2a06');
  ctx.restore();
}

function bar(x, y, w, h, frac, col, track = 'rgba(220,220,230,.35)') {
  ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(ctx, x - 3, y - 3, w + 6, h + 6, 6); ctx.fill();
  ctx.fillStyle = track; ctx.fillRect(x, y, w, h);
  const fh = h * C(frac, 0, 1);
  const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, shade(col, 50)); g.addColorStop(1, col);
  ctx.fillStyle = g; ctx.fillRect(x, y + h - fh, w, fh);
}
function portrait(pr, x, y, r) {
  ctx.save();
  ctx.fillStyle = '#e9eef7'; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#2b3550'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip();
  drawHead(ctx, pr, x, y + r * .25, r * .78, 'norm');
  ctx.restore();
}
function dots(x, y, n) {
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = 'rgba(235,240,255,.85)'; ctx.beginPath(); ctx.arc(x + i * 22, y, 8, 0, 7); ctx.fill();
    ctx.fillStyle = i < n ? '#e3262f' : 'rgba(120,150,200,.6)'; ctx.beginPath(); ctx.arc(x + i * 22, y, 5.5, 0, 7); ctx.fill();
  }
}
function logo(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(-.06);
  burst(ctx, 0, 0, 92, 66, 16, '#c9a25a', '#7a5a22');
  const g = ctx.createLinearGradient(0, -30, 0, 30); g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#ff8a1c');
  outlineText('KNOCKOUT', 0, -16, 26, g, '#8a2a08');
  outlineText('ALLEY', 0, 16, 30, g, '#8a2a08');
  ctx.restore();
}
function drawHud() {
  logo(92, 70, .9);
  // timer
  const tm = Math.ceil(st.time), mm = String(Math.floor(tm / 60)).padStart(2, '0'), ss = String(tm % 60).padStart(2, '0');
  ctx.font = '16px Bungee, Impact, sans-serif'; ctx.textAlign = 'right'; ctx.lineWidth = 4; ctx.strokeStyle = '#1a1a2a';
  ctx.strokeText('TIME', W - 22, 26); ctx.fillStyle = '#fff'; ctx.fillText('TIME', W - 22, 26);
  ctx.font = '46px Bungee, Impact, sans-serif'; ctx.lineWidth = 8; ctx.strokeText(`${mm}:${ss}`, W - 20, 64); ctx.fillText(`${mm}:${ss}`, W - 20, 64);
  // opponent side (left)
  bar(52, 160, 16, 270, st.oHP / 100, '#d8262d');
  portrait(st.pr, 60, 478, 26); dots(38, 524, st.oKD);
  // player side (right)
  bar(726, 160, 16, 270, st.pHP / 100, '#d8262d');
  bar(750, 196, 12, 234, st.pow / 100, st.pow >= 100 ? (Math.floor(t * 8) % 2 ? '#fff27a' : '#ffd21f') : '#ffd21f');
  portrait(HERO, 740, 478, 26); dots(718, 524, st.pKD);
  if (st.pow >= 100 && st.phase === 'live') outlineText('SPACE!', 744, 140, 16, '#ffe14a', '#3a1206');
  // name
  ctx.font = '600 15px "Baloo 2", system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText(mode === 'defense' ? `Title Defense #${defStreak + 1}` : `Fight ${st.idx + 1} of ${ROSTER.length}`, 26, 150 - 14);
  // pause and sound buttons
  if (scene === 'fight') {
    iconBtn(W - 92, H - 46, 'pause', () => { paused = true; });
    iconBtn(W - 50, H - 46, muted ? 'muted' : 'sound', toggleMute);
    iconBtn(W - 134, H - 46, 'full', toggleFs);
  }
  watermark();
}
function iconBtn(x, y, kind, fn) {
  const hov = inside(ptr, x, y, 34, 34);
  ctx.fillStyle = hov ? '#ffb43a' : '#f08a14'; rr(ctx, x, y, 34, 34, 7); ctx.fill();
  ctx.strokeStyle = '#7a3a06'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = '#3a1a04';
  if (kind === 'pause') { ctx.fillRect(x + 11, y + 9, 5, 16); ctx.fillRect(x + 19, y + 9, 5, 16); }
  else if (kind === 'full') {
    ctx.strokeStyle = '#3a1a04'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(x + 8, y + 15); ctx.lineTo(x + 8, y + 8); ctx.lineTo(x + 15, y + 8);
    ctx.moveTo(x + 19, y + 8); ctx.lineTo(x + 26, y + 8); ctx.lineTo(x + 26, y + 15);
    ctx.moveTo(x + 26, y + 19); ctx.lineTo(x + 26, y + 26); ctx.lineTo(x + 19, y + 26);
    ctx.moveTo(x + 15, y + 26); ctx.lineTo(x + 8, y + 26); ctx.lineTo(x + 8, y + 19); ctx.stroke();
  }
  else {
    ctx.beginPath(); ctx.moveTo(x + 8, y + 13); ctx.lineTo(x + 13, y + 13); ctx.lineTo(x + 19, y + 8); ctx.lineTo(x + 19, y + 26); ctx.lineTo(x + 13, y + 21); ctx.lineTo(x + 8, y + 21); ctx.fill();
    ctx.strokeStyle = '#3a1a04'; ctx.lineWidth = 2.5; ctx.beginPath();
    if (kind === 'sound') { ctx.arc(x + 20, y + 17, 6, -1, 1); ctx.stroke(); }
    else { ctx.moveTo(x + 22, y + 12); ctx.lineTo(x + 29, y + 22); ctx.moveTo(x + 29, y + 12); ctx.lineTo(x + 22, y + 22); ctx.stroke(); }
  }
  btns.push({ x, y, w: 34, h: 34, fn });
}
function toggleMute() { muted = !muted; store.set('ka-mute', muted); if (!muted) audio(); }


function toggleFs() {
  const f = cv.parentElement;
  try {
    const r = document.fullscreenElement ? document.exitFullscreen() : f.requestFullscreen();
    if (r && r.catch) r.catch(() => {});
  } catch {}
}
function watermark() {
  ctx.save();
  ctx.font = '22px "Lilita One", "Arial Black", Impact, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#5a1e00'; ctx.strokeText('GIANTCLIP', 16, H - 16);
  const g = ctx.createLinearGradient(0, H - 38, 0, H - 14); g.addColorStop(0, '#ffd23a'); g.addColorStop(1, '#ff7a10');
  ctx.fillStyle = g; ctx.fillText('GIANTCLIP', 16, H - 16);
  ctx.restore();
}
function drawLoading(dt) {
  loadT += dt;
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d2350'); g.addColorStop(1, '#03091a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = .08; for (let i = 0; i < 12; i++) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(CX, 250, 60 + i * 40, 0, 7); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); } ctx.restore();
  ctx.save();
  ctx.font = '78px "Lilita One", "Arial Black", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 12; ctx.strokeStyle = '#5a1e00'; ctx.strokeText('GIANTCLIP', CX, 230);
  const lg = ctx.createLinearGradient(0, 195, 0, 265); lg.addColorStop(0, '#ffe066'); lg.addColorStop(.5, '#ff9a10'); lg.addColorStop(1, '#e2500a');
  ctx.fillStyle = lg; ctx.fillText('GIANTCLIP', CX, 230);
  ctx.font = '18px Bungee, Impact, sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText('FREE ONLINE GAMES', CX, 285);
  ctx.restore();
  const k = Math.min(1, loadT / 2.4), bw = 360, bx = CX - bw / 2, by = 360;
  ctx.fillStyle = '#0a1530'; rr(ctx, bx - 4, by - 4, bw + 8, 30, 15); ctx.fill();
  ctx.strokeStyle = '#4b93e0'; ctx.lineWidth = 2; ctx.stroke();
  const pg = ctx.createLinearGradient(0, by, 0, by + 22); pg.addColorStop(0, '#ffd27a'); pg.addColorStop(.5, '#ff8a00'); pg.addColorStop(1, '#e25f00');
  ctx.fillStyle = pg; rr(ctx, bx, by, Math.max(22, bw * k), 22, 11); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(ctx, bx + 4, by + 3, Math.max(14, bw * k - 8), 6, 3); ctx.fill();
  ctx.font = 'bold 15px Verdana, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#cfe0ff';
  ctx.fillText(k < 1 ? `Loading Knockout Alley... ${Math.floor(k * 100)}%` : 'Ready!', CX, 420);
  if (loadT > 2.7) { scene = 'title'; }
}

// ---------- buttons ----------
function inside(pt, x, y, w, h) { return pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h; }
function button(label, x, y, w, h, fn, opts = {}) {
  const dis = opts.disabled, hov = !dis && inside(ptr, x - w / 2, y - h / 2, w, h);
  ctx.save(); ctx.translate(x, y); if (hov) ctx.scale(1.05, 1.05);
  ctx.fillStyle = '#5a2306'; rr(ctx, -w / 2, -h / 2 + 5, w, h, 14); ctx.fill();
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  if (dis) { g.addColorStop(0, '#b5b5b5'); g.addColorStop(1, '#7c7c7c'); } else { g.addColorStop(0, '#ffc04a'); g.addColorStop(1, '#f07a10'); }
  ctx.fillStyle = g; rr(ctx, -w / 2, -h / 2, w, h, 14); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = dis ? '#555' : '#fff1c4'; rr(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 10); ctx.stroke();
  outlineText(label, 0, 2, opts.size || Math.min(36, h * .5), '#ffffff', dis ? '#444' : '#7a2a06');
  ctx.restore();
  if (!dis) btns.push({ x: x - w / 2, y: y - h / 2, w, h, fn, primary: opts.primary });
}

// ---------- scenes ----------
function drawTitle(dt) {
  ctx.drawImage(bg, 0, 0); drawCrowdFlashes(dt);
  ctx.fillStyle = 'rgba(8,12,30,.62)'; ctx.fillRect(0, 0, W, H);
  // fighters flanking the logo
  const b = Math.sin(t * 3) * 4;
  ctx.save(); ctx.translate(150, 120 + b); ctx.scale(.78, .78);
  drawFront(ctx, HERO, 0, 120, 0, { '-1': { x: -50, y: 160, r: 44 }, '1': { x: 56, y: 140, r: 44 } }, 'grin', true);
  ctx.restore();
  const champ = ROSTER[save.champ ? (Math.floor(t / 4) % ROSTER.length) : Math.min(save.beaten, ROSTER.length - 1)];
  ctx.save(); ctx.translate(650, 120 - b); ctx.scale(.78, .78);
  drawFront(ctx, champ, 0, 120, 0, { '-1': { x: -56, y: 140, r: 44 }, '1': { x: 50, y: 160, r: 44 } }, 'norm', true);
  ctx.restore();
  ctx.save(); ctx.translate(CX, 200); ctx.rotate(-.05);
  burst(ctx, 0, 0, 200, 140, 18, '#ffcc4a', '#a24a08', t * .1);
  const g = ctx.createLinearGradient(0, -60, 0, 60); g.addColorStop(0, '#fff2a8'); g.addColorStop(1, '#ff8a1c');
  outlineText('KNOCKOUT', 0, -34, 62, g, '#8a2a08');
  outlineText('ALLEY', 0, 36, 74, g, '#8a2a08');
  ctx.restore();
  button('PLAY ▶', CX, 392, 250, 76, startCareer, { primary: true, size: 40 });
  button('TITLE DEFENSE ▶', CX, 476, 250, 50, startDefense, { disabled: !save.champ, size: 20 });
  if (!save.champ) { ctx.font = '600 14px "Baloo 2", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#c9d4ea'; ctx.fillText('Beat the champion to unlock Title Defense', CX, 516); }
  else if (save.bestDef) { ctx.font = '600 14px "Baloo 2", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe08a'; ctx.fillText(`Longest reign: ${save.bestDef} defenses`, CX, 516); }
  // ladder progress
  for (let i = 0; i < ROSTER.length; i++) {
    const x = CX - 120 + i * 60, y = 560;
    ctx.save(); ctx.globalAlpha = i < save.beaten ? 1 : .5;
    portrait(ROSTER[i], x, y, 20);
    if (i < save.beaten) { ctx.strokeStyle = '#4ee06a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x - 2, y + 8); ctx.lineTo(x + 11, y - 9); ctx.stroke(); }
    ctx.restore();
  }
  iconBtn(16, 16, muted ? 'muted' : 'sound', toggleMute);
  helpBtn(58, 16);
  iconBtn(W - 50, H - 46, 'full', toggleFs);
  watermark();
  if (helpOpen) drawHelp();
}
function helpBtn(x, y) {
  const hov = inside(ptr, x, y, 34, 34);
  ctx.fillStyle = hov ? '#ffb43a' : '#f08a14'; rr(ctx, x, y, 34, 34, 7); ctx.fill();
  ctx.strokeStyle = '#7a3a06'; ctx.lineWidth = 2.5; ctx.stroke();
  outlineText('?', x + 17, y + 19, 20, '#3a1a04', '#f08a14');
  btns.push({ x, y, w: 34, h: 34, fn: () => { helpOpen = !helpOpen; } });
}
function drawHelp() {
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff8e6'; rr(ctx, 140, 90, 520, 420, 18); ctx.fill();
  ctx.strokeStyle = '#f08a14'; ctx.lineWidth = 6; ctx.stroke();
  outlineText('HOW TO FIGHT', CX, 130, 30, '#ff8a1c', '#7a2a06');
  const rows = [['X', 'Hook. Big damage, goes around a high guard.'], ['↑ + X', 'Jab. Fast, lands when the guard is low.'],
    ['← →', 'Dodge a hook by moving away from it.'], ['↓', 'Duck under hooks. Uppercuts still hit.'],
    ['Z', 'Hold to block. Uppercuts break through.'], ['SPACE', 'Super punch when the yellow bar is full.'],
    ['TIP', 'Red glove = hook, yellow glove = uppercut. Make them miss, then counter.']];
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  rows.forEach(([k, d], i) => {
    const y = 180 + i * 44;
    ctx.fillStyle = '#2b3550'; rr(ctx, 170, y - 15, 86, 30, 6); ctx.fill();
    ctx.font = '15px Bungee, Impact, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(k, 213, y + 1);
    ctx.font = '600 17px "Baloo 2", system-ui, sans-serif'; ctx.fillStyle = '#2b2b2b'; ctx.textAlign = 'left'; ctx.fillText(d, 272, y + 1);
  });
  button('GOT IT', CX, 476, 160, 44, () => { helpOpen = false; }, { primary: true, size: 20 });
}
function drawVs(dt) {
  sceneT += dt;
  const pr = ROSTER[vsIdx];
  ctx.fillStyle = '#1d4fa8'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#b3201f'; ctx.beginPath(); ctx.moveTo(W * .55, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W * .45, H); ctx.fill();
  ctx.save(); ctx.globalAlpha = .12; for (let i = 0; i < 30; i++) { ctx.fillStyle = '#fff'; ctx.fillRect(((i * 61 + sceneT * 300) % (W + 200)) - 100, i * 20, 120, 3); } ctx.restore();
  const k = E(sceneT / .5);
  drawHead(ctx, HERO, L(-150, 200, k), 250, 130, 'grin');
  drawHead(ctx, pr, L(W + 150, 600, k), 250, 130, 'norm');
  const s = sceneT < .5 ? 0 : Math.min(1, (sceneT - .5) * 4);
  ctx.save(); ctx.translate(CX, 250); ctx.scale(s * 1.2, s * 1.2); burst(ctx, 0, 0, 70, 48, 12, '#ffd23a', '#7a2a06'); outlineText('VS', 0, 2, 52, '#fff', '#7a2a06'); ctx.restore();
  outlineText('YOU', 200, 430, 36, '#fff', '#0d2350');
  outlineText(pr.name.toUpperCase(), 600, 430, 30, '#fff', '#4a0a0a');
  ctx.font = '600 17px "Baloo 2", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe8e8'; ctx.fillText(pr.blurb, 600, 466);
  outlineText(mode === 'defense' ? `TITLE DEFENSE #${defStreak + 1}` : `FIGHT ${vsIdx + 1} OF ${ROSTER.length}`, CX, 60, 26, '#ffe14a', '#3a1206');
  if (sceneT > .8) button('FIGHT!', CX, 535, 220, 62, () => newFight(vsIdx, scaleFor()), { primary: true, size: 32 });
}
function drawResult(dt) {
  sceneT += dt;
  drawFight(0);
  ctx.fillStyle = 'rgba(5,10,25,.7)'; ctx.fillRect(0, 0, W, H);
  const r = st.res, won = r.won;
  ctx.save(); ctx.translate(CX, 150); const s = Math.min(1, .6 + sceneT * 2); ctx.scale(s, s);
  burst(ctx, 0, 0, 170, 120, 16, won ? '#ffd23a' : '#8a96b5', won ? '#7a2a06' : '#2b3550', t * .2);
  outlineText(won ? 'YOU WIN!' : 'YOU LOSE', 0, 0, 58, '#fff', won ? '#7a2a06' : '#1d2440');
  ctx.restore();
  ctx.font = '700 22px "Baloo 2", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  const tm = Math.floor(r.time), mm = Math.floor(tm / 60), ss = String(tm % 60).padStart(2, '0');
  const how = r.how === 'DECISION' ? 'by decision after 3:00' : `by ${r.how} at ${mm}:${ss}`;
  ctx.fillText(`${won ? 'Beat' : 'Lost to'} ${st.pr.name} ${how}`, CX, 300);
  ctx.font = '600 17px "Baloo 2", system-ui, sans-serif'; ctx.fillStyle = '#c9d4ea';
  ctx.fillText(`Knockdowns: you ${st.oKD}, them ${st.pKD}`, CX, 330);
  let y = 410;
  if (mode === 'career') {
    if (won && st.idx === ROSTER.length - 1) {
      outlineText('NEW CHAMPION!', CX, 370, 30, '#ffe14a', '#3a1206');
      button('TITLE DEFENSE ▶', CX, y + 30, 270, 60, startDefense, { primary: true, size: 22 });
    } else if (won) {
      button('NEXT FIGHT ▶', CX, y + 30, 270, 60, () => toVs(st.idx + 1), { primary: true, size: 24 });
    } else button('REMATCH ▶', CX, y + 30, 270, 60, () => toVs(st.idx), { primary: true, size: 24 });
  } else {
    if (won) button(`DEFENSE #${defStreak + 1} ▶`, CX, y + 30, 270, 60, () => toVs((Math.random() * ROSTER.length) | 0), { primary: true, size: 22 });
    else { outlineText(`Reign over: ${defStreak} defenses`, CX, 370, 24, '#ffe14a', '#3a1206'); button('TRY AGAIN ▶', CX, y + 30, 270, 60, startDefense, { primary: true, size: 24 }); }
  }
  button('MENU', CX, y + 108, 170, 46, () => { scene = 'title'; }, { size: 20 });
}
function drawPause() {
  ctx.fillStyle = 'rgba(5,10,25,.7)'; ctx.fillRect(0, 0, W, H);
  outlineText('PAUSED', CX, 220, 64, '#ffe14a', '#3a1206');
  button('RESUME ▶', CX, 330, 240, 62, () => { paused = false; }, { primary: true, size: 26 });
  button('QUIT FIGHT', CX, 410, 200, 46, () => { paused = false; scene = 'title'; }, { size: 18 });
}

// ---------- loop ----------
let last = 0;
function frame(ts) {
  const now = ts / 1000, dt = Math.min(.033, now - (last || now)); last = now; t += dt;
  btns = [];
  if (scene === 'fight' && !paused) update(dt);
  if (scene === 'loading') drawLoading(dt);
  else if (scene === 'title') drawTitle(dt);
  else if (scene === 'vs') drawVs(dt);
  else if (scene === 'fight') drawFight(paused ? 0 : dt);
  else if (scene === 'result') drawResult(dt);
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
  if (scene === 'vs' && sceneT > .8) newFight(vsIdx, scaleFor());
});
const fightKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
addEventListener('keydown', e => {
  const c = e.code;
  if (fightKeys.includes(c) && (scene === 'fight' || document.activeElement === cv)) e.preventDefault();
  if (c === 'ArrowUp' || c === 'KeyW') keys.up = true;
  if (c === 'KeyZ') keys.block = true;
  if (e.repeat) return;
  audio();
  if (c === 'Enter') { const b = btns.find(x => x.primary); if (b) { sfx.click(); b.fn(); } return; }
  if (scene !== 'fight') return;
  if (c === 'KeyP' || c === 'Escape') { paused = !paused; return; }
  if (c === 'KeyX') punch(keys.up ? 'jab' : 'hook');
  if (c === 'ArrowLeft' || c === 'KeyA') dodge('L');
  if (c === 'ArrowRight' || c === 'KeyD') dodge('R');
  if (c === 'ArrowDown' || c === 'KeyS') dodge('D');
  if (c === 'Space') superPunch();
});
addEventListener('keyup', e => {
  if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
  if (e.code === 'KeyZ') keys.block = false;
});
addEventListener('blur', () => { keys.up = keys.block = false; if (scene === 'fight' && st && st.phase !== 'end') paused = true; });

// touch pad (optional DOM buttons with data-ka attributes)
document.querySelectorAll('[data-ka]').forEach(b => {
  const a = b.dataset.ka;
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); audio(); b.classList.add('on');
    if (a === 'block') keys.block = true;
    else if (a === 'jab' || a === 'hook') punch(a);
    else if (a === 'super') superPunch();
    else dodge(a);
  });
  const up = () => { b.classList.remove('on'); if (a === 'block') keys.block = false; };
  b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
});

window.KnockoutAlley = { save: () => save };
const go = () => requestAnimationFrame(frame);
if (document.fonts) Promise.all(['20px Bungee', '20px "Lilita One"', '600 20px "Baloo 2"'].map(f => document.fonts.load(f).catch(() => {}))).then(() => { buildArena(); go(); }); else go();
})();
