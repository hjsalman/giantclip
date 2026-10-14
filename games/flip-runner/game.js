/* Flip Runner - gravity-flipping endless runner. Canvas 2D, no libraries. */
(() => {
'use strict';
const cv = document.getElementById('fr');
const ctx = cv.getContext('2d');
const W = 800, H = 600, CX = W / 2;
const GACC = 2600, PW = 22, PH = 38;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
let save = Object.assign({ best: 0, orbs: 0, runs: 0 }, store.get('fr-save', {}));
let muted = store.get('fr-mute', false);
function persist() { store.set('fr-save', save); window.dispatchEvent(new CustomEvent('fr-awards', { detail: save })); }
const L = (a, b, k) => a + (b - a) * k;
const C = (v, a, b) => v < a ? a : v > b ? b : v;
const R = (a, b) => a + Math.random() * (b - a);
function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }

// ---------- audio ----------
let ac = null, nb = null;
function audio() { if (muted) return; if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } } if (ac.state === 'suspended') ac.resume(); }
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
  const s = ac.createBufferSource(); s.buffer = nb; const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
  const g = ac.createGain(), n = ac.currentTime; g.gain.setValueAtTime(vol, n); g.gain.exponentialRampToValueAtTime(.001, n + dur);
  s.connect(fl).connect(g).connect(ac.destination); s.start(n); s.stop(n + dur + .05);
}
const sfx = {
  flip(up) { tone(up ? 380 : 620, .14, .12, 'square', up ? 760 : 310); },
  land() { noise(.05, 900, 2, .15); },
  orb() { tone(1200, .06, .1, 'triangle'); setTimeout(() => tone(1800, .08, .1, 'triangle'), 50); },
  die() { noise(.5, 400, .6, .5); tone(300, .6, .2, 'sawtooth', 50); },
  click() { tone(520, .05, .12, 'square'); },
  best() { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, .15, .12, 'square'), i * 90)); },
};

// ---------- background ----------
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const skyC = cnv(W, H), farC = cnv(1200, H), nearC = cnv(1200, H);
function buildBg() {
  let c = skyC.getContext('2d');
  let g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a0620'); g.addColorStop(.55, '#1c0f44'); g.addColorStop(1, '#3a1460');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(255,255,255,${R(.2, .9)})`; c.fillRect(R(0, W), R(0, H * .6), R(1, 2), R(1, 2)); }
  const mg = c.createRadialGradient(620, 120, 4, 620, 120, 70); mg.addColorStop(0, 'rgba(255,120,220,.9)'); mg.addColorStop(.3, 'rgba(255,80,200,.35)'); mg.addColorStop(1, 'rgba(255,80,200,0)');
  c.fillStyle = mg; c.fillRect(540, 40, 160, 160);
  const city = (cc, base, minH, maxH, col, winCol, seed) => {
    let s = seed; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let x = 0; x < 1200;) {
      const w = 40 + r() * 70, hh = minH + r() * (maxH - minH);
      cc.fillStyle = col; cc.fillRect(x, base - hh, w, hh + 200);
      if (r() < .3) { cc.fillRect(x + w / 2 - 2, base - hh - 30, 4, 30); cc.fillStyle = '#ff3b6a'; cc.fillRect(x + w / 2 - 3, base - hh - 32, 6, 4); }
      for (let wy = base - hh + 10; wy < base - 10; wy += 14) for (let wx = x + 6; wx < x + w - 8; wx += 12) if (r() < .35) { cc.fillStyle = winCol[Math.floor(r() * winCol.length)]; cc.fillRect(wx, wy, 6, 8); }
      x += w + 4 + r() * 10;
    }
  };
  city(farC.getContext('2d'), 470, 120, 300, '#1e1450', ['rgba(120,200,255,.55)', 'rgba(255,200,120,.45)', 'rgba(200,120,255,.5)'], 11);
  city(nearC.getContext('2d'), 560, 160, 360, '#120a30', ['rgba(80,240,255,.8)', 'rgba(255,90,200,.7)', 'rgba(255,230,120,.7)'], 29);
  c = nearC.getContext('2d'); g = c.createLinearGradient(0, 300, 0, H); g.addColorStop(0, 'rgba(58,20,96,0)'); g.addColorStop(1, 'rgba(58,20,96,.6)'); c.fillStyle = g; c.fillRect(0, 300, 1200, 300);
}

