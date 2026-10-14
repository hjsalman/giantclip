/* Code Red Pursuit - top-down getaway driving. */
(() => {
  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  let best = store.get("nsa-pursuit-best", 0);
  const bestEl = document.getElementById("best");
  bestEl.textContent = best.toLocaleString();

  // ---------- shared car drawing ----------
  function drawCar(c, x, y, a, color, police, t, s = 1) {
    c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
    c.fillStyle = "rgba(0,0,0,.4)"; roundRect(c, -15, -8, 34, 20, 6); c.fill();
    // wheels
    c.fillStyle = "#111"; for (const [wx, wy] of [[-10, -10], [8, -10], [-10, 7], [8, 7]]) c.fillRect(wx, wy, 7, 3);
    const body = police ? "#f2f2f6" : color;
    const g = c.createLinearGradient(0, -9, 0, 9); g.addColorStop(0, shadeHex(body, 40)); g.addColorStop(.5, body); g.addColorStop(1, shadeHex(body, -50));
    c.fillStyle = g; roundRect(c, -16, -9, 32, 18, 5); c.fill();
    c.strokeStyle = "rgba(0,0,0,.6)"; c.lineWidth = 1; c.stroke();
    if (police) { c.fillStyle = "#16161e"; roundRect(c, -16, -9, 8, 18, 4); c.fill(); roundRect(c, 9, -9, 7, 18, 3); c.fill(); }
    // windshield, roof, rear window
    c.fillStyle = "#1b2a3e"; c.beginPath(); c.moveTo(4, -7); c.lineTo(9, -6); c.lineTo(9, 6); c.lineTo(4, 7); c.closePath(); c.fill();
    c.fillStyle = "#24364e"; c.fillRect(-11, -6, 4, 12);
    const rg = c.createLinearGradient(0, -6, 0, 6); rg.addColorStop(0, shadeHex(body, 55)); rg.addColorStop(1, shadeHex(body, -25));
    c.fillStyle = police ? "#fafafa" : rg; roundRect(c, -7, -6, 11, 12, 2); c.fill();
    c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(5, -5, 2, 4);
    if (police) {
      const on = Math.floor(t * 8) % 2 === 0;
      c.fillStyle = on ? "#ff3b5c" : "#5a1020"; c.fillRect(-3, -6, 4, 6);
      c.fillStyle = on ? "#1a2a5a" : "#3b8cff"; c.fillRect(-3, 0, 4, 6);
      const gl = c.createRadialGradient(-1, 0, 2, -1, 0, 40); gl.addColorStop(0, on ? "rgba(255,60,90,.35)" : "rgba(60,140,255,.35)"); gl.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = gl; c.fillRect(-41, -40, 80, 80);
    } else {
      c.fillStyle = "#fff6c8"; c.fillRect(14, -7, 2, 4); c.fillRect(14, 3, 2, 4);
      const hl = c.createLinearGradient(16, 0, 90, 0); hl.addColorStop(0, "rgba(255,246,200,.35)"); hl.addColorStop(1, "rgba(255,246,200,0)");
      c.fillStyle = hl; c.beginPath(); c.moveTo(16, -7); c.lineTo(90, -26); c.lineTo(90, 26); c.lineTo(16, 7); c.fill();
    }
    c.fillStyle = "#c8202a"; c.fillRect(-16, -7, 1.5, 3); c.fillRect(-16, 4, 1.5, 3);
    c.restore();
  }
  function shadeHex(hex, amt) {
    const n = parseInt(hex.slice(1), 16), cl = v => Math.max(0, Math.min(255, v));
    return `rgb(${cl((n >> 16) + amt)},${cl((n >> 8 & 255) + amt)},${cl((n & 255) + amt)})`;
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
  }
  // ---------- game: Code Red Pursuit ----------
  const cv = document.getElementById("game"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  const CELL = 420, ROAD = 130, N = 8, WORLD = CELL * N;
  const overlay = document.getElementById("overlay"), ovTitle = document.getElementById("ovTitle"),
        ovText = document.getElementById("ovText"), playBtn = document.getElementById("playBtn"),
        pauseBtn = document.getElementById("pauseBtn");

  // buildings: one block per cell, a few cells are parks (no collision)
  const blocks = [];
  const rng = mulberry(7);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const park = rng() < 0.12;
    const x = i * CELL + ROAD / 2, y = j * CELL + ROAD / 2, s = CELL - ROAD;
    const shade = ["#2a2838", "#33303f", "#2c3340", "#3a2f35", "#2f3a33"][Math.floor(rng() * 5)];
    const roofs = [];
    if (!park) {
      const k = 1 + Math.floor(rng() * 3);
      for (let r = 0; r < k; r++) roofs.push([x + 20 + rng() * (s - 120), y + 20 + rng() * (s - 120), 40 + rng() * 50, 30 + rng() * 40]);
    }
    blocks.push({ x, y, s, park, shade, roofs });
  }
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  const keys = { up: false, down: false, left: false, right: false, drift: false };
  let state = "menu", player, cops, cash, sparks, time, score, money, spawnT, last = 0, shake = 0, msg = "", msgT = 0;

  function roadPoint() {
    // random point on a road, away from the player
    for (let tries = 0; tries < 50; tries++) {
      const along = 60 + Math.random() * (WORLD - 120);
      const line = Math.floor(Math.random() * (N - 1) + 1) * CELL;
      const p = Math.random() < .5 ? { x: line, y: along } : { x: along, y: line };
      if (!player || Math.hypot(p.x - player.x, p.y - player.y) > 500) return p;
    }
    return { x: CELL, y: CELL };
  }

  function newCar(x, y, a) { return { x, y, a, v: 0, vx: 0, vy: 0, r: 15 }; }

  function reset() {
    player = newCar(CELL * 4, CELL * 4, 0); player.hp = 100;
    cops = []; cash = []; sparks = [];
    time = 0; money = 0; score = 0; spawnT = 2.5;
    for (let i = 0; i < 6; i++) cash.push(roadPoint());
    for (let i = 0; i < 2; i++) { const p = roadPoint(); cops.push(Object.assign(newCar(p.x, p.y, 0), { stuck: 0, rev: 0 })); }
    flash("They're on to you");
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

  // arcade car physics: velocity vector with grip toward heading
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
    const turn = steer * 3.1 * Math.min(1, Math.abs(fwd) / 140) * Math.sign(fwd || 1) * (drift ? 1.25 : 1);
    c.a += turn * dt;
    const nfx = Math.cos(c.a), nfy = Math.sin(c.a);
    c.vx = nfx * fwd - nfy * newSide; c.vy = nfy * fwd + nfx * newSide;
    c.x += c.vx * dt; c.y += c.vy * dt;
    c.v = Math.hypot(c.vx, c.vy);
    return Math.abs(side);
  }

  function update(dt) {
    time += dt;
    const steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const gas = keys.up ? 1 : keys.down ? -1 : 0;
    const slip = drive(player, gas, steer, keys.drift, dt, 430);
    if (slip > 90 && Math.random() < .6) sparks.push({ x: player.x - Math.cos(player.a) * 14, y: player.y - Math.sin(player.a) * 14, life: .6, skid: true, a: player.a });
    const ph = collideBlocks(player);
    if (ph > 1) { damage(ph / 40); shake = 6; }

    // cops
    const lvl = wanted(), copMax = 1 + lvl * 2, copV = 330 + lvl * 25;
    spawnT -= dt;
    if (spawnT <= 0 && cops.length < copMax) {
      const p = roadPoint(); cops.push(Object.assign(newCar(p.x, p.y, 0), { stuck: 0, rev: 0 }));
      spawnT = Math.max(1.5, 6 - lvl);
    }
    for (const c of cops) {
      // lead the target a little
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
        for (let i = 0; i < 6; i++) sparks.push({ x: player.x - ux * 15, y: player.y - uy * 15, vx: (Math.random() - .5) * 300, vy: (Math.random() - .5) * 300, life: .4 });
      }
    }
    // cops push each other apart
    for (let i = 0; i < cops.length; i++) for (let j = i + 1; j < cops.length; j++) {
      const a = cops[i], b = cops[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 30 && d > 0) { const ux = (a.x - b.x) / d, uy = (a.y - b.y) / d, p = (30 - d) / 2; a.x += ux * p; a.y += uy * p; b.x -= ux * p; b.y -= uy * p; }
    }
    // cash
    for (let i = cash.length - 1; i >= 0; i--) {
      if (Math.hypot(cash[i].x - player.x, cash[i].y - player.y) < 30) {
        money += 250 * wanted(); cash.splice(i, 1); cash.push(roadPoint());
        flash("+$" + (250 * wanted()));
        if (player.hp < 100) player.hp = Math.min(100, player.hp + 3);
      }
    }
    const prevLvl = Math.min(5, 1 + Math.floor((time - dt) / 25));
    if (lvl > prevLvl) flash("Wanted level " + lvl);
    for (const s of sparks) { s.life -= dt; if (s.vx) { s.x += s.vx * dt; s.y += s.vy * dt; } }
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

  function renderBlock(b) {
    const pad = 20, S = b.s + pad * 2, cnv = document.createElement("canvas"); cnv.width = S + 30; cnv.height = S + 30;
    const c = cnv.getContext("2d"), r = mulberry(Math.floor(b.x * 7 + b.y * 13));
    // sidewalk with curb
    c.fillStyle = "#7a7884"; c.fillRect(pad - 12, pad - 12, b.s + 24, b.s + 24);
    c.strokeStyle = "#a8a6b2"; c.lineWidth = 3; c.strokeRect(pad - 11, pad - 11, b.s + 22, b.s + 22);
    c.strokeStyle = "rgba(0,0,0,.18)"; c.lineWidth = 1; for (let k = 0; k < b.s + 24; k += 22) { c.beginPath(); c.moveTo(pad - 12 + k, pad - 12); c.lineTo(pad - 12 + k, pad - 2); c.moveTo(pad - 12 + k, pad + b.s + 2); c.lineTo(pad - 12 + k, pad + b.s + 12); c.moveTo(pad - 12, pad - 12 + k); c.lineTo(pad - 2, pad - 12 + k); c.moveTo(pad + b.s + 2, pad - 12 + k); c.lineTo(pad + b.s + 12, pad - 12 + k); c.stroke(); }
    if (b.park) {
      const g = c.createLinearGradient(0, pad, 0, pad + b.s); g.addColorStop(0, "#3e7a3a"); g.addColorStop(1, "#2e5e2c"); c.fillStyle = g; c.fillRect(pad, pad, b.s, b.s);
      c.strokeStyle = "#c8b48a"; c.lineWidth = 12; c.beginPath(); c.moveTo(pad, pad + b.s / 2); c.quadraticCurveTo(pad + b.s / 2, pad + b.s * .3, pad + b.s, pad + b.s / 2); c.moveTo(pad + b.s / 2, pad); c.lineTo(pad + b.s / 2, pad + b.s); c.stroke();
      c.fillStyle = "#5a9ad0"; c.beginPath(); c.ellipse(pad + b.s * .72, pad + b.s * .72, 40, 26, 0, 0, 7); c.fill(); c.strokeStyle = "#c8b48a"; c.lineWidth = 3; c.stroke();
      for (let i = 0; i < 16; i++) {
        const tx = pad + 20 + r() * (b.s - 40), ty = pad + 20 + r() * (b.s - 40), tr = 14 + r() * 12;
        c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.arc(tx + 6, ty + 6, tr, 0, 7); c.fill();
        const tg = c.createRadialGradient(tx - tr * .3, ty - tr * .3, 2, tx, ty, tr); tg.addColorStop(0, "#7ac05a"); tg.addColorStop(1, "#2a5a24");
        c.fillStyle = tg; c.beginPath(); c.arc(tx, ty, tr, 0, 7); c.fill();
      }
      return cnv;
    }
    // building drop shadow
    c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(pad + 14, pad + 14, b.s, b.s);
    // roof base with gravel texture
    const base = b.shade;
    c.fillStyle = base; c.fillRect(pad, pad, b.s, b.s);
    for (let i = 0; i < 900; i++) { c.fillStyle = r() < .5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.08)"; c.fillRect(pad + r() * b.s, pad + r() * b.s, 2, 2); }
    // parapet
    c.strokeStyle = "rgba(255,255,255,.18)"; c.lineWidth = 6; c.strokeRect(pad + 3, pad + 3, b.s - 6, b.s - 6);
    c.strokeStyle = "rgba(0,0,0,.35)"; c.lineWidth = 2; c.strokeRect(pad + 7, pad + 7, b.s - 14, b.s - 14);
    // roof structures
    for (const [rx, ry, rw, rh] of b.roofs) {
      const x = rx - b.x + pad, y = ry - b.y + pad;
      c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(x + 6, y + 6, rw, rh);
      const g = c.createLinearGradient(x, y, x + rw, y + rh); g.addColorStop(0, "#8a8898"); g.addColorStop(1, "#5a5868"); c.fillStyle = g; c.fillRect(x, y, rw, rh);
      c.strokeStyle = "#2a2834"; c.lineWidth = 1.5; c.strokeRect(x, y, rw, rh);
      c.strokeStyle = "rgba(255,255,255,.15)"; for (let k = 4; k < rw - 2; k += 5) { c.beginPath(); c.moveTo(x + k, y + 3); c.lineTo(x + k, y + rh - 3); c.stroke(); }
    }
    // AC units and a water tank
    for (let i = 0; i < 3; i++) {
      const ax = pad + 20 + r() * (b.s - 60), ay = pad + 20 + r() * (b.s - 60);
      c.fillStyle = "rgba(0,0,0,.3)"; c.fillRect(ax + 4, ay + 4, 22, 18);
      c.fillStyle = "#c8cad4"; c.fillRect(ax, ay, 22, 18); c.strokeStyle = "#5a5c68"; c.strokeRect(ax, ay, 22, 18);
      c.beginPath(); c.arc(ax + 11, ay + 9, 6, 0, 7); c.stroke(); c.beginPath(); c.moveTo(ax + 5, ay + 9); c.lineTo(ax + 17, ay + 9); c.moveTo(ax + 11, ay + 3); c.lineTo(ax + 11, ay + 15); c.stroke();
    }
    if (r() < .6) { const tx = pad + b.s - 50, ty = pad + 40; c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.arc(tx + 6, ty + 6, 18, 0, 7); c.fill(); const tg = c.createRadialGradient(tx - 6, ty - 6, 2, tx, ty, 18); tg.addColorStop(0, "#b08a5a"); tg.addColorStop(1, "#5a3a1e"); c.fillStyle = tg; c.beginPath(); c.arc(tx, ty, 18, 0, 7); c.fill(); c.strokeStyle = "#2a1a0a"; c.stroke(); }
    // skylight windows
    c.fillStyle = "rgba(140,200,255,.35)"; for (let k = 0; k < 4; k++) { const sx = pad + 30 + k * 30 + r() * 8, sy = pad + b.s - 46; c.fillRect(sx, sy, 18, 12); }
    return cnv;
  }
  function draw(t) {
    const cx = Math.max(0, Math.min(WORLD - W, player.x - W / 2)) + (Math.random() - .5) * shake;
    const cy = Math.max(0, Math.min(WORLD - H, player.y - H / 2)) + (Math.random() - .5) * shake;
    ctx.fillStyle = "#1d1c25"; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(-cx, -cy);
    // lane dashes
    ctx.strokeStyle = "rgba(255,204,51,.55)"; ctx.lineWidth = 3; ctx.setLineDash([22, 22]);
    ctx.beginPath();
    for (let k = 0; k <= N; k++) {
      const p = k * CELL;
      if (p > cx - 50 && p < cx + W + 50) { ctx.moveTo(p, cy - 50); ctx.lineTo(p, cy + H + 50); }
      if (p > cy - 50 && p < cy + H + 50) { ctx.moveTo(cx - 50, p); ctx.lineTo(cx + W + 50, p); }
    }
    ctx.stroke(); ctx.setLineDash([]);
    // skids
    for (const s of sparks) if (s.skid) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.fillStyle = `rgba(0,0,0,${s.life * .6})`; ctx.fillRect(-3, -9, 6, 4); ctx.fillRect(-3, 5, 6, 4); ctx.restore(); }
    // crosswalks at intersections
    ctx.fillStyle = "rgba(230,230,240,.5)";
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      const ix = i * CELL, iy = j * CELL;
      if (ix < cx - CELL || ix > cx + W + CELL || iy < cy - CELL || iy > cy + H + CELL) continue;
      for (let k = -50; k <= 40; k += 14) { ctx.fillRect(ix + k, iy - ROAD / 2 + 2, 8, 14); ctx.fillRect(ix + k, iy + ROAD / 2 - 16, 8, 14); ctx.fillRect(ix - ROAD / 2 + 2, iy + k, 14, 8); ctx.fillRect(ix + ROAD / 2 - 16, iy + k, 14, 8); }
    }
    // blocks (pre-rendered)
    for (const b of blocks) {
      if (b.x - 30 > cx + W || b.x + b.s + 30 < cx || b.y - 30 > cy + H || b.y + b.s + 30 < cy) continue;
      if (!b.img) b.img = renderBlock(b);
      ctx.drawImage(b.img, b.x - 20, b.y - 20);
    }
    // cash bags
    for (const c of cash) {
      const bob = Math.sin(t * 4 + c.x) * 3;
      ctx.fillStyle = "rgba(255,204,51,.18)"; ctx.beginPath(); ctx.arc(c.x, c.y, 22, 0, 7); ctx.fill();
      ctx.fillStyle = "#3f8f46"; ctx.beginPath(); ctx.arc(c.x, c.y + bob, 11, 0, 7); ctx.fill();
      ctx.fillStyle = "#ffcc33"; ctx.font = "bold 13px Chakra Petch, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("$", c.x, c.y + bob + 1);
    }
    for (const c of cops) drawCar(ctx, c.x, c.y, c.a, "", true, t + c.x);
    drawCar(ctx, player.x, player.y, player.a, "#ffcc33", false, t);
    for (const s of sparks) if (!s.skid) { ctx.fillStyle = `rgba(255,${150 + Math.random() * 100},60,${s.life * 2})`; ctx.fillRect(s.x, s.y, 3, 3); }
    ctx.restore();

    // siren glow at screen edges based on nearest cop
    let near = 1e9; for (const c of cops) near = Math.min(near, Math.hypot(c.x - player.x, c.y - player.y));
    if (near < 400) {
      const a = (1 - near / 400) * .35, on = Math.floor(t * 6) % 2;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .85);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, on ? `rgba(255,59,92,${a})` : `rgba(59,140,255,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    hud();
  }

  function hud() {
    ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillStyle = "rgba(10,9,16,.75)"; ctx.fillRect(12, 12, 250, 74);
    ctx.font = "20px Bungee, Impact, sans-serif"; ctx.fillStyle = "#ffcc33";
    ctx.fillText(score.toLocaleString(), 22, 20);
    ctx.font = "600 14px Chakra Petch, sans-serif"; ctx.fillStyle = "#ece8ff";
    ctx.fillText(`$${money.toLocaleString()}   ${time.toFixed(1)}s`, 130, 24);
    // health
    ctx.fillStyle = "#2c2847"; ctx.fillRect(22, 50, 140, 10);
    ctx.fillStyle = player.hp > 35 ? "#4fd16b" : "#ff3b5c"; ctx.fillRect(22, 50, Math.max(0, player.hp) * 1.4, 10);
    ctx.fillStyle = "#8f88b5"; ctx.font = "600 11px Chakra Petch, sans-serif"; ctx.fillText("CAR", 170, 48);
    // stars
    const lvl = wanted();
    for (let i = 0; i < 5; i++) star(30 + i * 22, 74, 7, i < lvl ? "#ffcc33" : "#3a3555");
    // minimap
    const m = 120, s = m / WORLD, mx = W - m - 14, my = 14;
    ctx.fillStyle = "rgba(10,9,16,.8)"; ctx.fillRect(mx - 4, my - 4, m + 8, m + 8);
    ctx.fillStyle = "#33303f";
    for (const b of blocks) if (!b.park) ctx.fillRect(mx + b.x * s, my + b.y * s, b.s * s, b.s * s);
    ctx.fillStyle = "#3f8f46"; for (const c of cash) ctx.fillRect(mx + c.x * s - 2, my + c.y * s - 2, 4, 4);
    ctx.fillStyle = "#ff3b5c"; for (const c of cops) ctx.fillRect(mx + c.x * s - 2, my + c.y * s - 2, 4, 4);
    ctx.fillStyle = "#ffcc33"; ctx.fillRect(mx + player.x * s - 3, my + player.y * s - 3, 6, 6);
    if (msgT > 0) {
      ctx.globalAlpha = Math.min(1, msgT); ctx.textAlign = "center"; ctx.font = "28px Bungee, Impact, sans-serif";
      ctx.fillStyle = "#ff3b5c"; ctx.fillText(msg, W / 2 + 3, H - 80 + 3);
      ctx.fillStyle = "#ffcc33"; ctx.fillText(msg, W / 2, H - 80);
      ctx.globalAlpha = 1;
    }
  }
  function star(x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * .45 : r, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.fill();
  }

  function loop(ts) {
    const t = ts / 1000, dt = Math.min(.033, t - (last || t)); last = t;
    if (state === "run") update(dt);
    if (player) draw(t);
    requestAnimationFrame(loop);
  }

  function start() { reset(); state = "run"; overlay.hidden = true; pauseBtn.textContent = "Pause"; cv.focus(); }
  function pause(force) {
    if (state === "run" || force === true && state === "run") {
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
  requestAnimationFrame(loop);
})();
