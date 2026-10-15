/* Code Red Pursuit - 3D getaway driving. Chase camera, city grid, minimap top right.
   Game logic runs on a flat 2D plane (x, y); three.js draws it in 3D (x, z). */
(() => {
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  let best = store.get("nsa-pursuit-best", 0);
  const bestEl = document.getElementById("best");
  bestEl.textContent = best.toLocaleString();

  const cv = document.getElementById("game"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  const CELL = 420, ROAD = 130, N = 8, WORLD = CELL * N, S = 0.1;
  const overlay = document.getElementById("overlay"), ovTitle = document.getElementById("ovTitle"),
        ovText = document.getElementById("ovText"), playBtn = document.getElementById("playBtn"),
        pauseBtn = document.getElementById("pauseBtn");
  const THREE_URL = new URL("../common/three.module.min.js", document.currentScript.src).href;

  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------- city layout (same footprint the physics uses) ----------
  const blocks = [];
  const rng = mulberry(7);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const park = rng() < 0.12;
    blocks.push({ x: i * CELL + ROAD / 2, y: j * CELL + ROAD / 2, s: CELL - ROAD, park, i, j });
  }

  const keys = { up: false, down: false, left: false, right: false, drift: false };
  let traffic = [];
  let state = "menu", player, cops, cash, sparks, time, score, money, spawnT, last = 0, shake = 0, msg = "", msgT = 0;

  function roadPoint() {
    for (let tries = 0; tries < 50; tries++) {
      const along = 60 + Math.random() * (WORLD - 120);
      const line = Math.floor(Math.random() * (N - 1) + 1) * CELL;
      const p = Math.random() < .5 ? { x: line, y: along } : { x: along, y: line };
      if (!player || Math.hypot(p.x - player.x, p.y - player.y) > 500) return p;
    }
    return { x: CELL, y: CELL };
  }
  function newCar(x, y, a) { return { x, y, a, v: 0, vx: 0, vy: 0, r: 15, steer: 0, w: 0, delta: 0, slipR: 0 }; }
  function reset() {
    player = newCar(CELL * 4, CELL * 4 + 30, 0); player.hp = 100; player.phys = true;
    traffic = []; for (let i = 0; i < 16; i++) traffic.push(newTraffic());
    if (cops) for (const c of cops) if (c.mesh) c.mesh.visible = false;
    cops = []; cash = []; sparks = [];
    time = 0; money = 0; score = 0; spawnT = 2.5;
    for (let i = 0; i < 6; i++) cash.push(roadPoint());
    for (let i = 0; i < 2; i++) { const p = roadPoint(); cops.push(Object.assign(newCar(p.x, p.y, 0), { stuck: 0, rev: 0 })); }
    flash("They're on to you");
    if (view) view.sync(true);
  }
  function flash(t) { msg = t; msgT = 2; }
  function wanted() { return Math.min(5, 1 + Math.floor(time / 25)); }

  function collideBlocks(c) {
    let hit = false;
    for (const b of blocks) {
      if (b.park) continue;
      const nx = Math.max(b.x, Math.min(c.x, b.x + b.s)), ny = Math.max(b.y, Math.min(c.y, b.y + b.s));
      const dx = c.x - nx, dy = c.y - ny, d = Math.hypot(dx, dy);
      if (d < c.r) {
        const ux = d ? dx / d : 0, uy = d ? dy / d : -1;
        c.x = nx + ux * c.r; c.y = ny + uy * c.r;
        const vn = c.vx * ux + c.vy * uy;
        if (vn < 0) { c.vx -= vn * ux * 1.4; c.vy -= vn * uy * 1.4; }
        hit = Math.abs(vn) > 120 ? Math.abs(vn) : (hit || 1);
      }
    }
    c.x = Math.max(c.r, Math.min(WORLD - c.r, c.x)); c.y = Math.max(c.r, Math.min(WORLD - c.r, c.y));
    return hit;
  }
  // Player car: two-axle "bicycle" model. Front and rear tyres each make sideways grip from their slip
  // angle, capped by friction. Handbrake drops rear grip so the tail steps out; counter-steer to hold a drift.
  const CAR = { A: 13, B: 13, I: 150, Cf: 4600, Cr: 6200, muF: 880, muR: 980, E: 560, roll: .3, drag: .0022, brake: 950, maxRev: 150 };
  function drivePhys(c, gas, steer, hand, dt) {
    const steps = 3, h = dt / steps; let slipMax = 0;
    for (let k = 0; k < steps; k++) {
      const fx = Math.cos(c.a), fy = Math.sin(c.a);
      let u = c.vx * fx + c.vy * fy, v = -c.vx * fy + c.vy * fx;
      const maxSt = .6 / (1 + Math.abs(u) / 200);
      c.delta += (steer * maxSt - c.delta) * Math.min(1, h * 9);
      // longitudinal
      let Fx = 0;
      if (gas > 0) Fx = u < -5 ? CAR.brake : CAR.E;
      else if (gas < 0) Fx = u > 5 ? -CAR.brake : (u > -CAR.maxRev ? -CAR.E * .55 : 0);
      Fx -= CAR.drag * u * Math.abs(u) + CAR.roll * u;
      if (hand) Fx -= Math.sign(u) * Math.min(Math.abs(u) / h, 140);
      const au = Math.abs(u);
      let muR = CAR.muR * (hand ? .3 : 1);
      // power oversteer: flooring it while the rear is already sliding keeps it loose
      if (gas > 0 && Math.abs(c.slipR) > .14) muR *= .8;
      if (au > 25) {
        const af = Math.atan2(v + c.w * CAR.A, au) - c.delta * Math.sign(u);
        const ar = Math.atan2(v - c.w * CAR.B, au);
        const Fyf = Math.max(-CAR.muF, Math.min(CAR.muF, -CAR.Cf * af));
        const Fyr = Math.max(-muR, Math.min(muR, -CAR.Cr * ar));
        const du = Fx - Fyf * Math.sin(c.delta) + v * c.w;
        const dv = Fyr + Fyf * Math.cos(c.delta) - u * c.w;
        const dw = (CAR.A * Fyf * Math.cos(c.delta) - CAR.B * Fyr) / CAR.I;
        u += du * h; v += dv * h; c.w += dw * h; c.slipR = ar;
        // drift assist (arcade): cap the spin rate and pull the slide back before it becomes a full spin-out
        const wMax = hand || Math.abs(c.slipR) > .15 ? 4.4 : 3.2; if (Math.abs(c.w) > wMax) c.w = Math.sign(c.w) * wMax;
        const beta = Math.atan2(v, au);
        if (Math.abs(beta) > .7) { const k = Math.exp(-50 * (Math.abs(beta) - .7) * h); v *= k; }
        slipMax = Math.max(slipMax, Math.abs(ar));
      } else {
        // parking speeds: steer like a cart, kill sideways motion
        u += Fx * h; v *= Math.exp(-12 * h);
        const wk = u * Math.tan(c.delta) / (CAR.A + CAR.B);
        c.w += (wk - c.w) * Math.min(1, h * 15); c.slipR = 0;
      }
      c.w *= Math.exp(-1.2 * h);
      c.a += c.w * h;
      const nfx = Math.cos(c.a), nfy = Math.sin(c.a);
      c.vx = nfx * u - nfy * v; c.vy = nfy * u + nfx * v;
      c.x += c.vx * h; c.y += c.vy * h;
      c.fwd = u; c.lat = v;
    }
    c.steer = c.delta / .6; c.v = Math.hypot(c.vx, c.vy); c.slipAng = slipMax;
    return slipMax;
  }
  function drive(c, gas, steer, drift, dt, maxV) {
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    let fwd = c.vx * fx + c.vy * fy;
    const side = -c.vx * fy + c.vy * fx;
    if (gas > 0) fwd += 520 * dt;
    else if (gas < 0) fwd -= (fwd > 0 ? 700 : 300) * dt;
    else fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 160 * dt);
    fwd = Math.max(-maxV * 0.4, Math.min(maxV, fwd));
    const grip = drift ? 1.5 : 9;
    const newSide = side * Math.exp(-grip * dt);
    const turn = steer * 2.6 * Math.min(1, Math.abs(fwd) / 140) * Math.sign(fwd || 1) * (drift ? 1.3 : 1);
    c.a += turn * dt; c.steer += (steer - c.steer) * Math.min(1, dt * 10);
    const nfx = Math.cos(c.a), nfy = Math.sin(c.a);
    c.vx = nfx * fwd - nfy * newSide; c.vy = nfy * fwd + nfx * newSide;
    c.x += c.vx * dt; c.y += c.vy * dt;
    c.v = Math.hypot(c.vx, c.vy); c.fwd = fwd;
    return Math.abs(side);
  }

  // ---------- civilian traffic: drives on the right, picks a turn at every intersection ----------
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]], LANE = 30;
  const rightOf = d => [-d[1], d[0]];
  function newTraffic() {
    const di = Math.floor(Math.random() * 4), d = DIRS[di], r = rightOf(d);
    const line = (1 + Math.floor(Math.random() * (N - 1))) * CELL, along = CELL * (.5 + Math.floor(Math.random() * N));
    const x = d[0] ? along : line + r[0] * LANE, y = d[0] ? line + r[1] * LANE : along;
    if (player && Math.hypot(x - player.x, y - player.y) < 300) return newTraffic();
    const c = newCar(x, y, Math.atan2(d[1], d[0])); c.di = di; c.spd = 150 + Math.random() * 70; c.cur = c.spd; c.plan = null; c.knock = 0;
    return c;
  }
  function realign(c) {
    // after being knocked around: pick the direction closest to the heading and snap onto that lane
    let best = 0, bd = 9; DIRS.forEach((d, i) => { const da = Math.abs(((Math.atan2(d[1], d[0]) - c.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (da < bd) { bd = da; best = i; } });
    const d = DIRS[best], r = rightOf(d);
    if (d[0]) { const line = Math.round((c.y - r[1] * LANE) / CELL) * CELL; c.y = Math.max(CELL, Math.min(WORLD - CELL, line)) + r[1] * LANE; }
    else { const line = Math.round((c.x - r[0] * LANE) / CELL) * CELL; c.x = Math.max(CELL, Math.min(WORLD - CELL, line)) + r[0] * LANE; }
    c.di = best; c.plan = null; c.cur = 0;
  }
  function stepTraffic(c, dt) {
    if (c.knock > 0) {
      c.knock -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= Math.exp(-3 * dt); c.vy *= Math.exp(-3 * dt); c.fwd = 0; c.v = Math.hypot(c.vx, c.vy); collideBlocks(c);
      if (c.knock <= 0) realign(c);
      return;
    }
    let d = DIRS[c.di];
    if (!c.plan) {
      const ax = d[0] ? c.x : c.y, pos = d[0] + d[1] > 0;
      const k = pos ? Math.floor(ax / CELL) + 1 : Math.ceil(ax / CELL) - 1;
      const cx = d[0] ? k * CELL : Math.round(c.x / CELL) * CELL, cy = d[0] ? Math.round(c.y / CELL) * CELL : k * CELL;
      const ok = di2 => { const d2 = DIRS[di2]; const nx = cx + d2[0] * CELL, ny = cy + d2[1] * CELL; return nx > 0 && nx < WORLD && ny > 0 && ny < WORLD; };
      const opts = [0, 1, 3].map(t => (c.di + t) % 4).filter(ok);
      const di2 = !opts.length ? (c.di + 2) % 4 : (opts.includes(c.di) && Math.random() < .5) ? c.di : opts[Math.floor(Math.random() * opts.length)];
      const r = rightOf(d), r2 = rightOf(DIRS[di2]);
      if (di2 === c.di) c.plan = { di: di2, px: cx + d[0] * 70 + r[0] * LANE, py: cy + d[1] * 70 + r[1] * LANE, straight: true };
      else if (di2 === (c.di + 2) % 4) c.plan = { di: di2, px: cx - r[0] * LANE * 0 + r[0] * LANE, py: cy + r[1] * LANE, uturn: true };
      else c.plan = { di: di2, px: cx + r[0] * LANE + r2[0] * LANE, py: cy + r[1] * LANE + r2[1] * LANE };
    }
    let want = c.spd;
    for (const o of [player, ...cops, ...traffic]) { if (o === c) continue; const dx = o.x - c.x, dy = o.y - c.y, ahead = dx * d[0] + dy * d[1], side = Math.abs(dx * d[1] - dy * d[0]); if (ahead > 0 && ahead < 80 && side < 22) want = Math.min(want, Math.max(0, (ahead - 40) * 4)); }
    if (c.plan && !c.plan.straight) want = Math.min(want, 120);
    c.cur += (want - c.cur) * Math.min(1, dt * 4);
    c.x += d[0] * c.cur * dt; c.y += d[1] * c.cur * dt; c.vx = d[0] * c.cur; c.vy = d[1] * c.cur; c.fwd = c.cur; c.v = c.cur;
    const P = c.plan;
    if ((P.px - c.x) * d[0] + (P.py - c.y) * d[1] <= 0) {
      if (P.uturn) { const r2 = rightOf(DIRS[P.di]); c.x = P.px - rightOf(d)[0] * LANE + r2[0] * LANE; c.y = P.py - rightOf(d)[1] * LANE + r2[1] * LANE; }
      else if (!P.straight) { c.x = P.px; c.y = P.py; }
      c.di = P.di; c.plan = null;
    }
    const ta = Math.atan2(DIRS[c.di][1], DIRS[c.di][0]); const da = ((ta - c.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; c.a += da * Math.min(1, dt * 7); c.steer = Math.max(-1, Math.min(1, da * 2));
  }
  function bump(a, b, dmgToPlayer) {
    const d = Math.hypot(a.x - b.x, a.y - b.y); if (d >= 30 || d === 0) return 0;
    const ux = (a.x - b.x) / d, uy = (a.y - b.y) / d, push = (30 - d) / 2;
    a.x += ux * push; a.y += uy * push; b.x -= ux * push; b.y -= uy * push;
    const rel = Math.max(0, (b.vx - a.vx) * ux + (b.vy - a.vy) * uy);
    return rel;
  }
  function update(dt) {
    time += dt;
    const steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const gas = keys.up ? 1 : keys.down ? -1 : 0;
    const slip = drivePhys(player, gas, steer, keys.drift, dt);
    player.slip = slip; player.braking = gas < 0 && player.fwd > 20;
    player.skidding = (slip > .16 && player.v > 80) || (keys.drift && player.v > 60);
    if (player.skidding && view) view.skid(player);
    const ph = collideBlocks(player);
    if (ph) player.w *= ph > 1 ? .4 : .9;
    if (ph > 1) { damage(ph / 40); shake = 6; if (ph > 150) for (let i = 0; i < 8; i++) sparks.push({ x: player.x + Math.cos(player.a) * 16, y: player.y + Math.sin(player.a) * 16, z: 6, vx: (Math.random() - .5) * 300, vy: (Math.random() - .5) * 300, vz: 100 + Math.random() * 200, life: .5 }); }
    const lvl = wanted(), copMax = 1 + lvl * 2, copV = 330 + lvl * 25;
    spawnT -= dt;
    if (spawnT <= 0 && cops.length < copMax) {
      const p = roadPoint(); cops.push(Object.assign(newCar(p.x, p.y, 0), { stuck: 0, rev: 0 }));
      spawnT = Math.max(1.5, 6 - lvl);
    }
    for (const c of cops) {
      const tx = player.x + player.vx * .35, ty = player.y + player.vy * .35;
      let want = Math.atan2(ty - c.y, tx - c.x), diff = ((want - c.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      let st = Math.max(-1, Math.min(1, diff * 2)), g = 1;
      if (c.rev > 0) { c.rev -= dt; g = -1; st = -st; }
      drive(c, g, st, false, dt, copV);
      collideBlocks(c);
      if (c.v < 40 && c.rev <= 0) { c.stuck += dt; if (c.stuck > .8) { c.rev = .7; c.stuck = 0; } } else c.stuck = 0;
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      if (d < 30) {
        const ux = (player.x - c.x) / (d || 1), uy = (player.y - c.y) / (d || 1);
        const rel = (c.vx - player.vx) * ux + (c.vy - player.vy) * uy;
        player.vx += ux * 160; player.vy += uy * 160; c.vx -= ux * 120; c.vy -= uy * 120;
        player.x = c.x + ux * 30; player.y = c.y + uy * 30;
        damage(4 + Math.max(0, rel) / 30); shake = 8;
        for (let i = 0; i < 10; i++) sparks.push({ x: player.x - ux * 15, y: player.y - uy * 15, z: 6, vx: (Math.random() - .5) * 300, vy: (Math.random() - .5) * 300, vz: 80 + Math.random() * 220, life: .5 });
      }
    }
    for (let i = 0; i < cops.length; i++) for (let j = i + 1; j < cops.length; j++) {
      const a = cops[i], b = cops[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 30 && d > 0) { const ux = (a.x - b.x) / d, uy = (a.y - b.y) / d, p = (30 - d) / 2; a.x += ux * p; a.y += uy * p; b.x -= ux * p; b.y -= uy * p; }
    }
    for (const c of traffic) stepTraffic(c, dt);
    for (const t of traffic) {
      const rel = bump(player, t);
      if (rel || Math.hypot(player.x - t.x, player.y - t.y) < 30.5) {
        if (rel > 60) { damage(rel / 45); shake = 6; player.vx *= .82; player.vy *= .82; t.knock = 1.2; t.vx = player.vx * .7 + (t.x - player.x) * 2; t.vy = player.vy * .7 + (t.y - player.y) * 2;
          for (let i = 0; i < 8; i++) sparks.push({ x: (player.x + t.x) / 2, y: (player.y + t.y) / 2, z: 6, vx: (Math.random() - .5) * 260, vy: (Math.random() - .5) * 260, vz: 80 + Math.random() * 200, life: .45 }); }
      }
      for (const c of cops) { const r2 = bump(t, c); if (r2 > 80) { t.knock = 1; t.vx = c.vx * .6; t.vy = c.vy * .6; } }
    }
    for (let i = 0; i < traffic.length; i++) for (let j = i + 1; j < traffic.length; j++) bump(traffic[i], traffic[j]);
    for (let i = cash.length - 1; i >= 0; i--) {
      if (Math.hypot(cash[i].x - player.x, cash[i].y - player.y) < 32) {
        money += 250 * wanted(); cash.splice(i, 1); cash.push(roadPoint());
        flash("+$" + (250 * wanted()));
        if (player.hp < 100) player.hp = Math.min(100, player.hp + 3);
        if (view) view.cashFx();
      }
    }
    const prevLvl = Math.min(5, 1 + Math.floor((time - dt) / 25));
    if (lvl > prevLvl) flash("Wanted level " + lvl);
    for (const s of sparks) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vz -= 900 * dt; if (s.z < 0) { s.z = 0; s.vz *= -.4; } }
    sparks = sparks.filter(s => s.life > 0);
    score = Math.floor(time * 10) + money;
    shake *= .85; msgT -= dt;
    if (player.hp <= 0) end();
  }
  function damage(n) { player.hp -= n; }
  function end() {
    state = "over";
    const newBest = score > best;
    if (newBest) { best = score; store.set("nsa-pursuit-best", best); bestEl.textContent = best.toLocaleString(); window.dispatchEvent(new Event("crp-score")); }
    ovTitle.textContent = "Busted";
    ovText.textContent = `You lasted ${time.toFixed(1)}s and grabbed $${money.toLocaleString()}. Score ${score.toLocaleString()}${newBest ? ", a new best." : "."}`;
    playBtn.textContent = "Run it back";
    overlay.hidden = false; playBtn.focus({ preventScroll: true });
  }

  // ---------- 3D view ----------
  let view = null;
  function buildView(THREE) {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(1); renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const SKY = new THREE.Color("#ffb27a");
    scene.fog = new THREE.Fog("#c98aa0", 60, 260);
    const camera = new THREE.PerspectiveCamera(62, W / H, 0.5, 600);
    // sky dome with sunset gradient
    {
      const c = document.createElement("canvas"); c.width = 4; c.height = 256; const g = c.getContext("2d");
      const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "#1c2450"); gr.addColorStop(.45, "#5a4a8a"); gr.addColorStop(.7, "#e88a8a"); gr.addColorStop(.85, "#ffc27a"); gr.addColorStop(1, "#ffe0a0");
      g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
      dome.position.set(WORLD * S / 2, 0, WORLD * S / 2); scene.add(dome); view_dome = dome;
    }
    scene.add(new THREE.HemisphereLight("#ffd8c0", "#3a3050", 0.9));
    const sun = new THREE.DirectionalLight("#ffc890", 1.3); sun.position.set(-1, 1.2, -.6); scene.add(sun);

    const canvasTex = (w, h, draw, repeat) => {
      const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      return t;
    };
    // ground: asphalt with lane markings and crosswalks
    const GT = 4096, gs = GT / (WORLD + CELL * 2), off = CELL;
    const groundTex = canvasTex(GT, GT, (g) => {
      g.fillStyle = "#3a3a42"; g.fillRect(0, 0, GT, GT);
      const r = mulberry(3);
      for (let i = 0; i < 60000; i++) { g.fillStyle = r() < .5 ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.08)"; g.fillRect(r() * GT, r() * GT, 2, 2); }
      const P = v => (v + off) * gs;
      // road edge lines and center dashes
      for (let k = 0; k <= N; k++) {
        const p = k * CELL;
        g.strokeStyle = "#e8c23a"; g.lineWidth = 3.2 * gs; g.setLineDash([26 * gs, 22 * gs]);
        g.beginPath(); g.moveTo(P(p), P(-CELL)); g.lineTo(P(p), P(WORLD + CELL)); g.moveTo(P(-CELL), P(p)); g.lineTo(P(WORLD + CELL), P(p)); g.stroke();
        g.setLineDash([]); g.strokeStyle = "rgba(240,240,240,.55)"; g.lineWidth = 2 * gs;
        for (const o of [-ROAD / 2 + 8, ROAD / 2 - 8]) { g.beginPath(); g.moveTo(P(p + o), P(-CELL)); g.lineTo(P(p + o), P(WORLD + CELL)); g.moveTo(P(-CELL), P(p + o)); g.lineTo(P(WORLD + CELL), P(p + o)); g.stroke(); }
      }
      // intersections: clear dashes, add crosswalks
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const ix = i * CELL, iy = j * CELL;
        g.fillStyle = "#3a3a42"; g.fillRect(P(ix - ROAD / 2 + 4), P(iy - ROAD / 2 + 4), (ROAD - 8) * gs, (ROAD - 8) * gs);
        g.fillStyle = "rgba(235,235,240,.85)";
        for (let k = -ROAD / 2 + 12; k <= ROAD / 2 - 20; k += 14) {
          g.fillRect(P(ix + k), P(iy - ROAD / 2 - 22), 8 * gs, 18 * gs); g.fillRect(P(ix + k), P(iy + ROAD / 2 + 4), 8 * gs, 18 * gs);
          g.fillRect(P(ix - ROAD / 2 - 22), P(iy + k), 18 * gs, 8 * gs); g.fillRect(P(ix + ROAD / 2 + 4), P(iy + k), 18 * gs, 8 * gs);
        }
      }
      // oil stains and patches
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${.05 + r() * .1})`; g.beginPath(); g.ellipse(r() * GT, r() * GT, 6 + r() * 20, 4 + r() * 10, r() * 3, 0, 7); g.fill(); }
    });
    const gw = (WORLD + CELL * 2) * S;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gw), new THREE.MeshLambertMaterial({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(WORLD * S / 2, 0, WORLD * S / 2); scene.add(ground);

    // materials
    const concreteTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#a8a6ae"; g.fillRect(0, 0, w, h);
      const r = mulberry(5); for (let i = 0; i < 3000; i++) { g.fillStyle = r() < .5 ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)"; g.fillRect(r() * w, r() * h, 2, 2); }
      g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 2; for (let k = 0; k <= w; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); }
    }, true);
    const grassTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#4a8a3a"; g.fillRect(0, 0, w, h);
      const r = mulberry(8); for (let i = 0; i < 4000; i++) { g.fillStyle = r() < .5 ? "rgba(120,200,80,.25)" : "rgba(20,60,10,.25)"; g.fillRect(r() * w, r() * h, 2, 3); }
    }, true);
    const facades = [["#8a5a4a", "#2a1a14"], ["#c8b8a0", "#3a3028"], ["#5a6a7a", "#1a2028"], ["#a87a5a", "#2a1a10"], ["#6a6a72", "#18181e"], ["#d0c8b8", "#40382e"]].map(([wall, frame], vi) => {
      const r = mulberry(11 + vi);
      const lit = [];
      const draw = (g, w, h, emissive) => {
        g.fillStyle = emissive ? "#000" : wall; g.fillRect(0, 0, w, h);
        if (!emissive) for (let i = 0; i < 1500; i++) { g.fillStyle = "rgba(0,0,0,.06)"; g.fillRect((i * 97) % w, (i * 53) % h, 2, 2); }
        const cw = w / 8, ch = h / 8;
        for (let y = 0; y < 8; y++) {
          if (!emissive) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, y * ch + ch - 4, w, 4); }
          for (let x = 0; x < 8; x++) {
            const idx = y * 8 + x; if (lit[idx] == null) lit[idx] = r() < .38 ? (r() < .5 ? "#ffd27a" : "#ffe9b8") : null;
            const wx = x * cw + cw * .2, wy = y * ch + ch * .18, ww = cw * .6, wh = ch * .58;
            if (emissive) { if (lit[idx]) { g.fillStyle = lit[idx]; g.fillRect(wx, wy, ww, wh); } continue; }
            g.fillStyle = frame; g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
            const gg = g.createLinearGradient(0, wy, 0, wy + wh); gg.addColorStop(0, "#3a4a6a"); gg.addColorStop(1, "#1a2234");
            g.fillStyle = lit[idx] || gg; g.fillRect(wx, wy, ww, wh);
            g.fillStyle = "rgba(255,255,255,.15)"; g.fillRect(wx, wy, ww * .3, wh);
          }
        }
      };
      const map = canvasTex(256, 256, (g, w, h) => draw(g, w, h, false), true);
      const em = canvasTex(256, 256, (g, w, h) => draw(g, w, h, true), true);
      return new THREE.MeshLambertMaterial({ map, emissiveMap: em, emissive: new THREE.Color("#ffffff"), emissiveIntensity: .85 });
    });
    const roofMat = new THREE.MeshLambertMaterial({ color: "#4a4850" });
    const grayMat = new THREE.MeshLambertMaterial({ color: "#8a8a92" });
    const sidewalkMat = new THREE.MeshLambertMaterial({ map: concreteTex });
    const grassMat = new THREE.MeshLambertMaterial({ map: grassTex });

    const scaleBoxUV = (geo, w, h, d, cw, ch) => {
      const uv = geo.attributes.uv;
      for (let f = 0; f < 6; f++) {
        let su = 1, sv = 1;
        if (f === 0 || f === 1) { su = d / cw; sv = h / ch; } else if (f === 4 || f === 5) { su = w / cw; sv = h / ch; } else { su = w / 20; sv = d / 20; }
        for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
      }
      uv.needsUpdate = true;
    };
    // static geometry is merged per material so the whole city is a handful of draw calls
    const buckets = new Map();
    const addStatic = (geo, mat, x, y, z, faces) => {
      geo.translate(x, y, z);
      const g = geo.index ? geo.toNonIndexed() : geo;
      if (!buckets.has(mat)) buckets.set(mat, []);
      const ranges = faces ? g.groups.filter((gr, k) => faces.includes(gr.materialIndex)).map(gr => [gr.start, gr.count]) : [[0, g.attributes.position.count]];
      buckets.get(mat).push({ g, ranges });
    };
    const flushStatic = () => {
      for (const [mat, list] of buckets) {
        let n = 0; for (const { ranges } of list) for (const [, c] of ranges) n += c;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
        for (const { g, ranges } of list) for (const [st, c] of ranges) {
          pos.set(g.attributes.position.array.subarray(st * 3, (st + c) * 3), o * 3);
          nor.set(g.attributes.normal.array.subarray(st * 3, (st + c) * 3), o * 3);
          if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(st * 2, (st + c) * 2), o * 2);
          o += c;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        geo.computeBoundingSphere(); scene.add(new THREE.Mesh(geo, mat));
      }
      buckets.clear();
    };
    const containerMats = ["#b8282e", "#2a5ab8", "#2a8a4a", "#d87a1a", "#7a7a82", "#c8a21a"].map(c => new THREE.MeshLambertMaterial({ color: c }));
    const craneMat = new THREE.MeshLambertMaterial({ color: "#e8a21a" });
    const tankMat = new THREE.MeshLambertMaterial({ color: "#7a5a3a" }), pondMat = new THREE.MeshLambertMaterial({ color: "#4a8ac8" });
    const building = (x, z, w, d, h, mat) => {
      const geo = new THREE.BoxGeometry(w, h, d); scaleBoxUV(geo, w, h, d, 16, 20);
      addStatic(geo.clone(), mat, x, h / 2 + .3, z, [0, 1, 4, 5]); addStatic(geo, roofMat, x, h / 2 + .3, z, [2]);
      // parapet and roof clutter
      addStatic(new THREE.BoxGeometry(w + .4, .5, d + .4), grayMat, x, h + .3 + .25, z);
      const rr = mulberry(Math.floor(x * 13 + z * 7));
      for (let k = 0; k < 2; k++) addStatic(new THREE.BoxGeometry(1.6 + rr() * 2, 1 + rr(), 1.6 + rr() * 2), grayMat, x + (rr() - .5) * (w - 4), h + .3 + .8, z + (rr() - .5) * (d - 4));
      if (rr() < .4) addStatic(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 10), tankMat, x + w / 4, h + .3 + 2.4, z - d / 4);
    };
    const treeTrunks = [], treeCrowns = [];
    const placeBlock = (b, outside) => {
      const bx = b.x * S, bz = b.y * S, bs = b.s * S, cx = bx + bs / 2, cz = bz + bs / 2;
      { const wg = new THREE.BoxGeometry(bs + 2.4, .3, bs + 2.4); scaleBoxUV(wg, bs, .3, bs, 1, 1); addStatic(wg, sidewalkMat, cx, .15, cz); }
      const r = mulberry(b.i * 31 + b.j * 17 + 5);
      if (b.park) {
        addStatic(new THREE.BoxGeometry(bs, .34, bs), grassMat, cx, .17, cz);
        for (let k = 0; k < 14; k++) treeTrunks.push([bx + 2 + r() * (bs - 4), bz + 2 + r() * (bs - 4), .8 + r() * .6]);
        { const pg = new THREE.CircleGeometry(4, 20); pg.rotateX(-Math.PI / 2); addStatic(pg, pondMat, cx + 5, .36, cz + 5); }
        return;
      }
      if (b.dock) {
        // container yard and harbour cranes along the waterfront
        const cols = ["#c8282e", "#2a5ab8", "#2a8a4a", "#d87a1a", "#8a8a92", "#e8c23a"];
        for (let gx = 0; gx < 4; gx++) for (let gz = 0; gz < 3; gz++) { const hgt = 1 + Math.floor(r() * 3); for (let k = 0; k < hgt; k++) addStatic(new THREE.BoxGeometry(6, 2.5, 2.4), containerMats[Math.floor(r() * containerMats.length)], bx + 4 + gx * 7, .3 + 1.25 + k * 2.55, bz + 6 + gz * 6); }
        const cx2 = cx + 4, crane = craneMat;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) addStatic(new THREE.BoxGeometry(.8, 22, .8), crane, cx2 + sx * 4, 11, cz + 12 + sz * 4);
        addStatic(new THREE.BoxGeometry(10, 1.6, 1.6), crane, cx2, 22, cz + 12);
        addStatic(new THREE.BoxGeometry(1.6, 1.6, 38), crane, cx2, 23.5, cz + 22);
        addStatic(new THREE.BoxGeometry(3, 2.4, 3), crane, cx2, 21, cz + 6);
        return;
      }
      const pick = () => facades[Math.floor(r() * facades.length)];
      const tall = outside ? 1.4 : 1;
      const layout = r();
      if (layout < .3) building(cx, cz, bs - 2, bs - 2, (14 + r() * 30) * tall, pick());
      else if (layout < .65) { const hw = (bs - 3) / 2; for (const sx of [-1, 1]) building(cx + sx * (hw / 2 + .5), cz, hw, bs - 2, (10 + r() * 28) * tall, pick()); }
      else { const q = (bs - 3) / 2; for (const sx of [-1, 1]) for (const sz of [-1, 1]) building(cx + sx * (q / 2 + .5), cz + sz * (q / 2 + .5), q, q, (8 + r() * 26) * tall, pick()); }
    };
    for (const b of blocks) placeBlock(b, false);
    // ring of decorative blocks outside the playable area so the edge doesn't look empty
    for (let i = -1; i <= N; i++) for (let j = -1; j <= N; j++) if (i < 0 || j < 0 || i >= N || j >= N) placeBlock({ x: i * CELL + ROAD / 2, y: j * CELL + ROAD / 2, s: CELL - ROAD, park: false, dock: j === N, i: i + 20, j: j + 20 }, true);
    // harbour water past the docks
    {
      const wt = canvasTex(256, 256, (g) => { g.fillStyle = "#2a5a88"; g.fillRect(0, 0, 256, 256); g.strokeStyle = "rgba(255,220,180,.35)"; g.lineWidth = 2; for (let y = 6; y < 256; y += 16) { g.beginPath(); for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x * .08 + y) * 3); g.stroke(); } }, true);
      wt.repeat.set(40, 20); harbour = wt;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 300), new THREE.MeshPhongMaterial({ map: wt, shininess: 120, specular: "#ffd0a0" }));
      water.rotation.x = -Math.PI / 2; water.position.set(WORLD * S / 2, -.2, (WORLD + CELL) * S + 150); scene.add(water);
      const quay = new THREE.Mesh(new THREE.BoxGeometry(900, 1.2, 1.2), new THREE.MeshLambertMaterial({ color: "#6a6a72" })); quay.position.set(WORLD * S / 2, -.2, (WORLD + CELL) * S); scene.add(quay);
    }
    flushStatic();
    // trees (instanced)
    {
      const trunkGeo = new THREE.CylinderGeometry(.25, .35, 2.4, 6), crownGeo = new THREE.IcosahedronGeometry(1.8, 0);
      const ti = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: "#5a3a1e" }), treeTrunks.length);
      const ci = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: "#3a7a32", flatShading: true }), treeTrunks.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      treeTrunks.forEach(([x, z, s], k) => {
        m.compose(new THREE.Vector3(x, 1.5 * s, z), q, sc.set(s, s, s)); ti.setMatrixAt(k, m);
        m.compose(new THREE.Vector3(x, 3.6 * s, z), q, sc.set(s * 1.2, s, s * 1.2)); ci.setMatrixAt(k, m);
      });
      scene.add(ti, ci);
    }
    // street lights on intersection corners (instanced)
    {
      const spots = [];
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) spots.push([(i * CELL + ROAD / 2 + 6) * S, (j * CELL + ROAD / 2 + 6) * S], [(i * CELL - ROAD / 2 - 6) * S, (j * CELL - ROAD / 2 - 6) * S]);
      const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .16, 6, 6), new THREE.MeshLambertMaterial({ color: "#2a2a30" }), spots.length);
      const head = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, .25, .5), new THREE.MeshBasicMaterial({ color: "#fff2c0" }), spots.length);
      const m = new THREE.Matrix4();
      spots.forEach(([x, z], k) => { m.makeTranslation(x, 3, z); pole.setMatrixAt(k, m); m.makeTranslation(x, 6, z); head.setMatrixAt(k, m); });
      scene.add(pole, head);
    }

    // ---- cars ----
    const blobTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, "rgba(0,0,0,.6)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
    const glass = new THREE.MeshPhongMaterial({ color: "#16202e", shininess: 120, specular: "#8aa0c0" });
    const tire = new THREE.MeshLambertMaterial({ color: "#151518" }), rim = new THREE.MeshPhongMaterial({ color: "#c8ccd8", shininess: 90 });
    const wheelGeo = new THREE.CylinderGeometry(.42, .42, .3, 18); wheelGeo.rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(.27, .27, .32, 10); rimGeo.rotateX(Math.PI / 2);
    const hubGeo = new THREE.BoxGeometry(.5, .07, .33);
    const glowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.3, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const glow = (color, size) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.set(size, size, 1); return sp; };
    // side profile of the body (x = length, y = up) with wheel arches cut out
    const bodyShape = (() => {
      const sh = new THREE.Shape(), R = .5;
      sh.moveTo(-1.86, .3); sh.lineTo(-1.86, .78); sh.quadraticCurveTo(-1.84, .95, -1.55, .97); sh.lineTo(-1.0, .99);
      sh.lineTo(.85, 1.0); sh.quadraticCurveTo(1.55, .92, 1.78, .82); sh.quadraticCurveTo(1.92, .72, 1.9, .5); sh.lineTo(1.88, .3);
      sh.lineTo(1.15 + R, .3); sh.absarc(1.15, .42, R, -.25, Math.PI + .25, false);
      sh.lineTo(-1.15 + R, .3); sh.absarc(-1.15, .42, R, -.25, Math.PI + .25, false);
      sh.lineTo(-1.86, .3);
      return sh;
    })();
    const cabinShape = (() => { const sh = new THREE.Shape(); sh.moveTo(-1.02, .97); sh.quadraticCurveTo(-.7, 1.4, -.45, 1.45); sh.lineTo(.2, 1.47); sh.quadraticCurveTo(.5, 1.42, .9, .99); sh.lineTo(-1.02, .97); return sh; })();
    const extrude = (shape, depth, bevel) => { const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 }); geo.translate(0, 0, -depth / 2); return geo; };
    const bodyGeo = extrude(bodyShape, 1.56, .09), cabinGeo = extrude(cabinShape, 1.36, .06);
    const roofGeo = new THREE.BoxGeometry(.72, .05, 1.36);
    const doorTex = canvasTex(512, 96, (g) => { g.fillStyle = "#1a3a9a"; g.fillRect(0, 26, 512, 44); g.fillStyle = "#fff"; g.font = "bold 40px Arial Black, Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("POLICE", 256, 50); g.fillStyle = "#e8c23a"; g.fillRect(0, 70, 512, 6); });
    function makeCar(color, police, kind) {
      const g = new THREE.Group();
      const paint = new THREE.MeshPhongMaterial({ color, shininess: 110, specular: "#888" });
      const black = new THREE.MeshPhongMaterial({ color: "#16161c", shininess: 60 });
      const body = new THREE.Mesh(bodyGeo, paint); g.add(body);
      const cabin = new THREE.Mesh(cabinGeo, glass); g.add(cabin);
      const roof = new THREE.Mesh(roofGeo, paint); roof.position.set(-.12, 1.52, 0); g.add(roof);
      // bumpers, grille, mirrors
      const fb = new THREE.Mesh(new THREE.BoxGeometry(.12, .2, 1.7), black); fb.position.set(1.93, .4, 0); g.add(fb);
      const rb = new THREE.Mesh(new THREE.BoxGeometry(.12, .2, 1.7), black); rb.position.set(-1.92, .4, 0); g.add(rb);
      const grille = new THREE.Mesh(new THREE.BoxGeometry(.06, .14, .8), black); grille.position.set(1.93, .64, 0); g.add(grille);
      for (const z of [-.86, .86]) { const mr = new THREE.Mesh(new THREE.BoxGeometry(.18, .12, .14), paint); mr.position.set(.72, 1.05, z); g.add(mr); }
      if (police) {
        for (const z of [-.87, .87]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .45), new THREE.MeshLambertMaterial({ map: doorTex, transparent: true })); d.position.set(-.1, .62, z * 1.0 + Math.sign(z) * .06); if (z < 0) d.rotation.y = Math.PI; g.add(d); }
        const hood = new THREE.Mesh(new THREE.BoxGeometry(.95, .03, 1.5), black); hood.position.set(1.32, .99, 0); hood.rotation.z = -.12; g.add(hood);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(.32, .1, 1.24), black); bar.position.set(-.12, 1.6, 0); g.add(bar);
        const red = new THREE.Mesh(new THREE.BoxGeometry(.3, .14, .52), new THREE.MeshBasicMaterial({ color: "#ff2040" })); red.position.set(-.12, 1.68, .32); g.add(red);
        const blue = new THREE.Mesh(new THREE.BoxGeometry(.3, .14, .52), new THREE.MeshBasicMaterial({ color: "#2050ff" })); blue.position.set(-.12, 1.68, -.32); g.add(blue);
        const gr = glow("#ff2040", 2.4); gr.position.set(-.12, 1.75, .32); g.add(gr); const gb = glow("#2a60ff", 2.4); gb.position.set(-.12, 1.75, -.32); g.add(gb);
        g.userData.lights = [red, blue, gr, gb];
        const pb = new THREE.Mesh(new THREE.BoxGeometry(.16, .42, 1.2), black); pb.position.set(2.02, .52, 0); g.add(pb);
      } else if (kind === "player") {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(.34, .06, 1.66), black); sp.position.set(-1.72, 1.24, 0); g.add(sp);
        for (const z of [-.6, .6]) { const st = new THREE.Mesh(new THREE.BoxGeometry(.08, .26, .08), black); st.position.set(-1.7, 1.08, z); g.add(st); }
        for (const z of [-.18, .18]) { const s1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, .02, .16), black); s1.position.set(1.32, 1.0, z); s1.rotation.z = -.11; g.add(s1); const s2 = new THREE.Mesh(new THREE.BoxGeometry(.72, .02, .16), black); s2.position.set(-.12, 1.555, z); g.add(s2); }
        const scoop = new THREE.Mesh(new THREE.BoxGeometry(.4, .1, .5), black); scoop.position.set(1.0, 1.04, 0); g.add(scoop);
      }
      // lights
      const hl = new THREE.MeshBasicMaterial({ color: "#fff6d0" }), tl = new THREE.MeshBasicMaterial({ color: "#a01010" });
      g.userData.tail = tl; g.userData.tailGlow = [];
      for (const z of [-.58, .58]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(.08, .13, .38), hl); h.position.set(1.86, .74, z); g.add(h);
        const hg = glow("#fff2c0", 1.3); hg.position.set(2.0, .74, z); g.add(hg);
        const t = new THREE.Mesh(new THREE.BoxGeometry(.08, .13, .42), tl); t.position.set(-1.9, .8, z); g.add(t);
        const tg = glow("#ff2020", .9); tg.position.set(-2.0, .8, z); g.add(tg); g.userData.tailGlow.push(tg);
      }
      g.userData.wheels = [];
      for (const [x, z] of [[1.15, .8], [1.15, -.8], [-1.15, .8], [-1.15, -.8]]) {
        const wg = new THREE.Group(); wg.position.set(x, .42, z);
        const spin = new THREE.Group(); wg.add(spin);
        spin.add(new THREE.Mesh(wheelGeo, tire)); spin.add(new THREE.Mesh(rimGeo, rim));
        const hub = new THREE.Mesh(hubGeo, black); spin.add(hub); const hub2 = hub.clone(); hub2.rotation.z = Math.PI / 2; spin.add(hub2);
        g.add(wg); g.userData.wheels.push(wg);
      }
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.6), blobMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .04; g.add(shadow);
      // body roll / pitch happens on this inner group so the shadow stays flat
      const tilt = new THREE.Group(); [...g.children].forEach(ch => { if (ch !== shadow && !g.userData.wheels.includes(ch)) tilt.add(ch); }); g.add(tilt); g.userData.tilt = tilt;
      scene.add(g);
      return g;
    }
    const playerMesh = makeCar("#ffb81a", false, "player");
    const head = new THREE.SpotLight("#fff2d0", 30, 45, .5, .6, 1.2); head.position.set(1.8, .9, 0); playerMesh.add(head); head.target.position.set(12, 0, 0); playerMesh.add(head.target);
    const copPool = [];
    const sirenLights = [0, 1, 2].map(() => { const l = new THREE.PointLight("#ff2040", 0, 22, 1.4); scene.add(l); return l; });
    const trafficPool = [];
    const TCOL = ["#c8282e", "#2a5ab8", "#e8e8e8", "#2a8a4a", "#4a4a52", "#8a2ab8", "#d87a1a", "#1a1a20"];
    // tyre smoke
    const smokeTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, "rgba(235,235,240,.9)"); gr.addColorStop(1, "rgba(235,235,240,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const smoke = []; for (let i = 0; i < 70; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 })); sp.visible = false; scene.add(sp); smoke.push({ sp, life: 0 }); }
    let smokeI = 0;
    const puff = (x, z, sz) => { const s = smoke[smokeI = (smokeI + 1) % smoke.length]; s.life = 1; s.max = 1; s.sp.visible = true; s.sp.position.set(x, .4, z); s.vx = (Math.random() - .5) * .8; s.vz = (Math.random() - .5) * .8; s.size = sz; };
    // ---- cash bags ----
    const bagTex = canvasTex(128, 128, (g) => { g.fillStyle = "#ffd23a"; g.strokeStyle = "#1e5a24"; g.lineWidth = 10; g.font = "bold 100px Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.strokeText("$", 64, 70); g.fillText("$", 64, 70); });
    const ringTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 20, 64, 64, 64); gr.addColorStop(0, "rgba(255,210,58,0)"); gr.addColorStop(.6, "rgba(255,210,58,.7)"); gr.addColorStop(1, "rgba(255,210,58,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    const bagMat = new THREE.MeshLambertMaterial({ color: "#2e8a3a" });
    const bags = [];
    function makeBag() {
      const g = new THREE.Group();
      const sack = new THREE.Mesh(new THREE.SphereGeometry(.9, 14, 10), bagMat); sack.scale.set(1, 1.1, 1); sack.position.y = 1; g.add(sack);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(.25, .4, .5, 8), bagMat); neck.position.y = 2.1; g.add(neck);
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: bagTex, depthTest: false })); sign.scale.set(1.6, 1.6, 1); sign.position.y = 3.4; g.add(sign);
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); ring.rotation.x = -Math.PI / 2; ring.position.y = .08; g.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, 30, 10, 1, true), new THREE.MeshBasicMaterial({ color: "#ffd23a", transparent: true, opacity: .14, depthWrite: false, blending: THREE.AdditiveBlending })); beam.position.y = 15; g.add(beam);
      scene.add(g); return g;
    }
    // ---- sparks + skids ----
    const SP = 200, spGeo = new THREE.BufferGeometry(); spGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SP * 3), 3));
    const spPts = new THREE.Points(spGeo, new THREE.PointsMaterial({ color: "#ffb040", size: .35, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); spPts.frustumCulled = false; scene.add(spPts);
    const SK = 400, skids = []; let skidI = 0;
    const skidGeo = new THREE.PlaneGeometry(.35, .6); skidGeo.rotateX(-Math.PI / 2);
    const skidMesh = new THREE.InstancedMesh(skidGeo, new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: .45, depthWrite: false }), SK);
    skidMesh.count = 0; skidMesh.frustumCulled = false; scene.add(skidMesh);
    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);

    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
    let camYaw = 0, wheelSpin = 0;
    const placeCar = (mesh, c, dt) => {
      mesh.position.set(c.x * S, 0, c.y * S);
      mesh.rotation.y = -c.a;
      // body roll from sideways load, pitch from braking / accelerating
      const latAcc = c.phys ? (c.w || 0) * (c.fwd || 0) : (c.steer || 0) * (c.v || 0) * 2.2;
      const roll = Math.max(-.09, Math.min(.09, latAcc / 9000));
      const acc = ((c.fwd || 0) - (c.prevFwd || 0)) / Math.max(dt, .001); c.prevFwd = c.fwd || 0;
      c.pitch = (c.pitch || 0) + (Math.max(-.05, Math.min(.05, -acc / 12000)) - (c.pitch || 0)) * Math.min(1, dt * 6);
      const tl = mesh.userData.tilt; tl.rotation.x = roll; tl.rotation.z = c.pitch;
      const ws = mesh.userData.wheels; const spin = (c.fwd || 0) * S / .42 * dt;
      for (let k = 0; k < 4; k++) { ws[k].children[0].rotation.z -= spin; if (k < 2) ws[k].rotation.y = -(c.phys ? c.delta : (c.steer || 0) * .45); }
    };
    const api = {
      sync(snap) {
        if (snap) { camYaw = player.a; camPos.set(player.x * S - Math.cos(camYaw) * 11, 5, player.y * S - Math.sin(camYaw) * 11); }
        skidMesh.count = 0; skids.length = 0; skidI = 0;
      },
      skid(c) {
        for (const side of [-.8, .8]) {
          const x = c.x * S - Math.cos(c.a) * 1.15 - Math.sin(c.a) * side, z = c.y * S - Math.sin(c.a) * 1.15 + Math.cos(c.a) * side;
          tmpQ.setFromAxisAngle(UP, -c.a); tmpM.compose(tmpV.set(x, .05, z), tmpQ, ONE);
          skidMesh.setMatrixAt(skidI, tmpM); skidI = (skidI + 1) % SK; skidMesh.count = Math.min(SK, skidMesh.count + 1);
          if (Math.random() < .55) puff(x, z, 1.2 + c.v / 300);
        }
        skidMesh.instanceMatrix.needsUpdate = true;
      },
      cashFx() { for (let i = 0; i < 20; i++) sparks.push({ x: player.x, y: player.y, z: 10, vx: (Math.random() - .5) * 200, vy: (Math.random() - .5) * 200, vz: 200 + Math.random() * 200, life: .7 }); },
      render(t, dt) {
        placeCar(playerMesh, player, dt);
        const brakeOn = player.braking || keys.drift;
        playerMesh.userData.tail.color.set(brakeOn ? "#ff2a2a" : "#901010");
        playerMesh.userData.tailGlow.forEach(gw => gw.scale.setScalar(brakeOn ? 2.2 : .9));
        while (trafficPool.length < traffic.length) trafficPool.push(makeCar(TCOL[trafficPool.length % TCOL.length], false, "civ"));
        trafficPool.forEach((m, k) => { const c = traffic[k]; m.visible = !!c; if (c) placeCar(m, c, dt); });
        for (const s2 of smoke) { if (s2.life <= 0) continue; s2.life -= dt * .9; const k = 1 - s2.life; s2.sp.position.x += s2.vx * dt; s2.sp.position.z += s2.vz * dt; s2.sp.position.y += dt * .8; s2.sp.scale.setScalar(s2.size * (1 + k * 3)); s2.sp.material.opacity = Math.max(0, s2.life) * .55; if (s2.life <= 0) s2.sp.visible = false; }
        // cops
        while (copPool.length < cops.length) copPool.push(makeCar("#f4f4f8", true));
        copPool.forEach((m, k) => { const c = cops[k]; m.visible = !!c; if (!c) return; placeCar(m, c, dt); const on = Math.floor(t * 8 + k) % 2 === 0; const L2 = m.userData.lights; L2[0].material.color.set(on ? "#ff2040" : "#400810"); L2[1].material.color.set(on ? "#102040" : "#3070ff"); L2[2].visible = on; L2[3].visible = !on; });
        // nearest cops get real flashing lights
        const near = cops.map(c => [Math.hypot(c.x - player.x, c.y - player.y), c]).sort((a, b) => a[0] - b[0]);
        sirenLights.forEach((l, k) => { const c = near[k] && near[k][1]; if (!c) { l.intensity = 0; return; } const on = Math.floor(t * 8 + k) % 2 === 0; l.color.set(on ? "#ff2040" : "#3060ff"); l.intensity = 40; l.position.set(c.x * S, 3, c.y * S); });
        // cash
        while (bags.length < cash.length) bags.push(makeBag());
        bags.forEach((b, k) => { const c = cash[k]; b.visible = !!c; if (!c) return; b.position.set(c.x * S, Math.sin(t * 3 + k) * .25, c.y * S); b.children[0].rotation.y = t * 2; });
        // sparks
        const pos = spGeo.attributes.position.array; let n = 0;
        for (const s of sparks) { if (n >= SP) break; pos[n * 3] = s.x * S; pos[n * 3 + 1] = s.z * S + .3; pos[n * 3 + 2] = s.y * S; n++; }
        spGeo.setDrawRange(0, n); spGeo.attributes.position.needsUpdate = true;
        // chase camera
        const moveYaw = player.v > 60 && player.fwd > 0 ? Math.atan2(player.vy, player.vx) : player.a;
        let d = ((moveYaw * .35 + player.a * .65) - camYaw + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        if (state === "menu") { camYaw += dt * .25; d = 0; }
        camYaw += d * Math.min(1, dt * 4);
        const dist = state === "menu" ? 16 : 10 + player.v / 120, ht = state === "menu" ? 7 : 4.2 + player.v / 300;
        // keep the camera out of buildings: pull it in if the line to the car crosses a block
        let dd = dist;
        for (let k = 1; k <= 12; k++) {
          const f = k / 12 * dist, px = player.x - Math.cos(camYaw) * f / S, py = player.y - Math.sin(camYaw) * f / S;
          if (blocks.some(b => !b.park && px > b.x - 8 && px < b.x + b.s + 8 && py > b.y - 8 && py < b.y + b.s + 8)) { dd = Math.max(4, (k - 1) / 12 * dist); break; }
        }
        const want = tmpV.set(player.x * S - Math.cos(camYaw) * dd, ht + (dist - dd) * .35, player.y * S - Math.sin(camYaw) * dd);
        camPos.lerp(want, Math.min(1, dt * 6));
        camera.position.copy(camPos);
        if (shake > .3) camera.position.add(new THREE.Vector3((Math.random() - .5) * shake * .05, (Math.random() - .5) * shake * .05, 0));
        camLook.set(player.x * S + Math.cos(camYaw) * 6, 1.2, player.y * S + Math.sin(camYaw) * 6);
        camera.lookAt(camLook);
        camera.fov = 62 + Math.min(14, player.v / 30); camera.updateProjectionMatrix();
        view_dome.position.set(camera.position.x, 0, camera.position.z);
        if (harbour) harbour.offset.set((t * .01) % 1, (t * .02) % 1);
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, 0, 0, W, H);
      },
      renderer,
    };
    return api;
  }
  let view_dome = null, harbour = null;

  // ---------- HUD (2D on top of the 3D frame) ----------
  function hud(t) {
    let near = 1e9; for (const c of cops) near = Math.min(near, Math.hypot(c.x - player.x, c.y - player.y));
    if (near < 400 && state !== "menu") {
      const a = (1 - near / 400) * .35, on = Math.floor(t * 6) % 2;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .85);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, on ? `rgba(255,59,92,${a})` : `rgba(59,140,255,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillStyle = "rgba(10,9,16,.72)"; roundRect(ctx, 12, 12, 260, 82, 8); ctx.fill();
    ctx.strokeStyle = "rgba(255,204,51,.5)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = "22px Bungee, Impact, sans-serif"; ctx.fillStyle = "#ffcc33";
    ctx.fillText(score.toLocaleString(), 24, 20);
    ctx.font = "600 14px Chakra Petch, sans-serif"; ctx.fillStyle = "#ece8ff";
    ctx.fillText(`$${money.toLocaleString()}   ${time.toFixed(1)}s`, 140, 26);
    ctx.fillStyle = "#2c2847"; ctx.fillRect(24, 54, 150, 10);
    ctx.fillStyle = player.hp > 35 ? "#4fd16b" : "#ff3b5c"; ctx.fillRect(24, 54, Math.max(0, player.hp) * 1.5, 10);
    ctx.fillStyle = "#8f88b5"; ctx.font = "600 11px Chakra Petch, sans-serif"; ctx.fillText("CAR", 182, 52);
    const lvl = wanted();
    for (let i = 0; i < 5; i++) star(32 + i * 24, 80, 8, i < lvl ? "#ffcc33" : "#3a3555");
    // speedometer
    const kmh = Math.round(player.v * .45);
    ctx.fillStyle = "rgba(10,9,16,.72)"; roundRect(ctx, 12, H - 74, 150, 60, 8); ctx.fill();
    ctx.font = "34px Bungee, Impact, sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = "right"; ctx.fillText(String(kmh), 110, H - 66);
    ctx.font = "600 13px Chakra Petch, sans-serif"; ctx.fillStyle = "#ffcc33"; ctx.textAlign = "left"; ctx.fillText("KM/H", 116, H - 48);
    // radar map, top right: turns with the car like a real driving game
    const RR = 92, cx0 = W - RR - 20, cy0 = RR + 20, zoom = RR / 1150;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx0, cy0, RR + 6, 0, 7); ctx.fillStyle = "rgba(10,9,16,.85)"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#ffcc33"; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx0, cy0, RR, 0, 7); ctx.clip();
    ctx.fillStyle = "#5c5a66"; ctx.fillRect(cx0 - RR, cy0 - RR, RR * 2, RR * 2);
    ctx.translate(cx0, cy0); ctx.rotate(-player.a - Math.PI / 2); ctx.scale(zoom, zoom); ctx.translate(-player.x, -player.y);
    for (const b of blocks) { ctx.fillStyle = b.park ? "#3f7a3a" : "#2a2832"; ctx.fillRect(b.x, b.y, b.s, b.s); }
    ctx.strokeStyle = "rgba(255,204,51,.35)"; ctx.lineWidth = 6; ctx.setLineDash([40, 40]); ctx.beginPath();
    for (let k = 0; k <= N; k++) { ctx.moveTo(k * CELL, 0); ctx.lineTo(k * CELL, WORLD); ctx.moveTo(0, k * CELL); ctx.lineTo(WORLD, k * CELL); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = "#ffcc33"; ctx.lineWidth = 14; ctx.strokeRect(0, 0, WORLD, WORLD);
    for (const t of traffic) { ctx.fillStyle = "#d8d8e0"; ctx.beginPath(); ctx.arc(t.x, t.y, 16, 0, 7); ctx.fill(); }
    for (const c of cash) { ctx.fillStyle = "#3fbf56"; ctx.beginPath(); ctx.arc(c.x, c.y, 34, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 8; ctx.stroke(); }
    const on = Math.floor(t * 6) % 2;
    for (const c of cops) { ctx.fillStyle = on ? "#ff3b5c" : "#3b8cff"; ctx.beginPath(); ctx.arc(c.x, c.y, 30, 0, 7); ctx.fill(); }
    ctx.restore();
    // arrow pointing to the nearest money bag when it's off the radar
    let nc = null, nd = 1e9; for (const c of cash) { const d = Math.hypot(c.x - player.x, c.y - player.y); if (d < nd) { nd = d; nc = c; } }
    if (nc && nd > 1100) {
      const ang = Math.atan2(nc.y - player.y, nc.x - player.x) - player.a - Math.PI / 2;
      ctx.save(); ctx.translate(cx0 + Math.cos(ang) * (RR - 10), cy0 + Math.sin(ang) * (RR - 10)); ctx.rotate(ang);
      ctx.fillStyle = "#3fbf56"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    // player arrow in the middle, always pointing up
    ctx.fillStyle = "#ffcc33"; ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx0, cy0 - 9); ctx.lineTo(cx0 + 7, cy0 + 8); ctx.lineTo(cx0, cy0 + 4); ctx.lineTo(cx0 - 7, cy0 + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    // north marker on the rim
    const na = -player.a - Math.PI / 2 - Math.PI / 2;
    ctx.font = "bold 13px Chakra Petch, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const nx2 = cx0 + Math.cos(na) * (RR + 1), ny2 = cy0 + Math.sin(na) * (RR + 1);
    ctx.fillStyle = "#c8282e"; ctx.beginPath(); ctx.arc(nx2, ny2, 9, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillText("N", nx2, ny2 + 1);
    ctx.textBaseline = "top"; ctx.font = "600 11px Chakra Petch, sans-serif"; ctx.fillStyle = "#ffcc33"; ctx.fillText("DOCKSIDE", cx0, cy0 + RR + 10);
    ctx.fillStyle = "rgba(236,232,255,.6)"; ctx.fillText(sound.muted ? "M: sound off" : "M: sound on", cx0, cy0 + RR + 24);
    if (msgT > 0) {
      ctx.globalAlpha = Math.min(1, msgT); ctx.textAlign = "center"; ctx.font = "30px Bungee, Impact, sans-serif";
      ctx.fillStyle = "#ff3b5c"; ctx.fillText(msg, W / 2 + 3, H - 96 + 3);
      ctx.fillStyle = "#ffcc33"; ctx.fillText(msg, W / 2, H - 96);
      ctx.globalAlpha = 1;
    }
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function star(x, y, r, col) {
    ctx.fillStyle = col; ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * .45 : r, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // ---------- sound: engine with gears, tyre squeal, siren ----------
  const sound = { muted: store.get("crp-mute", false), ac: null };
  function soundStart() {
    if (sound.ac || sound.muted) return;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)(); sound.ac = ac;
      const master = ac.createGain(); master.gain.value = .5; master.connect(ac.destination); sound.master = master;
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; lp.connect(master);
      const eg = ac.createGain(); eg.gain.value = 0; eg.connect(lp);
      const o1 = ac.createOscillator(); o1.type = "sawtooth"; o1.connect(eg); o1.start();
      const o2 = ac.createOscillator(); o2.type = "square"; const g2 = ac.createGain(); g2.gain.value = .35; o2.connect(g2).connect(eg); o2.start();
      const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), dd = buf.getChannelData(0); for (let i = 0; i < dd.length; i++) dd[i] = Math.random() * 2 - 1;
      const nz = ac.createBufferSource(); nz.buffer = buf; nz.loop = true; const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 3;
      const sg = ac.createGain(); sg.gain.value = 0; nz.connect(bp).connect(sg).connect(master); nz.start();
      const sir = ac.createOscillator(); sir.type = "triangle"; const sirG = ac.createGain(); sirG.gain.value = 0; sir.connect(sirG).connect(master); sir.start();
      Object.assign(sound, { o1, o2, eg, lp, sg, sir, sirG });
    } catch {}
  }
  function soundUpdate(t) {
    if (!sound.ac) return;
    const on = state === "run" && !sound.muted, n = sound.ac.currentTime;
    const v = Math.abs(player.fwd || 0), gears = [0, 110, 200, 290, 370, 999];
    let gi = 1; while (v > gears[gi]) gi++;
    const lo = gears[gi - 1], hi = Math.min(gears[gi], 470), rpm = .25 + .75 * Math.min(1, (v - lo) / Math.max(1, hi - lo));
    const f = 38 + rpm * 70 + gi * 6 + (keys.up ? 8 : 0);
    sound.o1.frequency.setTargetAtTime(f, n, .05); sound.o2.frequency.setTargetAtTime(f * .5, n, .05);
    sound.lp.frequency.setTargetAtTime(500 + rpm * 1400 + (keys.up ? 600 : 0), n, .08);
    sound.eg.gain.setTargetAtTime(on ? .09 + (keys.up ? .05 : 0) : 0, n, .1);
    sound.sg.gain.setTargetAtTime(on && player.skidding ? .12 : 0, n, .05);
    let near = 1e9; for (const c of cops) near = Math.min(near, Math.hypot(c.x - player.x, c.y - player.y));
    sound.sir.frequency.setTargetAtTime(Math.floor(t * 1.6) % 2 ? 960 : 720, n, .02);
    sound.sirG.gain.setTargetAtTime(on ? Math.max(0, 1 - near / 700) * .05 : 0, n, .1);
  }
  addEventListener("keydown", e => { if (e.code === "KeyM") { sound.muted = !sound.muted; store.set("crp-mute", sound.muted); if (!sound.muted) soundStart(); } });

  function loop(ts) {
    const t = ts / 1000, dt = Math.min(.033, t - (last || t)); last = t;
    if (state === "run") update(dt);
    soundUpdate(t);
    if (view) { view.render(t, dt); if (state !== "menu") hud(t); }
    else { ctx.fillStyle = "#14131c"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#ffcc33"; ctx.font = "24px Bungee, Impact, sans-serif"; ctx.textAlign = "center"; ctx.fillText("LOADING CITY...", W / 2, H / 2); }
    requestAnimationFrame(loop);
  }
  function start() { soundStart(); if (sound.ac && sound.ac.state === "suspended") sound.ac.resume(); reset(); state = "run"; overlay.hidden = true; pauseBtn.textContent = "Pause"; cv.focus(); }
  function pause() {
    if (state === "run") {
      state = "paused"; ovTitle.textContent = "Paused"; ovText.textContent = "Take a breath. The cops will wait.";
      playBtn.textContent = "Resume"; overlay.hidden = false; pauseBtn.textContent = "Resume";
    } else if (state === "paused") { state = "run"; overlay.hidden = true; pauseBtn.textContent = "Pause"; }
  }
  playBtn.addEventListener("click", () => { state === "paused" ? pause() : start(); });
  pauseBtn.addEventListener("click", () => { if (state === "run" || state === "paused") pause(); });
  const map = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", Space: "drift" };
  addEventListener("keydown", e => {
    if (map[e.code]) { keys[map[e.code]] = true; if (state === "run") e.preventDefault(); }
    if (e.code === "KeyP" || e.code === "Escape") pause();
    if (e.code === "Enter" && state !== "run" && document.activeElement !== playBtn) playBtn.click();
  });
  addEventListener("keyup", e => { if (map[e.code]) keys[map[e.code]] = false; });
  addEventListener("blur", () => { for (const k in keys) keys[k] = false; if (state === "run") pause(); });
  document.querySelectorAll("#pad button").forEach(b => {
    const k = b.dataset.k;
    const on = e => { e.preventDefault(); keys[k] = true; b.classList.add("on"); };
    const off = e => { e.preventDefault(); keys[k] = false; b.classList.remove("on"); };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off);
    b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
  });

  reset(); state = "menu";
  import(THREE_URL).then(THREE => { view = buildView(THREE); view.sync(true); }).catch(err => { console.error(err); ovText.textContent = "Your browser couldn't start 3D graphics (WebGL). Try another browser."; });
  requestAnimationFrame(loop);
  window.CodeRed = { debug: { get traffic() { return traffic; }, drivePhys, newCar, CAR, get view() { return view; }, get cash() { return cash; }, get info() { return view && view.renderer.info.render; }, get player() { return player; }, get cops() { return cops; }, get state() { return state; }, keys, start, step(n) { for (let i = 0; i < n; i++) update(1 / 30); if (view) view.sync(true); } } };
})();