// ---------- world generation ----------
let g = null;
const TOP = [70, 170], BOT = [420, 520];
function lane(top) { return top ? R(TOP[0], TOP[1]) : R(BOT[0], BOT[1]); }
function addPlat(x, y, w, top) {
  const p = { x, y: top ? y - 30 : y, w, h: 30, top };
  const clash = g.plats.find(o => o.top === top && o.x < x + w + 40 && o.x + o.w > x - 40);
  if (clash) p.y = clash.y;
  g.plats.push(p);
  // orbs along it
  if (Math.random() < .7) { const n = Math.floor(w / 70); for (let i = 1; i < n; i++) g.orbs.push({ x: x + i * 70, y: top ? p.y + p.h + 30 : p.y - 30, got: false }); }
  return p;
}
function generate() {
  while (g.genX < g.cam + W * 2.2) {
    const d = g.dist, hard = C(d / 6000, 0, 1);
    const cur = g.lastPlat, top = cur.top;
    const r = Math.random();
    if (r < .55) {
      // switch lanes: opposite platform overlaps current end
      const overlap = L(220, 120, hard) + R(0, 60);
      const w = R(L(520, 300, hard), L(800, 520, hard));
      const p = addPlat(cur.x + cur.w - overlap, lane(!top), w, !top);
      g.lastPlat = p; g.genX = p.x + p.w;
      if (Math.random() < .35 + hard * .3) { // obstacle wall on the new lane forces another flip later
        const bx = p.x + p.w - R(40, 90);
        g.blocks.push({ x: bx, y: p.top ? p.y + p.h : p.y - 70, w: 30, h: 70, top: p.top });
        p.w = bx - p.x + 30; g.genX = p.x + p.w;
      }
    } else if (r < .8) {
      // same lane, short gap you cannot cross: must flip and come back (opposite bridge)
      const bridgeW = R(320, 460);
      const b = addPlat(cur.x + cur.w - R(140, 200), lane(!top), bridgeW, !top);
      const p = addPlat(b.x + b.w - R(140, 200), lane(top), R(380, 700), top);
      g.lastPlat = p; g.genX = p.x + p.w;
    } else {
      // both lanes open for a while (free choice), with a middle hazard block
      const w = R(700, 900), x = cur.x + cur.w - 160;
      const a = addPlat(x, lane(true), w, true), b2 = addPlat(x, lane(false), w, false);
      if (Math.random() < .6) { const bx = x + w * R(.25, .4); g.blocks.push({ x: bx, y: b2.y - 60, w: 28, h: 60, top: false }); g.blocks.push({ x: bx + R(340, 440), y: a.y + a.h, w: 28, h: 60, top: true }); }
      g.lastPlat = Math.random() < .5 ? a : b2; g.genX = x + w;
    }
  }
  // drop any wall that would leave no safe landing on the other side
  const covered = (top, a, b) => {
    let x = a; const ps = g.plats.filter(p => p.top === top).sort((m, n) => m.x - n.x);
    for (const p of ps) { if (p.x <= x + 1 && p.x + p.w > x) x = p.x + p.w; if (x >= b) return true; }
    return x >= b;
  };
  g.blocks = g.blocks.filter(b => { if (b.ok || g.genX < b.x + 600) return true; b.ok = covered(!b.top, b.x - 300, b.x + 340); return b.ok; });
  g.plats = g.plats.filter(p => p.x + p.w > g.cam - 200);
  g.blocks = g.blocks.filter(b => b.x + b.w > g.cam - 200);
  g.orbs = g.orbs.filter(o => o.x > g.cam - 100);
}
function newRun() {
  g = { cam: 0, dist: 0, speed: 320, plats: [], blocks: [], orbs: [], fx: [], trail: [], orbsGot: 0, state: 'play', endT: 0, genX: 0, shake: 0, newBest: false,
    p: { x: 220, y: 0, vy: 0, grav: 1, on: true, buf: 0, rot: 0, run: 0 }, chaser: 0 };
  const start = { x: -200, y: 470, w: 1100, h: 30, top: false };
  g.plats.push(start); g.lastPlat = start; g.genX = start.x + start.w;
  const ceil = { x: -200, y: 120 - 30, w: 700, h: 30, top: true }; g.plats.push(ceil);
  g.p.y = start.y - PH;
  generate();
  scene = 'play'; paused = false; save.runs++; persist();
}

