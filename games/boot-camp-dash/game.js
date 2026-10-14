/* Boot Camp Dash - side-scrolling military obstacle course. Uses GCKit. */
(() => {
'use strict';
const K = GCKit('bc', 'Boot Camp Dash', 'bc');
const { ctx, W, H, CX, L, C, R, rr, shade, store } = K;
const GY = 470, GRAV = 2000, JUMP = 720, RUN = 310;
const STENCIL = '"Black Ops One", Impact, sans-serif';
let save = Object.assign({ best: [0, 0, 0], medals: [0, 0, 0] }, store.get('bc-save', {}));
function persist() { store.set('bc-save', save); window.dispatchEvent(new CustomEvent('bc-awards', { detail: save })); }
const sfx = {
  jump() { K.tone(260, .12, .1, 'square', 480); },
  step() { K.noise(.04, 300, 1, .08, 'lowpass'); },
  trip() { K.noise(.2, 400, .8, .5, 'lowpass'); K.tone(200, .2, .2, 'sawtooth', 90); },
  splash() { K.noise(.5, 900, .4, .5); },
  climb() { K.tone(180, .08, .08, 'square'); },
  beep(hi) { K.tone(hi ? 880 : 440, hi ? .4 : .15, .15, 'square'); },
  ouch() { K.tone(320, .15, .15, 'sawtooth', 160); },
};

// ---------- courses ----------
const COURSES = [
  { name: 'Recruit Course', medals: [24, 29, 36], obs: [
    ['hurdle', 600], ['hurdle', 900], ['wire', 1200, 160], ['mud', 1550, 220], ['wall', 1950], ['hurdle', 2250], ['water', 2500, 140],
    ['hurdle', 2850], ['wire', 3050, 200], ['wall', 3450], ['mud', 3700, 180], ['hurdle', 4050], ['hurdle', 4250], ['water', 4500, 160], ['wall', 4900] ], length: 5300 },
  { name: 'Sergeant Course', medals: [31, 37, 46], obs: [
    ['hurdle', 550], ['hurdle', 760], ['hurdle', 970], ['wall', 1250], ['wire', 1500, 260], ['water', 1900, 160], ['hurdle', 2200], ['mud', 2400, 260],
    ['wall', 2800], ['wall', 3100], ['wire', 3400, 180], ['hurdle', 3750], ['water', 3950, 165], ['wire', 4300, 220], ['hurdle', 4700], ['hurdle', 4900],
    ['mud', 5100, 240], ['wall', 5500], ['water', 5800, 170], ['hurdle', 6200] ], length: 6600 },
  { name: 'General Course', medals: [38, 45, 56], obs: [
    ['hurdle', 500], ['wire', 700, 200], ['hurdle', 1050], ['wall', 1250], ['water', 1500, 165], ['hurdle', 1850], ['hurdle', 2050], ['mud', 2250, 200],
    ['wire', 2600, 240], ['wall', 3000], ['hurdle', 3250], ['water', 3450, 165], ['wall', 3800], ['wire', 4050, 200], ['hurdle', 4400], ['hurdle', 4580],
    ['hurdle', 4760], ['mud', 4950, 220], ['water', 5350, 170], ['wall', 5700], ['wire', 5950, 260], ['hurdle', 6350], ['wall', 6600], ['water', 6900, 170], ['hurdle', 7300] ], length: 7700 },
];
let course = null, g = null;
function startCourse(i) {
  const d = COURSES[i];
  course = { i, d, obs: d.obs.map(([type, x, w]) => ({ type, x, w: w || (type === 'wall' ? 26 : 14), hit: false })) };
  g = { p: { x: 120, y: GY, vx: 0, vy: 0, on: true, face: 1, st: 'idle', anim: 0, slide: 0, trip: 0, climb: null, safe: 120 }, cam: 0, time: 0, count: 3.5, state: 'count',
        fx: [], pops: [], penalty: 0, endT: 0, lastBeep: 4, shout: { txt: 'READY, RECRUIT!', t: 2.5 } };
  scene = 'play'; paused = false;
}
const groundAt = x => !course.obs.some(o => o.type === 'water' && x > o.x && x < o.x + o.w);
const onMud = x => course.obs.some(o => o.type === 'mud' && x > o.x && x < o.x + o.w);

// ---------- update ----------
function pop(txt, x, y, col = '#ffe14a') { g.pops.push({ txt, x, y, t: 0, col }); }
function update(dt) {
  for (const f of g.fx) { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += (f.grav ?? 600) * dt; }
  g.fx = g.fx.filter(f => f.life > 0);
  for (const p of g.pops) p.t += dt; g.pops = g.pops.filter(p => p.t < 1.1);
  if (g.shout) { g.shout.t -= dt; if (g.shout.t <= 0) g.shout = null; }
  g.endT += dt;
  if (g.state === 'count') {
    g.count -= dt; const n = Math.ceil(g.count);
    if (n !== g.lastBeep && n >= 0) { g.lastBeep = n; if (n > 0 && n <= 3) sfx.beep(false); if (n === 0) { sfx.beep(true); g.state = 'run'; g.shout = { txt: 'GO GO GO!', t: 1.2 }; } }
    return;
  }
  const p = g.p;
  if (g.state === 'run') g.time += dt;
  if (g.state === 'done') { p.vx = L(p.vx, 0, dt * 2); p.x += p.vx * dt; p.anim += dt * p.vx / 40; p.st = Math.abs(p.vx) > 20 ? 'run' : 'idle'; return; }
  const keys = K.keys;
  const right = keys.r, left = keys.l, up = keys.u, down = keys.d;
  // climbing a wall
  if (p.climb) {
    const o = p.climb; p.climb.t += dt; p.st = 'climb'; p.anim += dt * 8;
    const k = Math.min(1, o.t / .55);
    p.x = o.x - 16 + (k > .8 ? (k - .8) * 5 * 40 : 0); p.y = L(GY, GY - 130, Math.min(1, k * 1.25));
    if (o.t > .2 && Math.floor(o.t * 8) !== Math.floor((o.t - dt) * 8)) sfx.climb();
    if (k >= 1) { p.climb = null; p.x = o.x + o.w + 2; p.y = GY - 130; p.vy = -120; p.vx = 160; p.on = false; }
    return;
  }
  if (p.trip > 0) { p.trip -= dt; p.vx = L(p.vx, 40, dt * 6); }
  else {
    let max = RUN * (onMud(p.x) && p.on ? .38 : 1);
    if (p.slide > 0) { p.vx = Math.max(p.vx - 160 * dt, 120); }
    else if (right) p.vx = Math.min(p.vx + 900 * dt, max);
    else if (left) p.vx = Math.max(p.vx - 900 * dt, -140);
    else p.vx -= Math.sign(p.vx) * Math.min(Math.abs(p.vx), 700 * dt);
    if (p.vx > max) p.vx = L(p.vx, max, dt * 6);
  }
  // jump & slide
  if (p.jumpBuf > 0) p.jumpBuf -= dt;
  if (p.jumpBuf > 0 && p.on && p.trip <= 0 && p.slide <= 0) { p.vy = -JUMP; p.on = false; p.jumpBuf = 0; sfx.jump(); }
  if (down && p.on && p.slide <= 0 && p.trip <= 0) { p.vx = Math.max(p.vx, 150); p.slide = .85; for (let i = 0; i < 6; i++) g.fx.push({ x: p.x, y: GY, vx: R(-120, -20), vy: R(-80, -20), life: .5, r: R(3, 6), col: 'rgba(210,180,130,.7)', grav: 100 }); }
  if (p.slide > 0) {
    p.slide -= dt; if (!down && p.slide < .55) p.slide = 0;
    const under = course.obs.some(o => o.type === 'wire' && p.x + 14 > o.x && p.x - 14 < o.x + o.w);
    if (under) p.slide = Math.max(p.slide, .12);
  }
  // move
  const prevX = p.x;
  p.x += p.vx * dt;
  p.vy = Math.min(p.vy + GRAV * dt, 1200); p.y += p.vy * dt;
  const ground = groundAt(p.x);
  if (ground && p.y >= GY && p.vy >= 0 && p.y - p.vy * dt <= GY + 4) { if (!p.on && p.vy > 300) { for (let i = 0; i < 5; i++) g.fx.push({ x: p.x, y: GY, vx: R(-80, 80), vy: R(-60, -10), life: .4, r: R(3, 6), col: 'rgba(210,180,130,.7)', grav: 100 }); } p.y = GY; p.vy = 0; p.on = true; }
  else if (p.y < GY - .5 || !ground) p.on = false;
  // wall-top landing
  for (const o of course.obs) if (o.type === 'wall' && p.vy >= 0 && p.x > o.x - 6 && p.x < o.x + o.w + 6 && p.y >= GY - 130 && p.y - p.vy * dt <= GY - 126) { p.y = GY - 130; p.vy = 0; p.on = true; }
  if (p.on && p.y < GY && !course.obs.some(o => o.type === 'wall' && p.x > o.x - 6 && p.x < o.x + o.w + 6)) p.on = false;
  // obstacles
  const hgt = p.slide > 0 ? 30 : 70;
  for (const o of course.obs) {
    if (o.type === 'hurdle') {
      if (p.x + 12 > o.x && p.x - 12 < o.x + o.w && p.y > GY - 44) {
        if (!o.hit && p.trip <= 0) { o.hit = true; p.trip = .7; p.vx = 60; sfx.trip(); pop('TRIPPED!', o.x, GY - 120, '#ff8a6a'); g.shout = { txt: 'GET UP, MAGGOT!', t: 1.4 }; }
      }
    } else if (o.type === 'wire') {
      const top = GY - 66, bot = GY - 38;
      if (p.x + 12 > o.x && p.x - 12 < o.x + o.w && p.y - hgt < bot && p.y > top) {
        p.x = Math.min(p.x, o.x - 13); if (p.vx > 0) p.vx = 0;
        if (!o.warned) { o.warned = true; sfx.ouch(); pop('SLIDE UNDER! ↓', o.x, GY - 130, '#ff8a6a'); }
      }
    } else if (o.type === 'wall') {
      if (p.x + 12 > o.x && p.x - 12 < o.x && p.y > GY - 128) {
        if (up || p.jumpBuf > 0 || !p.on) { p.climb = { x: o.x, w: o.w, t: 0 }; p.vx = 0; p.vy = 0; p.jumpBuf = 0; return; }
        p.x = o.x - 13; p.vx = Math.min(p.vx, 0);
        if (!o.warned) { o.warned = true; pop('JUMP TO CLIMB! ↑', o.x, GY - 170, '#ffe14a'); }
      }
    }
  }
  // falling in water
  if (p.y > GY + 70) {
    sfx.splash(); for (let i = 0; i < 16; i++) g.fx.push({ x: p.x, y: GY + 20, vx: R(-150, 150), vy: R(-420, -150), life: R(.5, .9), r: R(2, 4), col: '#bfe6ff' });
    const pit = course.obs.find(o => o.type === 'water' && p.x > o.x - 40 && p.x < o.x + o.w + 40);
    p.x = pit ? pit.x - 180 : p.safe; p.y = GY; p.vx = 0; p.vy = 0; p.on = true; g.penalty += 3; g.time += 3; pop('+3 SEC', p.x, GY - 120, '#ff8a6a');
    g.shout = { txt: 'NO SWIMMING ON MY COURSE!', t: 1.8 };
  }
  if (p.on && p.y >= GY) p.safe = p.x;
  p.x = Math.max(20, p.x);
  if (p.on && Math.abs(p.vx) > 40 && Math.floor(p.anim * 2) !== Math.floor((p.anim + dt * p.vx / 40) * 2)) sfx.step();
  p.anim += dt * Math.max(Math.abs(p.vx), 40) / 40;
  p.st = p.trip > 0 ? 'trip' : p.slide > 0 ? 'slide' : !p.on ? 'jump' : Math.abs(p.vx) > 30 ? 'run' : 'idle';
  if (onMud(p.x) && p.on && Math.random() < .3) g.fx.push({ x: p.x - 8, y: GY - 2, vx: R(-60, 0), vy: R(-140, -60), life: .4, r: R(2, 4), col: '#5a3a1a' });
  // finish
  if (p.x > course.d.length && g.state === 'run') finish();
  g.cam = L(g.cam, C(p.x - W * .35, 0, course.d.length + 400 - W), Math.min(1, dt * 8));
}
function finish() {
  g.state = 'done'; g.endT = 0; K.fanfare();
  const t = g.time, m = course.d.medals, medal = t <= m[0] ? 3 : t <= m[1] ? 2 : t <= m[2] ? 1 : 0;
  g.result = { t, medal, best: !save.best[course.i] || t < save.best[course.i] };
  if (g.result.best) save.best[course.i] = +t.toFixed(2);
  save.medals[course.i] = Math.max(save.medals[course.i] || 0, medal);
  persist();
  g.shout = { txt: medal === 3 ? 'OUTSTANDING, SOLDIER!' : medal ? 'NOT BAD, RECRUIT.' : 'MY GRANDMA IS FASTER!', t: 3 };
}

// ---------- art ----------
const bgC = document.createElement('canvas'); bgC.width = 1600; bgC.height = H;
const midC = document.createElement('canvas'); midC.width = 1600; midC.height = H;
const groundC = document.createElement('canvas'); groundC.width = 512; groundC.height = H - GY;
function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function buildArt() {
  let c = bgC.getContext('2d'), r = rng(11);
  // far hills
  const hills = (base, amp, col, f, ph) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= 1600; x += 10) c.lineTo(x, base - amp * (.6 + .4 * Math.sin(x / 1600 * Math.PI * 2 * f + ph)) - amp * .25 * Math.sin(x / 1600 * Math.PI * 2 * f * 3 + ph * 2)); c.lineTo(1600, H); c.fill(); };
  hills(360, 90, '#9cc0a0', 2, 0); hills(395, 70, '#7fae78', 3, 1.3);
  // tree line
  for (let x = 0; x < 1600; x += 14) { const h = 26 + r() * 30, y = 420; c.fillStyle = r() < .5 ? '#4e7e3a' : '#5a8c40'; c.beginPath(); c.moveTo(x - 12, y); c.lineTo(x, y - h); c.lineTo(x + 12, y); c.fill(); }
  c.fillStyle = '#4a7636'; c.fillRect(0, 416, 1600, H - 416);
  // mid layer: the camp
  c = midC.getContext('2d'); r = rng(5);
  const base = 452;
  const tent = (x, w) => {
    const h = w * .55, g2 = c.createLinearGradient(x, 0, x + w, 0); g2.addColorStop(0, '#6e7a3c'); g2.addColorStop(.5, '#8a9650'); g2.addColorStop(.51, '#5c6630'); g2.addColorStop(1, '#4e5828');
    c.fillStyle = g2; c.strokeStyle = '#2a2e14'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, base); c.lineTo(x + w * .5, base - h); c.lineTo(x + w, base); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#2a2e14'; c.beginPath(); c.moveTo(x + w * .42, base); c.lineTo(x + w * .5, base - h * .55); c.lineTo(x + w * .58, base); c.fill();
    c.strokeStyle = '#3a3a2a'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + w * .5, base - h); c.lineTo(x - 14, base); c.moveTo(x + w * .5, base - h); c.lineTo(x + w + 14, base); c.stroke();
  };
  const hut = (x, w) => {
    const h = 70; c.fillStyle = '#7d8a5a'; c.strokeStyle = '#2a2e14'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, base); c.lineTo(x, base - h * .55); c.quadraticCurveTo(x + w / 2, base - h * 1.45, x + w, base - h * .55); c.lineTo(x + w, base); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(40,46,20,.45)'; c.lineWidth = 1; for (let i = 1; i < 12; i++) { const xx = x + w * i / 12; c.beginPath(); c.moveTo(xx, base); c.lineTo(xx, base - h * (.55 + .45 * Math.sin(Math.PI * i / 12) * 1.0)); c.stroke(); }
    c.fillStyle = '#3a3a24'; c.fillRect(x + w / 2 - 12, base - 38, 24, 38); c.fillStyle = '#c8d8e0'; c.fillRect(x + 14, base - 34, 18, 14); c.fillRect(x + w - 32, base - 34, 18, 14);
    c.fillStyle = '#f0e6c0'; c.font = 'bold 11px "Black Ops One", Impact'; c.textAlign = 'center'; c.fillText('HQ', x + w / 2, base - 48);
  };
  const tower = x => {
    c.strokeStyle = '#5a3a1e'; c.lineWidth = 5; c.beginPath(); c.moveTo(x, base); c.lineTo(x + 8, base - 120); c.moveTo(x + 50, base); c.lineTo(x + 42, base - 120); c.stroke();
    c.lineWidth = 2.5; for (let i = 0; i < 3; i++) { const y1 = base - i * 38, y2 = base - (i + 1) * 38; c.beginPath(); c.moveTo(x + 2 + i * 2, y1); c.lineTo(x + 46 - (i + 1) * 2, y2); c.moveTo(x + 48 - i * 2, y1); c.lineTo(x + 4 + (i + 1) * 2, y2); c.stroke(); }
    c.fillStyle = '#7a5530'; c.fillRect(x - 6, base - 150, 62, 30); c.strokeStyle = '#2a1a0a'; c.lineWidth = 2; c.strokeRect(x - 6, base - 150, 62, 30);
    c.fillStyle = '#2a1a0a'; c.fillRect(x + 2, base - 145, 46, 10);
    c.fillStyle = '#5e6e34'; c.beginPath(); c.moveTo(x - 12, base - 150); c.lineTo(x + 25, base - 172); c.lineTo(x + 62, base - 150); c.closePath(); c.fill(); c.stroke();
  };
  const flag = x => { c.fillStyle = '#ccc'; c.fillRect(x, base - 170, 4, 170); c.fillStyle = '#c8282e'; c.fillRect(x + 4, base - 168, 46, 28); c.fillStyle = '#fff'; c.fillRect(x + 4, base - 159, 46, 9); c.fillStyle = '#2f4f8f'; c.fillRect(x + 4, base - 168, 18, 15); };
  const crates = x => { for (const [dx, dy] of [[0, 0], [30, 0], [15, -28]]) { c.fillStyle = '#9a7040'; c.fillRect(x + dx, base - 28 + dy, 28, 28); c.strokeStyle = '#4a3010'; c.lineWidth = 2; c.strokeRect(x + dx, base - 28 + dy, 28, 28); c.beginPath(); c.moveTo(x + dx, base - 28 + dy); c.lineTo(x + dx + 28, base + dy); c.stroke(); } };
  const truck = x => {
    c.fillStyle = '#5c6630'; c.strokeStyle = '#22260e'; c.lineWidth = 2; rr(c, x, base - 60, 110, 44, 4); c.fill(); c.stroke();
    c.fillStyle = '#6e7a3c'; rr(c, x + 110, base - 50, 44, 34, 5); c.fill(); c.stroke(); c.fillStyle = '#aac4d0'; c.fillRect(x + 126, base - 46, 22, 14);
    c.fillStyle = '#4e5828'; c.beginPath(); c.moveTo(x, base - 60); c.quadraticCurveTo(x + 55, base - 82, x + 110, base - 60); c.fill(); c.stroke();
    for (const wx of [x + 26, x + 84, x + 134]) { c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(wx, base - 14, 13, 0, 7); c.fill(); c.fillStyle = '#666'; c.beginPath(); c.arc(wx, base - 14, 5, 0, 7); c.fill(); }
  };
  tent(40, 120); tent(190, 100); tower(330); hut(440, 170); flag(650); crates(700); tent(800, 130); truck(980); tent(1180, 110); tower(1320); crates(1430); tent(1490, 90);
  // chain-link fence
  c.strokeStyle = 'rgba(90,90,90,.55)'; c.lineWidth = 1;
  for (let x = 0; x < 1600; x += 8) { c.beginPath(); c.moveTo(x, base); c.lineTo(x + 24, base - 34); c.moveTo(x + 24, base); c.lineTo(x, base - 34); c.stroke(); }
  c.fillStyle = '#777'; for (let x = 0; x < 1600; x += 100) c.fillRect(x, base - 40, 4, 40); c.fillRect(0, base - 40, 1600, 2);
  c.fillStyle = '#5c8c3a'; c.fillRect(0, base, 1600, H - base);
  // ground strip: grass lip + dirt track
  c = groundC.getContext('2d'); r = rng(9);
  const g2 = c.createLinearGradient(0, 0, 0, H - GY); g2.addColorStop(0, '#9a7448'); g2.addColorStop(.35, '#86603a'); g2.addColorStop(1, '#5a3e22');
  c.fillStyle = g2; c.fillRect(0, 0, 512, H - GY);
  for (let i = 0; i < 300; i++) { c.fillStyle = r() < .5 ? 'rgba(60,36,14,.35)' : 'rgba(220,190,140,.3)'; c.fillRect(r() * 512, 10 + r() * (H - GY), 2 + r() * 3, 2); }
  for (let i = 0; i < 26; i++) { c.fillStyle = r() < .5 ? '#8a8072' : '#a49a88'; c.beginPath(); c.ellipse(r() * 512, 18 + r() * 90, 3 + r() * 4, 2 + r() * 2, 0, 0, 7); c.fill(); }
  // boot prints
  c.fillStyle = 'rgba(50,30,12,.35)'; for (let x = 10; x < 512; x += 46) { c.beginPath(); c.ellipse(x, 12 + (x % 92 ? 0 : 8), 6, 2.5, 0, 0, 7); c.fill(); }
  c.fillStyle = '#5a9a34'; c.fillRect(0, 0, 512, 5);
  for (let x = 0; x < 512; x += 3) { const h = 3 + r() * 8; c.strokeStyle = r() < .5 ? '#4e8a2c' : '#6eb040'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, 4); c.lineTo(x + r() * 3 - 1, 4 - h); c.stroke(); }
}
function limb(c, x1, y1, x2, y2, w, col) { c.lineCap = 'round'; c.strokeStyle = '#1e1408'; c.lineWidth = w + 3.5; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
function drawSoldier(c, x, y, st, t, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  const skin = '#d89a6a', pants = '#6b7040', boot = '#2a2218', top = '#7d8a3a';
  let lean = 0, a1, a2, b1, b2, arm1, arm2, hy = -66, bodyY = 0;
  const p = t * 1.9;
  if (st === 'run') { a1 = Math.sin(p) * .9; a2 = -a1; b1 = Math.max(0, Math.cos(p)) * 1.1; b2 = Math.max(0, -Math.cos(p)) * 1.1; arm1 = -a1 * 1.1; arm2 = a1 * 1.1; lean = .12; bodyY = -Math.abs(Math.sin(p)) * 3; }
  else if (st === 'jump') { a1 = -.9; a2 = .5; b1 = 1.2; b2 = .5; arm1 = -2.4; arm2 = .8; lean = .05; }
  else if (st === 'slide') { c.rotate(-1.2); a1 = .9; a2 = .6; b1 = .1; b2 = .2; arm1 = -2.6; arm2 = -2.4; bodyY = 4; }
  else if (st === 'climb') { a1 = Math.sin(t) * .6 - .5; a2 = -Math.sin(t) * .6 - .5; b1 = 1.2; b2 = 1.2; arm1 = -2.9 + Math.sin(t) * .3; arm2 = -2.9 - Math.sin(t) * .3; }
  else if (st === 'trip') { c.rotate(.5); a1 = -.4; a2 = .8; b1 = .6; b2 = .3; arm1 = -1.8 + Math.sin(t * 6) * .6; arm2 = -1.2 - Math.sin(t * 6) * .6; }
  else { a1 = .08; a2 = -.08; b1 = .05; b2 = .05; arm1 = .25; arm2 = -.2; }
  c.translate(0, bodyY); c.rotate(lean);
  const leg = (a, b, col) => { const kx = Math.sin(a) * 16, ky = -30 + Math.cos(a) * 16; const fa = a - b, fx = kx + Math.sin(fa) * 16, fy = ky + Math.cos(fa) * 16; limb(c, 0, -30, kx, ky, 10, col); limb(c, kx, ky, fx, fy, 9, col); c.fillStyle = boot; c.beginPath(); c.ellipse(fx + 4, fy + 1, 9, 5, 0, 0, 7); c.fill(); };
  const arm = (a, col) => { const ex = Math.sin(a) * 13, ey = -54 + Math.cos(a) * 13, hx = ex + Math.sin(a + .5) * 12, hy2 = ey + Math.cos(a + .5) * 12; limb(c, 0, -54, ex, ey, 8, col); limb(c, ex, ey, hx, hy2, 7, skin); c.fillStyle = skin; c.beginPath(); c.arc(hx, hy2, 4.5, 0, 7); c.fill(); };
  arm(arm2, skin);
  leg(a2, b2, shade(pants, -20));
  // camo pants top + tank top
  c.fillStyle = pants; c.strokeStyle = '#1e1408'; c.lineWidth = 2; rr(c, -11, -38, 22, 12, 4); c.fill(); c.stroke();
  c.fillStyle = '#4a4e2a'; for (const [cx, cy] of [[-5, -34], [4, -31], [6, -36]]) { c.beginPath(); c.ellipse(cx, cy, 3, 2, 0, 0, 7); c.fill(); }
  const tg = c.createLinearGradient(-12, 0, 12, 0); tg.addColorStop(0, shade(top, -30)); tg.addColorStop(.5, shade(top, 20)); tg.addColorStop(1, shade(top, -40));
  c.fillStyle = tg; c.beginPath(); c.moveTo(-12, -60); c.lineTo(12, -60); c.lineTo(11, -36); c.lineTo(-11, -36); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = skin; c.beginPath(); c.ellipse(0, -60, 9, 4, 0, 0, Math.PI); c.fill();
  c.strokeStyle = '#c9c9c9'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-5, -60); c.lineTo(0, -50); c.lineTo(5, -60); c.stroke(); c.fillStyle = '#d6d6d6'; c.fillRect(-2, -51, 4, 5);
  leg(a1, b1, pants);
  // head
  c.fillStyle = skin; c.strokeStyle = '#3a200c'; c.lineWidth = 2;
  c.fillRect(-4, -66, 8, 8);
  c.beginPath(); c.ellipse(2, hy, 12, 13, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#3a2a1a'; c.beginPath(); c.ellipse(1, hy - 6, 12, 8, 0, Math.PI, 0); c.fill();
  c.fillStyle = '#c8282e'; c.fillRect(-10, hy - 7, 23, 4); c.fillRect(-13, hy - 6, 4, 9);
  c.fillStyle = '#fff'; c.beginPath(); c.ellipse(8, hy - 1, 3, 3.2, 0, 0, 7); c.fill(); c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(9, hy - .5, 1.6, 0, 7); c.fill();
  c.strokeStyle = '#2a1608'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(4, hy - 5); c.lineTo(11, hy - 4); c.stroke();
  c.lineWidth = 1.6; c.beginPath(); c.moveTo(12, hy + 1); c.lineTo(15, hy + 4); c.lineTo(12, hy + 5); c.stroke();
  c.beginPath(); if (st === 'trip') c.arc(9, hy + 9, 2.5, 0, 7); else { c.moveTo(6, hy + 8); c.lineTo(12, hy + 7); } c.stroke();
  arm(arm1, skin);
  c.restore();
}
function drawSergeant(c, x, y, t, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.fillStyle = '#2a2218'; c.fillRect(-12, -6, 10, 6); c.fillRect(4, -6, 10, 6);
  limb(c, -6, -34, -6, -4, 10, '#4a5030'); limb(c, 6, -34, 7, -4, 10, '#4a5030');
  const bg = c.createLinearGradient(-18, 0, 18, 0); bg.addColorStop(0, '#4a5a2a'); bg.addColorStop(.5, '#6e7e3e'); bg.addColorStop(1, '#3e4a22');
  c.fillStyle = bg; c.strokeStyle = '#1e1408'; c.lineWidth = 2; c.beginPath(); c.moveTo(-18, -70); c.quadraticCurveTo(0, -76, 18, -70); c.lineTo(17, -32); c.lineTo(-17, -32); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#e8c24a'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-14, -62 + i * 5); c.lineTo(-10, -64 + i * 5); c.lineTo(-6, -62 + i * 5); c.lineTo(-10, -60 + i * 5); c.fill(); }
  c.fillStyle = '#c88a5a'; c.beginPath(); c.ellipse(2, -86, 14, 15, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#4a5a2a'; c.beginPath(); c.ellipse(2, -96, 18, 6, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(2, -98, 12, Math.PI, 0); c.fill(); c.stroke();
  c.fillStyle = '#fff'; c.beginPath(); c.ellipse(8, -88, 3, 2.5, 0, 0, 7); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(9, -88, 1.4, 0, 7); c.fill();
  c.strokeStyle = '#2a1608'; c.lineWidth = 3; c.beginPath(); c.moveTo(3, -93); c.lineTo(12, -91); c.stroke();
  c.fillStyle = '#5a1a10'; c.beginPath(); c.ellipse(10, -78, 4, 3 + Math.abs(Math.sin(t * 10)) * 2, 0, 0, 7); c.fill();
  c.fillStyle = '#7a5a3a'; c.fillRect(4, -84, 10, 3);
  // megaphone arm
  limb(c, 10, -64, 22, -76, 8, '#5e6e34');
  c.fillStyle = '#e8e8e8'; c.strokeStyle = '#333'; c.lineWidth = 2; c.beginPath(); c.moveTo(22, -80); c.lineTo(40, -88); c.lineTo(40, -66); c.lineTo(22, -74); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#c8282e'; c.fillRect(38, -88, 4, 22);
  c.restore();
}
function sandbags(c, x, y) {
  for (const [dx, dy] of [[-16, 0], [0, 0], [16, 0], [-8, -11], [8, -11]]) { const g2 = c.createLinearGradient(0, y + dy - 12, 0, y + dy); g2.addColorStop(0, '#d8c494'); g2.addColorStop(1, '#a08a5a'); c.fillStyle = g2; c.strokeStyle = '#5a4a2a'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x + dx, y + dy - 6, 9, 6, 0, 0, 7); c.fill(); c.stroke(); }
}
function drawObstacle(c, o) {
  if (o.type === 'hurdle') {
    c.fillStyle = '#6a4424'; c.fillRect(o.x - 2, GY - 44, 5, 44); c.fillRect(o.x + o.w - 3, GY - 44, 5, 44);
    const g2 = c.createLinearGradient(0, GY - 48, 0, GY - 38); g2.addColorStop(0, '#fff'); g2.addColorStop(1, '#c8c8c8');
    c.fillStyle = g2; c.fillRect(o.x - 18, GY - 48, o.w + 36, 9);
    c.fillStyle = '#d8282e'; for (let i = 0; i < 4; i++) c.fillRect(o.x - 18 + i * 14, GY - 48, 7, 9);
    c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.5; c.strokeRect(o.x - 18, GY - 48, o.w + 36, 9);
  } else if (o.type === 'wire') {
    for (const px of [o.x, o.x + o.w]) { c.fillStyle = '#5a3a1e'; c.fillRect(px - 3, GY - 76, 6, 76); sandbags(c, px, GY); }
    c.strokeStyle = '#5a5a5a'; c.lineWidth = 2;
    for (const yy of [GY - 66, GY - 52, GY - 40]) {
      c.beginPath(); for (let x = o.x; x <= o.x + o.w; x += 8) c.lineTo(x, yy + Math.sin(x * .3) * 2); c.stroke();
      c.strokeStyle = '#888'; for (let x = o.x + 6; x < o.x + o.w; x += 16) { c.beginPath(); c.moveTo(x - 3, yy - 4); c.lineTo(x + 3, yy + 4); c.moveTo(x + 3, yy - 4); c.lineTo(x - 3, yy + 4); c.stroke(); } c.strokeStyle = '#5a5a5a';
    }
    c.fillStyle = '#e8c24a'; c.fillRect(o.x + o.w / 2 - 22, GY - 92, 44, 14); c.fillStyle = '#1a1a1a'; c.font = 'bold 10px Verdana'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('DUCK!', o.x + o.w / 2, GY - 85);
  } else if (o.type === 'wall') {
    // A-frame braces behind
    c.strokeStyle = '#4a2e14'; c.lineWidth = 6; c.beginPath(); c.moveTo(o.x + o.w + 30, GY); c.lineTo(o.x + o.w, GY - 110); c.stroke();
    for (let i = 0; i < 3; i++) { const px = o.x + i * o.w / 3, g2 = c.createLinearGradient(px, 0, px + o.w / 3, 0); g2.addColorStop(0, '#8a5a2c'); g2.addColorStop(.5, '#b8844c'); g2.addColorStop(1, '#7a4a20'); c.fillStyle = g2; c.fillRect(px, GY - 130 + (i % 2) * 3, o.w / 3, 130 - (i % 2) * 3); }
    c.strokeStyle = '#3a2210'; c.lineWidth = 2; c.strokeRect(o.x, GY - 130, o.w, 130);
    c.strokeStyle = 'rgba(58,34,16,.6)'; c.lineWidth = 1; for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(o.x + i * o.w / 3, GY - 130); c.lineTo(o.x + i * o.w / 3, GY); c.stroke(); }
    c.fillStyle = '#5a3a1e'; for (const yy of [GY - 110, GY - 40]) c.fillRect(o.x - 3, yy, o.w + 6, 7);
    c.fillStyle = '#ccc'; for (const yy of [GY - 107, GY - 37]) for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(o.x + 4 + i * (o.w - 8) / 2, yy, 1.4, 0, 7); c.fill(); }
    c.fillStyle = '#e8c24a'; c.fillRect(o.x - 2, GY - 134, o.w + 4, 6); c.fillStyle = '#1a1a1a'; for (let i = 0; i < o.w + 4; i += 8) c.fillRect(o.x - 2 + i, GY - 134, 4, 6);
    // knotted climbing rope
    c.strokeStyle = '#c8a46a'; c.lineWidth = 4; c.beginPath(); c.moveTo(o.x - 2, GY - 128); c.quadraticCurveTo(o.x - 12, GY - 70, o.x - 5, GY - 8); c.stroke();
    c.fillStyle = '#9a7a44'; for (let k = .2; k < 1; k += .2) { const ty = GY - 128 + k * 120; c.beginPath(); c.arc(o.x - 2 - Math.sin(k * Math.PI) * 7, ty, 4, 0, 7); c.fill(); }
  } else if (o.type === 'mud') {
    const g2 = c.createLinearGradient(0, GY - 4, 0, GY + 30); g2.addColorStop(0, '#6a4424'); g2.addColorStop(1, '#3a2410');
    c.fillStyle = g2; c.beginPath(); c.ellipse(o.x + o.w / 2, GY + 6, o.w / 2 + 10, 14, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(160,120,70,.6)'; for (let i = 0; i < 5; i++) { const bx = o.x + 20 + ((i * 53 + K.t * 20) % (o.w - 30)); c.beginPath(); c.arc(bx, GY + 2, 2 + (i % 3), 0, 7); c.fill(); }
  } else if (o.type === 'water') {
    c.fillStyle = '#5a3a1e'; c.fillRect(o.x - 4, GY, 6, H - GY); c.fillRect(o.x + o.w - 2, GY, 6, H - GY); sandbags(c, o.x - 20, GY + 2); sandbags(c, o.x + o.w + 20, GY + 2);
    const g2 = c.createLinearGradient(0, GY + 20, 0, H); g2.addColorStop(0, '#5aa8d8'); g2.addColorStop(1, '#1a4a78');
    c.fillStyle = g2; c.fillRect(o.x, GY + 22, o.w, H - GY);
    c.strokeStyle = 'rgba(230,248,255,.7)'; c.lineWidth = 2; for (let y = GY + 28; y < H; y += 16) { c.beginPath(); for (let x = o.x; x <= o.x + o.w; x += 8) c.lineTo(x, y + Math.sin(x * .06 + K.t * 3 + y) * 2); c.stroke(); }
  }
}
function drawWorld() {
  const cam = g ? g.cam : K.t * 60 % 3000;
  let sg = ctx.createLinearGradient(0, 0, 0, GY); sg.addColorStop(0, '#3f8ad8'); sg.addColorStop(.6, '#9fd0f0'); sg.addColorStop(1, '#e6f4f8');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, W, GY);
  const sun = ctx.createRadialGradient(650, 90, 10, 650, 90, 120); sun.addColorStop(0, 'rgba(255,250,210,1)'); sun.addColorStop(.25, 'rgba(255,240,170,.7)'); sun.addColorStop(1, 'rgba(255,240,170,0)');
  ctx.fillStyle = sun; ctx.fillRect(500, 0, 300, 250);
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < 4; i++) { const cx = ((i * 380 - cam * .05) % 1400 + 1400) % 1400 - 200, cy = 70 + i * 30; ctx.beginPath(); ctx.ellipse(cx, cy, 60, 18, 0, 0, 7); ctx.ellipse(cx + 40, cy - 10, 40, 18, 0, 0, 7); ctx.fill(); }
  const off = -((cam * .15) % 1600); ctx.drawImage(bgC, off, 0); ctx.drawImage(bgC, off + 1600, 0);
  const off2 = -((cam * .45) % 1600); ctx.drawImage(midC, off2, 0); ctx.drawImage(midC, off2 + 1600, 0);
  ctx.save(); ctx.translate(-Math.round(cam), 0);
  // ground with pits
  const pits = course ? course.obs.filter(o => o.type === 'water') : [];
  const segs = []; let sx = -400; for (const p of pits) { segs.push([sx, p.x]); sx = p.x + p.w; } segs.push([sx, 9000]);
  for (const [a, b] of segs) { ctx.save(); ctx.beginPath(); ctx.rect(a, GY, b - a, H - GY); ctx.clip(); for (let x = Math.floor((cam - 600) / 512) * 512; x < cam + W + 512; x += 512) if (x + 512 > a && x < b) ctx.drawImage(groundC, x, GY); ctx.restore(); }
  if (course) {
    // start banner and sergeant
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(60, GY - 190, 8, 190); ctx.fillRect(330, GY - 190, 8, 190);
    ctx.fillStyle = '#4a5a2a'; ctx.fillRect(56, GY - 196, 286, 44); ctx.strokeStyle = '#1e1408'; ctx.lineWidth = 3; ctx.strokeRect(56, GY - 196, 286, 44);
    K.outline('BOOT CAMP', 199, GY - 173, 26, '#f0e6c0', '#1e1408', STENCIL);
    drawSergeant(ctx, 40, GY, K.t, 1);
    for (const o of course.obs) if (o.x + o.w > cam - 60 && o.x < cam + W + 60) drawObstacle(ctx, o);
    // finish
    const fx = course.d.length;
    ctx.fillStyle = '#ddd'; ctx.fillRect(fx - 4, GY - 200, 8, 200); ctx.fillRect(fx + 196, GY - 200, 8, 200);
    for (let i = 0; i < 20; i++) for (let j = 0; j < 3; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; ctx.fillRect(fx + i * 10, GY - 200 + j * 10, 10, 10); }
    K.outline('FINISH', fx + 100, GY - 160, 22, '#ffe14a', '#1e1408', STENCIL);
    // markers every 500
    for (let m = 500; m < fx; m += 500) { if (m < cam - 50 || m > cam + W + 50) continue; ctx.fillStyle = '#fff'; ctx.fillRect(m - 1, GY - 30, 3, 30); ctx.font = 'bold 11px Verdana'; ctx.textAlign = 'center'; ctx.fillStyle = '#3a2a1a'; ctx.fillText(`${m / 10}m`, m, GY - 36); }
  }
  if (g) {
    const p = g.p;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; if (groundAt(p.x)) { ctx.beginPath(); ctx.ellipse(p.x, GY + 2, 16, 4, 0, 0, 7); ctx.fill(); }
    drawSoldier(ctx, p.x, p.y, p.st, p.anim, 1.15);
    for (const f of g.fx) { ctx.globalAlpha = C(f.life * 2.5, 0, 1); ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const pp of g.pops) { ctx.globalAlpha = 1 - Math.max(0, pp.t - .7) / .4; K.outline(pp.txt, pp.x, pp.y - pp.t * 40, 18, pp.col, '#1e1408', STENCIL); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
function plate(x, y, w, h) {
  const g2 = ctx.createLinearGradient(0, y, 0, y + h); g2.addColorStop(0, '#6e7e3e'); g2.addColorStop(1, '#3e4a22');
  ctx.fillStyle = g2; rr(ctx, x, y, w, h, 6); ctx.fill(); ctx.strokeStyle = '#1e1408'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#c9c9a0'; for (const [bx, by] of [[x + 7, y + 7], [x + w - 7, y + 7], [x + 7, y + h - 7], [x + w - 7, y + h - 7]]) { ctx.beginPath(); ctx.arc(bx, by, 2.5, 0, 7); ctx.fill(); }
}
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 100)).padStart(2, '0')}`;
function hud() {
  plate(CX - 100, 12, 200, 50);
  K.outline(fmt(g.time), CX, 38, 28, '#f6f0d0', '#1e1408', STENCIL);
  plate(16, 12, 220, 50);
  ctx.font = 'bold 13px Verdana'; ctx.textAlign = 'left'; ctx.fillStyle = '#f6f0d0'; ctx.fillText(course.d.name.toUpperCase(), 28, 30);
  const k = C(g.p.x / course.d.length, 0, 1);
  ctx.fillStyle = '#1e1408'; rr(ctx, 28, 40, 196, 10, 5); ctx.fill(); ctx.fillStyle = '#e8c24a'; rr(ctx, 28, 40, 196 * k, 10, 5); ctx.fill();
  plate(W - 236, 12, 220, 50);
  ctx.textAlign = 'right'; ctx.fillStyle = '#f6f0d0'; ctx.font = 'bold 13px Verdana';
  const b = save.best[course.i]; ctx.fillText(b ? `BEST ${fmt(b)}` : 'NO BEST YET', W - 28, 30);
  const m = course.d.medals; ctx.font = '11px Verdana'; ctx.fillText(`Gold ${m[0]}s  Silver ${m[1]}s  Bronze ${m[2]}s`, W - 28, 49);
  if (g.shout) { const a = C(g.shout.t * 3, 0, 1); ctx.globalAlpha = a; bubble(g.shout.txt); ctx.globalAlpha = 1; }
  if (g.state === 'count') { const n = Math.min(3, Math.ceil(g.count)); K.outline(n > 0 ? String(n) : 'GO!', CX, 250, 110, n > 0 ? '#ffffff' : '#7dff7a', '#1e1408', STENCIL); }
  K.hudButtons(() => { if (g.state !== 'done') paused = true; });
}
function bubble(txt) {
  ctx.font = `20px ${STENCIL}`; const w = ctx.measureText(txt).width + 40;
  ctx.fillStyle = '#fff'; rr(ctx, 70, 88, w, 44, 12); ctx.fill(); ctx.strokeStyle = '#1e1408'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(90, 132); ctx.lineTo(80, 150); ctx.lineTo(108, 132); ctx.fill();
  ctx.fillStyle = '#1e1408'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 90, 111);
}
function medalIcon(x, y, m, s = 1) {
  const cols = [['#888', '#555'], ['#f0b27a', '#9a5a22'], ['#eef2f6', '#8a98a8'], ['#ffe066', '#c99400']][m];
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#c8282e'; ctx.beginPath(); ctx.moveTo(-14, -40); ctx.lineTo(-4, -10); ctx.lineTo(4, -10); ctx.lineTo(-6, -40); ctx.fill(); ctx.fillStyle = '#2f6fb0'; ctx.beginPath(); ctx.moveTo(14, -40); ctx.lineTo(4, -10); ctx.lineTo(-4, -10); ctx.lineTo(6, -40); ctx.fill();
  const g2 = ctx.createRadialGradient(-6, -6, 2, 0, 0, 24); g2.addColorStop(0, '#fff'); g2.addColorStop(.4, cols[0]); g2.addColorStop(1, cols[1]);
  ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 8, 22, 0, 7); ctx.fill(); ctx.strokeStyle = cols[1]; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = cols[1]; ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 5 : 12, a = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(a) * r, 8 + Math.sin(a) * r); } ctx.fill();
  ctx.restore();
}

// ---------- screens ----------
let scene = 'loading', paused = false;
function toTitle() { scene = 'title'; g = null; course = null; paused = false; }
function drawTitle() {
  drawWorld();
  ctx.fillStyle = 'rgba(30,24,10,.35)'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(CX, 110); ctx.rotate(-.04);
  plate(-250, -54, 500, 108);
  K.outline('BOOT CAMP', 0, -16, 54, '#f0e6c0', '#1e1408', STENCIL);
  K.outline('DASH', 0, 34, 44, '#e8c24a', '#1e1408', STENCIL);
  ctx.restore();
  drawSoldier(ctx, 105, 545, 'run', K.t * 6, 2.1);
  drawSergeant(ctx, 690, 545, K.t, 2);
  COURSES.forEach((d, i) => {
    const y = 225 + i * 82;
    K.button(`${d.name.toUpperCase()} ▶`, CX, y, 320, 54, () => startCourse(i), { primary: i === 0, size: 20 });
    const m = save.medals[i] || 0, b = save.best[i];
    ctx.font = 'bold 14px Verdana'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1e1408'; ctx.lineWidth = 4;
    const t2 = b ? `Best ${fmt(b)}` : 'Not run yet'; ctx.strokeText(t2, CX, y + 38); ctx.fillText(t2, CX, y + 38);
    if (m) medalIcon(CX + 190, y + 6, m, .7);
  });
  ctx.fillStyle = 'rgba(30,24,10,.75)'; rr(ctx, CX - 190, 478, 380, 60, 10); ctx.fill();
  ctx.font = 'bold 14px Verdana'; ctx.fillStyle = '#f6f0d0'; ctx.textAlign = 'center';
  ctx.fillText('→ run    ↑ jump / climb walls    ↓ slide under wire', CX, 500);
  ctx.font = '12px Verdana'; ctx.fillText('Hit a hurdle and you trip. Fall in the water: +3 seconds.', CX, 522);
  K.iconBtn(16, 16, K.muted ? 'muted' : 'sound', K.toggleMute); K.iconBtn(W - 50, H - 46, 'full', K.toggleFs); K.watermark();
}
function overlays() {
  if (g.state === 'done' && g.endT > 1.4) {
    const r = g.result;
    K.panel(200, 120, 400, 360, '#6e7e3e', '#2e3818', '#e8dcb0');
    K.outline('COURSE COMPLETE', CX, 165, 30, '#f6f0d0', '#1e1408', STENCIL);
    K.outline(fmt(r.t), CX, 222, 46, '#ffe14a', '#1e1408', STENCIL);
    if (g.penalty) { ctx.font = 'bold 13px Verdana'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffb0a0'; ctx.fillText(`includes ${g.penalty}s water penalty`, CX, 255); }
    medalIcon(CX, 320, r.medal, 1.3);
    K.outline(['NO MEDAL', 'BRONZE', 'SILVER', 'GOLD'][r.medal], CX, 378, 22, '#fff', '#1e1408', STENCIL);
    if (r.best) K.outline('NEW BEST!', CX + 130, 300, 18, '#7dff7a', '#1e1408', STENCIL);
    K.button('RUN AGAIN', CX - 95, 438, 170, 48, () => startCourse(course.i), { primary: true, size: 18 });
    K.button(course.i < COURSES.length - 1 ? 'NEXT COURSE' : 'MENU', CX + 95, 438, 170, 48, () => course.i < COURSES.length - 1 ? startCourse(course.i + 1) : toTitle(), { size: 18 });
  }
  if (paused) {
    K.panel(250, 180, 300, 240, '#6e7e3e', '#2e3818', '#e8dcb0');
    K.outline('PAUSED', CX, 230, 44, '#f6f0d0', '#1e1408', STENCIL);
    K.button('RESUME ▶', CX, 305, 220, 54, () => { paused = false; }, { primary: true, size: 22 });
    K.button('QUIT', CX, 370, 140, 42, toTitle, { size: 16 });
  }
}
K.loop(dt => {
  if (scene === 'loading') K.loading(dt, () => { buildArt(); scene = 'title'; });
  else if (scene === 'title') drawTitle();
  else { if (!paused) update(dt); drawWorld(); hud(); overlays(); }
}, [`20px ${STENCIL}`]);

// ---------- input ----------
const KEYMAP = { ArrowRight: 'r', KeyD: 'r', ArrowLeft: 'l', KeyA: 'l', ArrowUp: 'u', KeyW: 'u', Space: 'u', ArrowDown: 'd', KeyS: 'd' };
addEventListener('keydown', e => {
  const k = KEYMAP[e.code];
  if (k && scene === 'play') e.preventDefault();
  if (k) K.keys[k] = 1;
  if (e.repeat) return;
  K.audio();
  if (k === 'u' && g && scene === 'play') g.p.jumpBuf = .12;
  if (e.code === 'Enter') K.pressPrimary();
  if ((e.code === 'KeyP' || e.code === 'Escape') && scene === 'play' && g.state !== 'done') paused = !paused;
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) K.keys[k] = 0; });
addEventListener('blur', () => { K.keys = {}; if (scene === 'play' && g && g.state === 'run') paused = true; });
K.bindPad(k => { if (k === 'u' && g && scene === 'play') g.p.jumpBuf = .12; });
window.BootCamp = { art: { buildArt, bgC, midC, groundC }, drawSoldier, drawSergeant, drawObstacle, medalIcon, debug: { startCourse, get g() { return g; }, get obs() { return course ? course.obs : []; }, K } };
})();
