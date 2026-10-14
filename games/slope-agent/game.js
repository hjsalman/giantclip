/* Slope Agent - snowboard stunt game. Uses GCKit. */
(() => {
'use strict';
const K = GCKit('sa', 'Slope Agent', 'sa');
const { ctx, W, H, CX, L, C, R, rr, shade, store } = K;
const GRAV = 1500;
let save = Object.assign({ best: 0, bestTrick: 0, runs: 0 }, store.get('sa-save', {}));
function persist() { store.set('sa-save', save); window.dispatchEvent(new CustomEvent('sa-awards', { detail: save })); }
const sfx = {
  carve() { K.noise(.08, 3000, .6, .05); },
  jump() { K.noise(.2, 1200, .8, .2); K.tone(300, .15, .08, 'triangle', 500); },
  land(good) { K.noise(.15, 600, .7, .4, 'lowpass'); if (good) { K.tone(660, .1, .12, 'square'); setTimeout(() => K.tone(990, .15, .12, 'square'), 80); } },
  crash() { K.noise(.6, 400, .5, .6, 'lowpass'); K.tone(220, .4, .2, 'sawtooth', 60); },
  coin() { K.tone(1320, .06, .1, 'square'); setTimeout(() => K.tone(1760, .1, .1, 'square'), 50); },
  flip() { K.noise(.1, 2000, 2, .08); },
};

// ---------- terrain ----------
// Heightfield sampled every 20px. Slope goes downhill to the right.
const SEG = 20;
let terrain = [], ramps = [], coinsList = [], flags = [], trees = [];
function genTerrain() {
  terrain = []; ramps = []; coinsList = []; flags = []; trees = [];
  let y = 300, slope = .35, x = 0, rampCd = 1400;
  const N = 2400;
  for (let i = 0; i < N; i++) {
    x = i * SEG;
    if (i < 40) slope = .32;
    else if (Math.random() < .03) slope = C(slope + R(-.15, .15), .15, .55);
    y += slope * SEG;
    terrain.push(y);
    rampCd -= SEG;
    if (rampCd <= 0 && i > 60 && i < N - 80) {
      // build a kicker: rise over k segments, then a gap with landing slope
      const k = Math.floor(R(5, 9)), lift = R(50, 110);
      for (let j = 1; j <= k; j++) { y = terrain[i] + slope * SEG * j - lift * Math.sin(j / k * Math.PI / 2); terrain.push(y); }
      ramps.push({ x: (i + k) * SEG, y: terrain[terrain.length - 1], lift });
      i += k;
      // landing drop: steeper slope for a bit
      const drop = Math.floor(R(12, 20));
      for (let j = 0; j < drop; j++) { i++; y += (slope + .35) * SEG; terrain.push(y); }
      rampCd = R(900, 1600);
      // coins arc above the gap
      const rx = ramps[ramps.length - 1].x, ry = ramps[ramps.length - 1].y;
      for (let j = 1; j <= 5; j++) coinsList.push({ x: rx + j * 55, y: ry - 70 - Math.sin(j / 6 * Math.PI) * 60 + j * 22, got: false });
    }
    if (Math.random() < .08) trees.push({ x: x + R(0, SEG), s: R(.6, 1.2), behind: Math.random() < .7 });
    if (i % 90 === 45) flags.push({ x, side: (i / 90 | 0) % 2 });
  }
  terrain.length = Math.min(terrain.length, N + 200);
}
const groundY = x => { const i = C(Math.floor(x / SEG), 0, terrain.length - 2), k = (x - i * SEG) / SEG; return terrain[i] + (terrain[i + 1] - terrain[i]) * k; };
const groundAng = x => Math.atan2(groundY(x + 8) - groundY(x - 8), 16);

// ---------- run ----------
let g = null;
function newRun() {
  genTerrain();
  g = { p: { x: 200, y: groundY(200), vx: 260, vy: 0, ang: groundAng(200), on: true, spin: 0, air: 0, trick: '', grab: 0, crashed: 0, tuck: 0 },
        cam: { x: 0, y: 0 }, score: 0, time: 90, state: 'play', endT: 0, fx: [], pops: [], combo: 0, comboT: 0, coins: 0, tricks: 0, bestTrick: 0, snow: [] };
  scene = 'play'; paused = false; save.runs++; persist();
}
function pop(txt, x, y, col = '#ffe14a', size = 22) { g.pops.push({ txt, x, y, t: 0, col, size }); }
function update(dt) {
  g.endT += dt;
  for (const f of g.fx) { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; }
  g.fx = g.fx.filter(f => f.life > 0);
  for (const p of g.pops) p.t += dt; g.pops = g.pops.filter(p => p.t < 1.2);
  if (g.state !== 'play') return;
  g.time -= dt; if (g.time <= 0) { g.time = 0; end(); return; }
  const p = g.p, keys = K.keys;
  if (p.crashed > 0) {
    p.crashed -= dt; p.vx = L(p.vx, 120, dt * 2); p.x += p.vx * dt; p.y = groundY(p.x); p.ang = groundAng(p.x);
    if (p.crashed <= 0) { p.spin = 0; }
    return;
  }
  if (p.on) {
    const a = groundAng(p.x);
    const acc = GRAV * Math.sin(a) * (a > 0 ? .55 : .12) + (keys.r ? 160 : 0) - (keys.l ? 380 : 0) - p.vx * .12;
    p.vx = C(p.vx + acc * dt, 120, 760);
    const px0 = p.x;
    p.x += p.vx * Math.cos(a) * dt;
    const ny = groundY(p.x);
    // leaving a ramp lip
    const lipR = ramps.find(r => px0 < r.x && p.x >= r.x);
    if (lipR) {
      p.on = false; p.x = lipR.x + 1; const lift = lipR.lift;
      p.vy = -p.vx * Math.sin(-a) - (keys.u ? 260 : 120) - lift * 1.6; p.air = 0; p.spin = 0; p.trick = ''; p.flips = 0; sfx.jump();
    } else p.y = ny;
    p.ang = L(p.ang, a, Math.min(1, dt * 14));
    if (Math.random() < p.vx / 900) g.fx.push({ x: p.x - 10, y: p.y, vx: R(-120, -20), vy: R(-80, -10), life: R(.3, .6), r: R(2, 4), col: 'rgba(255,255,255,.9)' });
    if (keys.u && p.jumpReady) { p.on = false; p.vy = -380; p.jumpReady = false; p.air = 0; p.spin = 0; p.flips = 0; sfx.jump(); }
    if (!keys.u) p.jumpReady = true;
  } else {
    p.air += dt;
    p.vy += GRAV * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const rot = (keys.l ? -1 : 0) + (keys.r ? 1 : 0);
    const before = p.spin;
    p.spin += rot * 7.2 * dt; p.ang += rot * 7.2 * dt;
    if (Math.floor(Math.abs(p.spin) / (Math.PI * 2)) > Math.floor(Math.abs(before) / (Math.PI * 2))) { p.flips++; sfx.flip(); pop(`${p.spin > 0 ? 'FRONT' : 'BACK'} FLIP x${p.flips}`, p.x, p.y - 60, '#9fe0ff', 18); }
    p.grab = keys.d ? Math.min(1, p.grab + dt * 6) : Math.max(0, p.grab - dt * 6);
    if (p.grab > .9) p.grabT = (p.grabT || 0) + dt;
    const gy = groundY(p.x);
    if (p.y >= gy) {
      p.y = gy; p.on = true;
      const a = groundAng(p.x);
      let diff = ((p.ang - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      if (Math.abs(diff) > .7 || p.grab > .5) crash();
      else land(Math.abs(diff));
      p.grab = 0; p.grabT = 0;
    }
  }
  // coins
  for (const c of coinsList) if (!c.got && Math.abs(c.x - p.x) < 22 && Math.abs(c.y - (p.y - 22)) < 30) { c.got = true; g.coins++; g.score += 50; sfx.coin(); pop('+50', c.x, c.y - 10); }
  // flags pass bonus
  for (const f of flags) if (!f.passed && p.x > f.x) { f.passed = true; g.score += 10; }
  g.comboT -= dt; if (g.comboT <= 0) g.combo = 0;
  if (p.x > (terrain.length - 60) * SEG) end();
  // camera
  const tx = p.x - 260, ty = p.y - H * .5 + Math.max(0, p.vy) * .05;
  g.cam.x = L(g.cam.x, tx, Math.min(1, dt * 6)); g.cam.y = L(g.cam.y, ty, Math.min(1, dt * 5));
}
function land(err) {
  const p = g.p;
  const flips = p.flips || 0, airPts = Math.floor(p.air * 60), grab = (p.grabT || 0) > .15;
  let pts = airPts, name = [];
  if (flips) { pts += flips * 300; name.push(flips > 1 ? `${flips}x ${p.spin > 0 ? 'FRONT' : 'BACK'}FLIP` : `${p.spin > 0 ? 'FRONT' : 'BACK'}FLIP`); }
  if (grab) { pts += 150 + Math.floor(p.grabT * 200); name.push('INDY GRAB'); }
  const perfect = err < .2 && p.air > .4;
  if (perfect) { pts = Math.floor(pts * 1.5); name.push('PERFECT!'); }
  if (p.air > .45) {
    g.combo++; g.comboT = 3; const mult = Math.min(5, g.combo);
    pts *= mult; g.score += pts; g.tricks++;
    if (pts > g.bestTrick) g.bestTrick = pts;
    pop(name.length ? name.join(' + ') : 'BIG AIR', p.x, p.y - 90, perfect ? '#7dff7a' : '#ffe14a', 20);
    pop(`+${pts}${mult > 1 ? `  x${mult}` : ''}`, p.x, p.y - 60, '#fff', 18);
    sfx.land(true);
  } else sfx.land(false);
  for (let i = 0; i < 12; i++) g.fx.push({ x: p.x, y: p.y, vx: R(-160, 160), vy: R(-200, -40), life: R(.3, .7), r: R(2, 5), col: 'rgba(255,255,255,.95)' });
}
function crash() {
  const p = g.p; p.crashed = 1.6; p.vx *= .4; g.combo = 0; sfx.crash();
  pop('WIPEOUT!', p.x, p.y - 80, '#ff8a6a', 26);
  for (let i = 0; i < 30; i++) g.fx.push({ x: p.x, y: p.y - 10, vx: R(-220, 220), vy: R(-320, -60), life: R(.5, 1), r: R(3, 7), col: 'rgba(255,255,255,.95)' });
}
function end() {
  g.state = 'done'; g.endT = 0; K.fanfare();
  g.newBest = g.score > save.best; save.best = Math.max(save.best, g.score); save.bestTrick = Math.max(save.bestTrick, g.bestTrick); persist();
}

// ---------- art ----------
const mtnC = document.createElement('canvas'); mtnC.width = 1600; mtnC.height = H;
function buildArt() {
  const c = mtnC.getContext('2d');
  const range = (base, amp, col, snow, seed) => {
    let s = seed; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const pts = []; for (let i = 0; i <= 10; i++) pts.push([i * 160, base - amp * (.4 + r() * .6)]); pts[10][1] = pts[0][1];
    c.fillStyle = col; c.beginPath(); c.moveTo(0, H); for (const [x, y] of pts) c.lineTo(x, y); c.lineTo(1600, H); c.fill();
    c.fillStyle = snow; for (const [x, y] of pts) { if (y > base - amp * .5) continue; c.beginPath(); c.moveTo(x - 50, y + 40); c.lineTo(x, y); c.lineTo(x + 50, y + 40); for (let k = 0; k < 5; k++) c.lineTo(x + 50 - k * 25, y + 34 + (k % 2) * 12); c.fill(); }
  };
  range(360, 220, '#8aa4c8', '#ffffff', 5); range(420, 150, '#6e88b0', '#eef4fb', 9);
}
function drawTree(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.fillStyle = '#5a3a1e'; c.fillRect(-4, -14, 8, 14);
  for (let i = 0; i < 4; i++) {
    const w = 34 - i * 7, yy = -14 - i * 20;
    c.fillStyle = i % 2 ? '#2e6a3a' : '#25583a'; c.beginPath(); c.moveTo(-w, yy); c.lineTo(0, yy - 34); c.lineTo(w, yy); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-w * .7, yy - 6); c.lineTo(0, yy - 34); c.lineTo(w * .5, yy - 8); c.quadraticCurveTo(0, yy - 14, -w * .7, yy - 6); c.fill();
  }
  c.restore();
}
function limb(c, x1, y1, x2, y2, w, col) { c.lineCap = 'round'; c.strokeStyle = '#141c28'; c.lineWidth = w + 3.5; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
function drawRider(c, x, y, ang, crouch, grab, crashed, s = 1) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  if (crashed) { c.rotate(Math.sin(crashed * 12) * .3 + 1.4); }
  const cr = crouch * 8;
  // board
  const bg = c.createLinearGradient(0, -4, 0, 4); bg.addColorStop(0, '#ff5a3a'); bg.addColorStop(1, '#a8201a');
  c.fillStyle = bg; c.strokeStyle = '#141c28'; c.lineWidth = 2.5; rr(c, -30, -5, 60, 8, 4); c.fill(); c.stroke();
  c.fillStyle = '#ffe14a'; c.fillRect(-12, -4, 24, 3);
  // legs
  const kx = 4 + grab * 4, ky = -20 + cr + grab * 6;
  limb(c, -10, -4, kx - 8, ky, 9, '#1a2a4a'); limb(c, kx - 8, ky, -2, -32 + cr + grab * 10, 10, '#1a2a4a');
  limb(c, 10, -4, kx + 6, ky, 9, '#22345a'); limb(c, kx + 6, ky, 4, -32 + cr + grab * 10, 10, '#22345a');
  // torso: black suit with tie (secret agent on a board)
  const ty = -32 + cr + grab * 10;
  c.save(); c.translate(0, ty); c.rotate(.15 + grab * .5);
  c.fillStyle = '#1a1e28'; c.beginPath(); c.moveTo(-10, 0); c.lineTo(10, 0); c.lineTo(9, -26); c.lineTo(-9, -26); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-3, -26); c.lineTo(3, -26); c.lineTo(0, -12); c.fill();
  c.fillStyle = '#c8282e'; c.beginPath(); c.moveTo(-1.5, -24); c.lineTo(1.5, -24); c.lineTo(2, -14); c.lineTo(0, -11); c.lineTo(-2, -14); c.fill();
  // arms
  if (grab > .3) { limb(c, 4, -22, 14, -2, 7, '#1a1e28'); limb(c, 14, -2, 18, 22 - grab * 4, 6, '#1a1e28'); }
  else { limb(c, 4, -22, 20, -14, 7, '#1a1e28'); limb(c, 20, -14, 30, -18, 6, '#1a1e28'); }
  limb(c, -4, -22, -18, -12, 7, '#1a1e28'); limb(c, -18, -12, -28, -16, 6, '#1a1e28');
  c.fillStyle = '#e6b48e'; c.beginPath(); c.arc(30, -18, 4, 0, 7); c.arc(-28, -16, 4, 0, 7); c.fill();
  // head: beanie + goggles
  c.fillStyle = '#e6b48e'; c.strokeStyle = '#141c28'; c.lineWidth = 2; c.beginPath(); c.ellipse(2, -36, 10, 11, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#ff7a1a'; c.beginPath(); c.arc(2, -40, 11, Math.PI, 0); c.fill(); c.stroke();
  c.fillStyle = '#ffe14a'; c.fillRect(-9, -42, 22, 4);
  c.fillStyle = '#fff'; c.beginPath(); c.arc(2, -52, 4, 0, 7); c.fill();
  const gg = c.createLinearGradient(0, -40, 0, -32); gg.addColorStop(0, '#9fe0ff'); gg.addColorStop(1, '#2a6aa8');
  c.fillStyle = gg; rr(c, 0, -40, 13, 7, 3); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(2, -39, 4, 2);
  c.strokeStyle = '#141c28'; c.lineWidth = 1.6; c.beginPath(); c.arc(7, -29, 3, .3, Math.PI - .3); c.stroke();
  c.restore();
  c.restore();
}

// ---------- render ----------
function drawWorld() {
  const cam = g ? g.cam : { x: K.t * 120, y: 0 };
  const sg = ctx.createLinearGradient(0, 0, 0, H); sg.addColorStop(0, '#3a7ad0'); sg.addColorStop(.6, '#9fd0f4'); sg.addColorStop(1, '#e8f4fc');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
  const off = -((cam.x * .1) % 1600); ctx.drawImage(mtnC, off, -cam.y * .05 + 40); ctx.drawImage(mtnC, off + 1600, -cam.y * .05 + 40);
  if (!terrain.length) return;
  ctx.save(); ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  const x0 = Math.max(0, Math.floor(cam.x / SEG) - 2), x1 = Math.min(terrain.length - 1, Math.ceil((cam.x + W) / SEG) + 2);
  for (const t of trees) if (t.behind && t.x > cam.x - 60 && t.x < cam.x + W + 60) drawTree(ctx, t.x, groundY(t.x) + 6, t.s);
  // snow body
  ctx.beginPath(); ctx.moveTo(x0 * SEG, terrain[x0]);
  for (let i = x0; i <= x1; i++) ctx.lineTo(i * SEG, terrain[i]);
  ctx.lineTo(x1 * SEG, cam.y + H + 400); ctx.lineTo(x0 * SEG, cam.y + H + 400); ctx.closePath();
  const snow = ctx.createLinearGradient(0, cam.y, 0, cam.y + H); snow.addColorStop(0, '#ffffff'); snow.addColorStop(1, '#cfe2f4');
  ctx.fillStyle = snow; ctx.fill();
  ctx.strokeStyle = '#9fc0e0'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = x0; i <= x1; i++) ctx.lineTo(i * SEG, terrain[i]); ctx.stroke();
  ctx.strokeStyle = 'rgba(160,190,220,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = x0; i <= x1; i++) ctx.lineTo(i * SEG, terrain[i] + 14); ctx.stroke();
  // ramps highlight
  for (const r of ramps) { if (r.x < cam.x - 50 || r.x > cam.x + W + 50) continue; ctx.fillStyle = '#5ab0f0'; ctx.fillRect(r.x - 4, r.y - 2, 6, 14); ctx.fillStyle = '#ff5a3a'; ctx.beginPath(); ctx.moveTo(r.x - 1, r.y - 40); ctx.lineTo(r.x + 18, r.y - 33); ctx.lineTo(r.x - 1, r.y - 26); ctx.fill(); ctx.fillStyle = '#5a3a1e'; ctx.fillRect(r.x - 2, r.y - 42, 3, 42); }
  // flags (gates)
  for (const f of flags) { if (f.x < cam.x - 40 || f.x > cam.x + W + 40) continue; const y = groundY(f.x); ctx.fillStyle = '#333'; ctx.fillRect(f.x - 1, y - 50, 3, 50); ctx.fillStyle = f.side ? '#2f6fd0' : '#d8282e'; ctx.beginPath(); ctx.moveTo(f.x + 2, y - 50); ctx.lineTo(f.x + 26, y - 42); ctx.lineTo(f.x + 2, y - 34); ctx.fill(); }
  // coins
  for (const c of coinsList) { if (c.got || c.x < cam.x - 30 || c.x > cam.x + W + 30) continue; const sq = Math.abs(Math.cos(K.t * 3 + c.x)); ctx.save(); ctx.translate(c.x, c.y); ctx.scale(Math.max(.25, sq), 1); const cg = ctx.createRadialGradient(-3, -3, 1, 0, 0, 11); cg.addColorStop(0, '#fff6b0'); cg.addColorStop(.6, '#ffc21a'); cg.addColorStop(1, '#a87a00'); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill(); ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
  if (g) {
    const p = g.p;
    const gy = groundY(p.x); if (!p.on) { ctx.fillStyle = 'rgba(40,70,110,.18)'; ctx.beginPath(); ctx.ellipse(p.x, gy, Math.max(6, 24 - (gy - p.y) * .05), 4, 0, 0, 7); ctx.fill(); }
    drawRider(ctx, p.x, p.y, p.ang, p.on ? C((p.vx - 300) / 400, 0, 1) : .3, p.grab, p.crashed);
    for (const f of g.fx) { ctx.globalAlpha = C(f.life * 2.5, 0, 1); ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const pp of g.pops) { ctx.globalAlpha = 1 - Math.max(0, pp.t - .8) / .4; K.outline(pp.txt, pp.x, pp.y - pp.t * 40, pp.size, pp.col, '#0d2350'); }
    ctx.globalAlpha = 1;
  }
  for (const t of trees) if (!t.behind && t.x > cam.x - 60 && t.x < cam.x + W + 60) drawTree(ctx, t.x, groundY(t.x) + 30, t.s * 1.3);
  ctx.restore();
  // falling snow
  if (!g) return;
  if (g.snow.length < 70) g.snow.push({ x: R(0, W), y: -10, v: R(40, 100), r: R(1, 3) });
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  for (const f of g.snow) { f.y += f.v / 60; f.x -= (g.p.vx / 60) * .15; if (f.x < 0) f.x += W; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); }
  g.snow = g.snow.filter(f => f.y < H + 10);
}
function hud() {
  const box = (x, y, w, h) => { ctx.fillStyle = 'rgba(13,35,80,.75)'; rr(ctx, x, y, w, h, 10); ctx.fill(); ctx.strokeStyle = '#9fe0ff'; ctx.lineWidth = 2; ctx.stroke(); };
  box(14, 12, 220, 60);
  K.outline(String(g.score), 28, 36, 28, '#fff', '#0d2350', 'Bungee, Impact', 'left');
  ctx.font = 'bold 12px Verdana'; ctx.textAlign = 'left'; ctx.fillStyle = '#9fe0ff'; ctx.fillText(`BEST ${save.best}`, 28, 62);
  if (g.combo > 1) K.outline(`COMBO x${Math.min(5, g.combo)}`, 160, 60, 14, '#ffe14a', '#0d2350');
  box(W - 140, 12, 126, 60);
  const t = Math.ceil(g.time); K.outline(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, W - 77, 42, 30, g.time < 10 && Math.floor(K.t * 4) % 2 ? '#ff6a6a' : '#fff', '#0d2350');
  const k = C(g.p.x / ((terrain.length - 60) * SEG), 0, 1);
  ctx.fillStyle = 'rgba(13,35,80,.6)'; rr(ctx, CX - 150, 22, 300, 10, 5); ctx.fill(); ctx.fillStyle = '#9fe0ff'; rr(ctx, CX - 150, 22, 300 * k, 10, 5); ctx.fill();
  K.hudButtons(() => { if (g.state === 'play') paused = true; });
}

// ---------- screens ----------
let scene = 'loading', paused = false;
function toTitle() { scene = 'title'; g = null; paused = false; }
function drawTitle() {
  if (!terrain.length) genTerrain();
  drawWorld();
  ctx.fillStyle = 'rgba(13,35,80,.35)'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(CX, 110); ctx.rotate(-.06);
  const lg = ctx.createLinearGradient(0, -40, 0, 30); lg.addColorStop(0, '#ffffff'); lg.addColorStop(.5, '#9fe0ff'); lg.addColorStop(1, '#2f6fd0');
  K.outline('SLOPE', -70, -10, 70, lg, '#0d2350'); K.outline('AGENT', 120, 40, 56, '#ff7a1a', '#0d2350');
  ctx.restore();
  drawRider(ctx, 115, 520, -.35 + Math.sin(K.t * 2) * .1, .3, (Math.sin(K.t) + 1) / 2, 0, 2.2);
  K.button('PLAY ▶', CX, 290, 240, 72, newRun, { primary: true, size: 38 });
  ctx.fillStyle = 'rgba(13,35,80,.8)'; rr(ctx, CX - 170, 350, 340, 118, 12); ctx.fill(); ctx.strokeStyle = '#9fe0ff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Verdana';
  ctx.fillText('↑ jump     → speed up     ← slow down', CX, 376);
  ctx.fillText('In the air: ← → to flip,  ↓ hold to grab', CX, 402);
  ctx.font = '12px Verdana'; ctx.fillStyle = '#cfe6ff'; ctx.fillText('Land with your board flat to the snow, and let go of grabs', CX, 428);
  ctx.fillText('before you touch down. Chain tricks for combos!', CX, 446);
  if (save.best) K.outline(`BEST ${save.best}`, CX, 505, 22, '#ffe14a', '#0d2350');
  K.iconBtn(16, 16, K.muted ? 'muted' : 'sound', K.toggleMute); K.iconBtn(W - 50, H - 46, 'full', K.toggleFs); K.watermark();
}
function overlays() {
  if (g.state === 'done' && g.endT > 1) {
    K.panel(210, 120, 380, 360);
    K.outline('RUN OVER!', CX, 165, 36, '#fff', '#0d2350');
    K.outline(String(g.score), CX, 225, 52, '#ffe14a', '#0d2350');
    ctx.font = 'bold 15px Verdana'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8f6ff';
    ctx.fillText(g.newBest ? 'NEW BEST SCORE!' : `Best: ${save.best}`, CX, 272);
    ctx.fillText(`Tricks landed: ${g.tricks}    Coins: ${g.coins}`, CX, 302);
    ctx.fillText(`Best single trick: ${g.bestTrick}`, CX, 328);
    K.button('RIDE AGAIN ▶', CX, 392, 240, 56, newRun, { primary: true, size: 22 });
    K.button('MENU', CX, 450, 140, 40, toTitle, { size: 16 });
  }
  if (paused) {
    K.panel(250, 180, 300, 240);
    K.outline('PAUSED', CX, 230, 44, '#fff', '#0d2350');
    K.button('RESUME ▶', CX, 305, 220, 54, () => { paused = false; }, { primary: true, size: 22 });
    K.button('MENU', CX, 370, 140, 42, toTitle, { size: 16 });
  }
}
K.loop(dt => {
  if (scene === 'loading') K.loading(dt, () => { buildArt(); scene = 'title'; });
  else if (scene === 'title') drawTitle();
  else { if (!paused) update(dt); drawWorld(); hud(); overlays(); }
});
const KEYMAP = { ArrowRight: 'r', KeyD: 'r', ArrowLeft: 'l', KeyA: 'l', ArrowUp: 'u', KeyW: 'u', Space: 'u', ArrowDown: 'd', KeyS: 'd' };
addEventListener('keydown', e => {
  const k = KEYMAP[e.code];
  if (k && scene === 'play') e.preventDefault();
  if (k) K.keys[k] = 1;
  if (e.repeat) return;
  K.audio();
  if (e.code === 'Enter') K.pressPrimary();
  if ((e.code === 'KeyP' || e.code === 'Escape') && scene === 'play' && g.state === 'play') paused = !paused;
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) K.keys[k] = 0; });
addEventListener('blur', () => { K.keys = {}; if (scene === 'play' && g && g.state === 'play') paused = true; });
K.bindPad();
window.SlopeAgent = { drawRider, drawTree, debug: { newRun, get g() { return g; }, K, get ramps() { return ramps; } } };
})();