// ---------- physics ----------
const ov = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function flip() {
  if (!g || scene !== 'play' || paused || g.state !== 'play') return;
  g.p.buf = .14;
}
function update(dt) {
  g.endT += dt;
  for (const f of g.fx) { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; }
  g.fx = g.fx.filter(f => f.life > 0);
  g.shake *= .88;
  if (g.state !== 'play') return;
  const p = g.p;
  g.speed = Math.min(560, 320 + g.dist * .025);
  g.cam += g.speed * dt;
  g.dist = Math.max(g.dist, (p.x - 220) / 10);
  // player wants to sit 220px from the left of the camera
  const want = g.cam + 260, vx = g.speed * (p.x < want ? 1.3 : 1);
  p.buf -= dt;
  if (p.buf > 0 && p.on) { p.grav *= -1; p.on = false; p.buf = 0; p.vy = p.grav * 120; sfx.flip(p.grav < 0); for (let i = 0; i < 8; i++) g.fx.push({ x: p.x + PW / 2, y: p.y + PH / 2, vx: R(-80, 80), vy: R(-80, 80), life: .35, r: 3, col: '#7af0ff' }); }
  // horizontal
  p.x += vx * dt;
  const box = () => ({ x: p.x, y: p.y, w: PW, h: PH });
  for (const s of [...g.plats, ...g.blocks]) if (ov(box(), s)) { const fromSide = p.grav > 0 ? p.y + PH - s.y > 8 : s.y + s.h - p.y > 8; if (fromSide && p.x + PW / 2 < s.x + 6) p.x = s.x - PW; }
  // vertical
  p.vy = C(p.vy + GACC * p.grav * dt, -1100, 1100);
  p.y += p.vy * dt;
  const wasOn = p.on; p.on = false;
  for (const s of [...g.plats, ...g.blocks]) {
    if (!ov(box(), s)) continue;
    if (p.grav > 0 && p.vy >= 0 && p.y + PH - s.y < 44) { p.y = s.y - PH; p.vy = 0; p.on = true; }
    else if (p.grav < 0 && p.vy <= 0 && s.y + s.h - p.y < 44) { p.y = s.y + s.h; p.vy = 0; p.on = true; }
  }
  if (p.on && !wasOn) { sfx.land(); g.shake = 3; for (let i = 0; i < 5; i++) g.fx.push({ x: p.x + PW / 2, y: p.grav > 0 ? p.y + PH : p.y, vx: R(-90, 30), vy: R(-30, 30) * p.grav, life: .3, r: 2.5, col: '#c8a0ff' }); }
  p.rot = L(p.rot, p.grav > 0 ? 0 : Math.PI, Math.min(1, dt * 16));
  p.run += dt * g.speed / 30;
  g.trail.push({ x: p.x + PW / 2, y: p.y + PH * .35, life: .35 }); for (const t of g.trail) t.life -= dt; g.trail = g.trail.filter(t => t.life > 0);
  // orbs
  for (const o of g.orbs) if (!o.got && Math.abs(o.x - (p.x + PW / 2)) < 22 && Math.abs(o.y - (p.y + PH / 2)) < 28) { o.got = true; g.orbsGot++; sfx.orb(); for (let i = 0; i < 6; i++) g.fx.push({ x: o.x, y: o.y, vx: R(-120, 120), vy: R(-120, 120), life: .3, r: 2, col: '#ffe14a' }); }
  // chaser closes in when you lag
  const lag = C((want - p.x) / 260, 0, 1);
  g.chaser = L(g.chaser, lag, Math.min(1, dt * 3));
  // death
  if (p.y > H + 40 || p.y + PH < -40) die('fell');
  else if (p.x < g.cam + 30) die('caught');
  generate();
}
function die(how) {
  g.state = 'dead'; g.endT = 0; g.how = how; sfx.die(); g.shake = 14;
  for (let i = 0; i < 30; i++) g.fx.push({ x: g.p.x + PW / 2, y: C(g.p.y, 20, H - 20), vx: R(-260, 260), vy: R(-260, 260), life: R(.5, 1), r: R(2, 4), col: i % 2 ? '#7af0ff' : '#ff4a8a' });
  const d = Math.floor(g.dist);
  save.orbs += g.orbsGot;
  if (d > save.best) { save.best = d; g.newBest = true; setTimeout(sfx.best, 400); }
  persist();
}

// ---------- art ----------
function drawPlat(c, s, t) {
  const g2 = c.createLinearGradient(0, s.y, 0, s.y + s.h); g2.addColorStop(0, '#2a2a5a'); g2.addColorStop(1, '#14143a');
  c.fillStyle = g2; c.fillRect(s.x, s.y, s.w, s.h);
  c.strokeStyle = 'rgba(122,240,255,.18)'; c.lineWidth = 1.5;
  for (let x = s.x + 20; x < s.x + s.w - 20; x += 46) { c.beginPath(); c.moveTo(x, s.y + 8); c.lineTo(x + 16, s.y + 8); c.lineTo(x + 22, s.y + 18); c.lineTo(x + 40, s.y + 18); c.stroke(); c.fillStyle = 'rgba(122,240,255,.35)'; c.fillRect(x + 38, s.y + 16, 4, 4); }
  const ey = s.top ? s.y + s.h - 3 : s.y;
  c.save(); c.shadowColor = '#3ff0ff'; c.shadowBlur = 14; c.fillStyle = '#7af0ff'; c.fillRect(s.x, ey, s.w, 3); c.restore();
  for (const ex of [s.x, s.x + s.w - 10]) { c.fillStyle = '#ffcc33'; c.fillRect(ex, s.y + 4, 10, s.h - 8); c.fillStyle = '#14143a'; for (let k = 0; k < 3; k++) c.fillRect(ex, s.y + 6 + k * 8, 10, 3); }
}
function drawBlock(c, b, t) {
  const g2 = c.createLinearGradient(b.x, 0, b.x + b.w, 0); g2.addColorStop(0, '#5a1030'); g2.addColorStop(.5, '#a01a50'); g2.addColorStop(1, '#5a1030');
  c.fillStyle = g2; c.fillRect(b.x, b.y, b.w, b.h);
  c.save(); c.shadowColor = '#ff3b8a'; c.shadowBlur = 12 + Math.sin(t * 8) * 4; c.strokeStyle = '#ff6aaa'; c.lineWidth = 2; c.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2); c.restore();
  c.fillStyle = '#ffd23a'; c.font = 'bold 18px Verdana'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', b.x + b.w / 2, b.y + b.h / 2);
}
function drawRunner(c, x, y, rot, run, s = 1) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
  const p = run, a1 = Math.sin(p) * .9, a2 = Math.sin(p + Math.PI) * .9;
  const limb = (x1, y1, x2, y2, w, col) => { c.lineCap = 'round'; c.strokeStyle = '#0a0a1a'; c.lineWidth = w + 3; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); };
  const leg = (a, col) => { const kx = Math.sin(a) * 9, ky = 6 + Math.cos(a) * 9; const fx = kx + Math.sin(a - .9 * Math.max(0, Math.cos(a))) * 9 - 2, fy = ky + 9; limb(0, 0, kx, ky, 5, col); limb(kx, ky, fx, fy, 5, col); c.fillStyle = '#ffcc33'; c.fillRect(fx - 2, fy - 2, 8, 4); };
  leg(a2, '#2a3a8a'); limb(0, -14, -Math.sin(a1) * 9, -4, 4, '#2a3a8a');
  // torso
  const tg = c.createLinearGradient(-6, -20, 6, 0); tg.addColorStop(0, '#3a5ad0'); tg.addColorStop(1, '#1a2a7a');
  c.fillStyle = tg; c.strokeStyle = '#0a0a1a'; c.lineWidth = 2; rr(c, -6, -20, 13, 22, 5); c.fill(); c.stroke();
  c.fillStyle = '#7af0ff'; c.fillRect(-5, -10, 11, 2.5);
  leg(a1, '#3a4ab0');
  // head + helmet
  c.fillStyle = '#e8e8f4'; c.beginPath(); c.arc(2, -27, 8.5, 0, 7); c.fill(); c.stroke();
  c.save(); c.shadowColor = '#ffe14a'; c.shadowBlur = 10; c.fillStyle = '#ffe14a'; rr(c, 2, -30, 9, 5, 2.5); c.fill(); c.restore();
  c.fillStyle = '#ff3b6a'; c.fillRect(-7, -31, 4, 6);
  limb(1, -15, 1 + Math.sin(a2) * 10, -4, 4, '#3a5ad0');
  c.restore();
}
function drawChaser(c, x, y, t, close) {
  c.save(); c.translate(x, y + Math.sin(t * 4) * 6);
  // searchlight
  const lg = c.createLinearGradient(0, 0, 260, 0); lg.addColorStop(0, `rgba(255,60,90,${.25 + close * .3})`); lg.addColorStop(1, 'rgba(255,60,90,0)');
  c.fillStyle = lg; c.beginPath(); c.moveTo(16, 0); c.lineTo(260, -70); c.lineTo(260, 70); c.closePath(); c.fill();
  const bg = c.createRadialGradient(-6, -8, 3, 0, 0, 30); bg.addColorStop(0, '#9aa4b8'); bg.addColorStop(1, '#2a2e40');
  c.fillStyle = bg; c.strokeStyle = '#0a0a1a'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, 0, 30, 24, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#14141e'; c.beginPath(); c.ellipse(8, 0, 16, 12, 0, 0, 7); c.fill();
  c.save(); c.shadowColor = '#ff2a5a'; c.shadowBlur = 16; c.fillStyle = '#ff3b6a'; c.beginPath(); c.arc(12, 0, 6 + close * 2, 0, 7); c.fill(); c.restore();
  for (const s of [-1, 1]) { c.fillStyle = '#3a3e52'; c.fillRect(-22, s * 22 - 3, 36, 6); c.save(); c.translate(-4, s * 28); c.scale(1, .25); c.fillStyle = 'rgba(200,220,255,.5)'; c.beginPath(); c.arc(0, 0, 18 + Math.sin(t * 40) * 2, 0, 7); c.fill(); c.restore(); }
  c.restore();
}
function drawOrb(c, x, y, t) {
  const gl = c.createRadialGradient(x, y, 1, x, y, 14); gl.addColorStop(0, '#fff8c0'); gl.addColorStop(.4, '#ffd23a'); gl.addColorStop(1, 'rgba(255,210,58,0)');
  c.fillStyle = gl; c.beginPath(); c.arc(x, y, 14 + Math.sin(t * 6 + x) * 2, 0, 7); c.fill();
}

// ---------- render ----------
function drawWorld() {
  ctx.drawImage(skyC, 0, 0);
  const tile = (img, par) => { const off = -((g.cam * par) % 1200); ctx.drawImage(img, off, 0); ctx.drawImage(img, off + 1200, 0); };
  tile(farC, .15); tile(nearC, .35);
  ctx.save();
  if (g.shake > .5) ctx.translate(R(-1, 1) * g.shake, R(-1, 1) * g.shake);
  ctx.translate(-Math.round(g.cam), 0);
  // speed lines
  ctx.strokeStyle = 'rgba(122,240,255,.08)'; ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) { const y = (i * 61 + 30) % H, x = g.cam + W - ((tt * g.speed * 1.5 + i * 157) % (W + 200)); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 80, y); ctx.stroke(); }
  for (const s of g.plats) if (s.x < g.cam + W && s.x + s.w > g.cam) drawPlat(ctx, s, tt);
  for (const b of g.blocks) if (b.x < g.cam + W && b.x + b.w > g.cam) drawBlock(ctx, b, tt);
  for (const o of g.orbs) if (!o.got && o.x > g.cam - 20 && o.x < g.cam + W + 20) drawOrb(ctx, o.x, o.y, tt);
  const p = g.p;
  for (const t of g.trail) { ctx.globalAlpha = t.life * 1.6; ctx.fillStyle = '#7af0ff'; ctx.fillRect(t.x - 4, t.y - 2, 8, 4); }
  ctx.globalAlpha = 1;
  if (g.state === 'play' || g.endT < .1) drawRunner(ctx, p.x + PW / 2, p.y + (p.grav > 0 ? PH : 0), p.rot, p.on ? p.run : .6, 1.05);
  for (const f of g.fx) { ctx.globalAlpha = C(f.life * 3, 0, 1); ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.restore();
  drawChaser(ctx, 40 + g.chaser * 90, C(g.p.y + PH / 2, 60, H - 60), tt, g.chaser);
  // vignette edges
  const vg = ctx.createLinearGradient(0, 0, 80, 0); vg.addColorStop(0, 'rgba(255,40,90,.25)'); vg.addColorStop(1, 'rgba(255,40,90,0)');
  ctx.fillStyle = vg; ctx.globalAlpha = g.chaser; ctx.fillRect(0, 0, 80, H); ctx.globalAlpha = 1;
}
function neon(txt, x, y, size, col, align = 'center') {
  ctx.save(); ctx.font = `700 ${size}px Orbitron, "Bungee", sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.fillStyle = col; ctx.fillText(txt, x, y);
  ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; ctx.globalAlpha = .7; ctx.fillText(txt, x, y); ctx.restore();
}
function hud() {
  ctx.fillStyle = 'rgba(10,6,32,.65)'; rr(ctx, 14, 12, 230, 64, 10); ctx.fill(); ctx.strokeStyle = 'rgba(122,240,255,.6)'; ctx.lineWidth = 2; ctx.stroke();
  neon(`${Math.floor(g.dist)} m`, 30, 34, 26, '#7af0ff', 'left');
  ctx.font = '600 13px Verdana'; ctx.fillStyle = '#c8b8ff'; ctx.textAlign = 'left'; ctx.fillText(`BEST ${save.best} m`, 30, 60);
  drawOrb(ctx, 168, 58, tt); ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Verdana'; ctx.fillText(`x ${g.orbsGot}`, 182, 59);
  iconBtn(W - 50, H - 46, muted ? 'muted' : 'sound', toggleMute);
  iconBtn(W - 92, H - 46, 'pause', () => { paused = true; });
  iconBtn(W - 134, H - 46, 'full', toggleFs);
  watermark();
}

// ---------- UI kit ----------
let scene = 'loading', loadT = 0, tt = 0, paused = false, btns = [], ptr = { x: -1, y: -1 };
const inside = (p, x, y, w, h) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
function outline(txt, x, y, size, fill, stroke, font = 'Bungee, Impact, sans-serif') {
  ctx.font = `${size}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size / 5); ctx.strokeStyle = stroke; ctx.strokeText(txt, x, y); ctx.fillStyle = fill; ctx.fillText(txt, x, y);
}
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
  ctx.fillStyle = hov ? '#ffb43a' : '#f08a14'; rr(ctx, x, y, 34, 34, 7); ctx.fill(); ctx.strokeStyle = '#7a3a06'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = '#3a1a04'; ctx.strokeStyle = '#3a1a04';
  if (kind === 'pause') { ctx.fillRect(x + 11, y + 9, 5, 16); ctx.fillRect(x + 19, y + 9, 5, 16); }
  else if (kind === 'full') { ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 8, y + 15); ctx.lineTo(x + 8, y + 8); ctx.lineTo(x + 15, y + 8); ctx.moveTo(x + 19, y + 8); ctx.lineTo(x + 26, y + 8); ctx.lineTo(x + 26, y + 15); ctx.moveTo(x + 26, y + 19); ctx.lineTo(x + 26, y + 26); ctx.lineTo(x + 19, y + 26); ctx.moveTo(x + 15, y + 26); ctx.lineTo(x + 8, y + 26); ctx.lineTo(x + 8, y + 19); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(x + 8, y + 13); ctx.lineTo(x + 13, y + 13); ctx.lineTo(x + 19, y + 8); ctx.lineTo(x + 19, y + 26); ctx.lineTo(x + 13, y + 21); ctx.lineTo(x + 8, y + 21); ctx.fill(); ctx.lineWidth = 2.5; ctx.beginPath(); if (kind === 'sound') ctx.arc(x + 20, y + 17, 6, -1, 1); else { ctx.moveTo(x + 22, y + 12); ctx.lineTo(x + 29, y + 22); ctx.moveTo(x + 29, y + 12); ctx.lineTo(x + 22, y + 22); } ctx.stroke(); }
  btns.push({ x, y, w: 34, h: 34, fn });
}
function toggleMute() { muted = !muted; store.set('fr-mute', muted); if (!muted) audio(); }
function toggleFs() { const f = cv.parentElement; try { const r = document.fullscreenElement ? document.exitFullscreen() : f.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch {} }
function watermark() {
  ctx.save(); ctx.font = '22px "Lilita One", "Arial Black", Impact, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#5a1e00'; ctx.strokeText('GIANTCLIP', 14, H - 16);
  const gr = ctx.createLinearGradient(0, H - 38, 0, H - 14); gr.addColorStop(0, '#ffd23a'); gr.addColorStop(1, '#ff7a10'); ctx.fillStyle = gr; ctx.fillText('GIANTCLIP', 14, H - 16);
  ctx.restore();
}
function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(6,4,20,.6)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(16,10,48,.92)'; rr(ctx, x, y, w, h, 16); ctx.fill();
  ctx.save(); ctx.shadowColor = '#3ff0ff'; ctx.shadowBlur = 18; ctx.strokeStyle = '#7af0ff'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
}
function logo(y) {
  neon('FLIP', CX - 4, y - 34, 74, '#7af0ff');
  ctx.save(); ctx.translate(CX, y + 34); ctx.scale(1, -1); neon('RUNNER', 0, 0, 58, '#ff5aa8'); ctx.restore();
  ctx.strokeStyle = 'rgba(255,225,74,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(CX - 200, y + 2); ctx.lineTo(CX + 200, y + 2); ctx.stroke();
}
function drawTitle() {
  if (!g) newDemo();
  g.cam += 200 / 60; generateDemo();
  drawWorld();
  ctx.fillStyle = 'rgba(6,4,20,.45)'; ctx.fillRect(0, 0, W, H);
  logo(150);
  button('PLAY ▶', CX, 300, 240, 72, newRun, { primary: true, size: 38 });
  ctx.fillStyle = 'rgba(16,10,48,.85)'; rr(ctx, CX - 170, 360, 340, 110, 12); ctx.fill(); ctx.strokeStyle = 'rgba(122,240,255,.6)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#e8f6ff'; ctx.font = 'bold 15px Verdana';
  ctx.fillText('SPACE, ↑ ↓ or CLICK to flip gravity', CX, 390);
  ctx.font = '13px Verdana'; ctx.fillStyle = '#c8b8ff'; ctx.fillText('You can only flip while your feet are on something.', CX, 418);
  ctx.fillText("Don't fall off the screen. Don't let the drone catch you.", CX, 440);
  if (save.best) neon(`BEST ${save.best} m`, CX, 505, 22, '#ffe14a');
  iconBtn(16, 16, muted ? 'muted' : 'sound', toggleMute);
  iconBtn(W - 50, H - 46, 'full', toggleFs);
  watermark();
}
function newDemo() {
  g = { cam: 0, dist: 0, speed: 200, plats: [], blocks: [], orbs: [], fx: [], trail: [], orbsGot: 0, state: 'demo', endT: 0, genX: 0, shake: 0, p: { x: -999, y: 400, grav: 1, rot: 0, run: 0, on: true }, chaser: 0 };
  const start = { x: -200, y: 470, w: 900, h: 30, top: false }; g.plats.push(start); g.lastPlat = start; g.genX = start.x + start.w; generateDemo();
}
function generateDemo() { generate(); }
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
  ctx.fillText(k < 1 ? `Loading Flip Runner... ${Math.floor(k * 100)}%` : 'Ready!', CX, 420);
  if (loadT > 2.7) { scene = 'title'; g = null; }
}
function endScreens() {
  if (g.state === 'dead' && g.endT > .9) {
    panel(210, 140, 380, 320);
    neon(g.how === 'caught' ? 'CAUGHT!' : 'FELL OFF!', CX, 190, 44, '#ff5aa8');
    neon(`${Math.floor(g.dist)} m`, CX, 250, 40, '#7af0ff');
    ctx.font = 'bold 15px Verdana'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8f6ff';
    ctx.fillText(g.newBest ? 'NEW BEST DISTANCE!' : `Best: ${save.best} m`, CX, 292); ctx.fillText(`Orbs: ${g.orbsGot}`, CX, 316);
    button('RUN AGAIN ▶', CX, 370, 240, 56, newRun, { primary: true, size: 22 });
    button('MENU', CX, 428, 140, 40, () => { scene = 'title'; g = null; }, { size: 16 });
  }
  if (paused) {
    panel(250, 180, 300, 230);
    neon('PAUSED', CX, 230, 44, '#7af0ff');
    button('RESUME ▶', CX, 305, 220, 56, () => { paused = false; }, { primary: true, size: 22 });
    button('MENU', CX, 368, 140, 40, () => { paused = false; scene = 'title'; g = null; }, { size: 16 });
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
function toCanvas(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
cv.addEventListener('pointermove', e => { ptr = toCanvas(e); });
cv.addEventListener('pointerleave', () => { ptr = { x: -1, y: -1 }; });
cv.addEventListener('pointerdown', e => {
  audio(); ptr = toCanvas(e);
  for (let i = btns.length - 1; i >= 0; i--) { const b = btns[i]; if (inside(ptr, b.x, b.y, b.w, b.h)) { sfx.click(); b.fn(); return; } }
  flip();
});
addEventListener('keydown', e => {
  const c = e.code;
  if (scene === 'play' && (c === 'Space' || c.startsWith('Arrow'))) e.preventDefault();
  if (e.repeat) return;
  audio();
  if (c === 'Space' || c === 'ArrowUp' || c === 'ArrowDown' || c === 'KeyW' || c === 'KeyS') { if (scene === 'play' && g.state === 'play') flip(); else if (scene === 'play' && g.state === 'dead' && g.endT > .9) newRun(); }
  if (c === 'Enter') { const b = btns.find(x => x.primary); if (b) { sfx.click(); b.fn(); } }
  if ((c === 'KeyP' || c === 'Escape') && scene === 'play' && g.state === 'play') paused = !paused;
});
addEventListener('blur', () => { if (scene === 'play' && g && g.state === 'play') paused = true; });

window.FlipRunner = { drawRunner, drawChaser, drawPlat, drawOrb, drawBlock, debug: { newRun, flip, get g() { return g; } } };
const go = () => { buildBg(); requestAnimationFrame(frame); };
if (document.fonts) Promise.all(['20px Bungee', '20px "Lilita One"', '700 20px Orbitron'].map(f => document.fonts.load(f).catch(() => {}))).then(go); else go();
})();
