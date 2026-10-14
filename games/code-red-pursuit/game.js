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
  function newCar(x, y, a) { return { x, y, a, v: 0, vx: 0, vy: 0, r: 15, steer: 0 }; }
  function reset() {
    player = newCar(CELL * 4, CELL * 4 + 30, 0); player.hp = 100;
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

  function update(dt) {
    time += dt;
    const steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const gas = keys.up ? 1 : keys.down ? -1 : 0;
    const slip = drive(player, gas, steer, keys.drift, dt, 430);
    player.slip = slip;
    if (slip > 90 && view) view.skid(player);
    const ph = collideBlocks(player);
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
      const pick = () => facades[Math.floor(r() * facades.length)];
      const tall = outside ? 1.4 : 1;
      const layout = r();
      if (layout < .3) building(cx, cz, bs - 2, bs - 2, (14 + r() * 30) * tall, pick());
      else if (layout < .65) { const hw = (bs - 3) / 2; for (const sx of [-1, 1]) building(cx + sx * (hw / 2 + .5), cz, hw, bs - 2, (10 + r() * 28) * tall, pick()); }
      else { const q = (bs - 3) / 2; for (const sx of [-1, 1]) for (const sz of [-1, 1]) building(cx + sx * (q / 2 + .5), cz + sz * (q / 2 + .5), q, q, (8 + r() * 26) * tall, pick()); }
    };
    for (const b of blocks) placeBlock(b, false);
    // ring of decorative blocks outside the playable area so the edge doesn't look empty
    for (let i = -1; i <= N; i++) for (let j = -1; j <= N; j++) if (i < 0 || j < 0 || i >= N || j >= N) placeBlock({ x: i * CELL + ROAD / 2, y: j * CELL + ROAD / 2, s: CELL - ROAD, park: false, i: i + 20, j: j + 20 }, true);
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
    const glass = new THREE.MeshLambertMaterial({ color: "#1a2638" });
    const tire = new THREE.MeshLambertMaterial({ color: "#151518" }), rim = new THREE.MeshLambertMaterial({ color: "#b8bcc8" });
    const wheelGeo = new THREE.CylinderGeometry(.42, .42, .32, 14); wheelGeo.rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(.24, .24, .34, 8); rimGeo.rotateX(Math.PI / 2);
    function makeCar(color, police) {
      const g = new THREE.Group();
      const paint = new THREE.MeshPhongMaterial({ color, shininess: 80, specular: "#666" });
      const black = new THREE.MeshPhongMaterial({ color: "#16161c", shininess: 60 });
      // lower body
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, .62, 1.7), paint); body.position.y = .62; g.add(body);
      // hood/trunk slope pieces
      const hood = new THREE.Mesh(new THREE.BoxGeometry(1.1, .18, 1.62), police ? black : paint); hood.position.set(1.25, .98, 0); g.add(hood);
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(.8, .16, 1.62), police ? black : paint); trunk.position.set(-1.4, .97, 0); g.add(trunk);
      // cabin with windows
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, .6, 1.5), [glass, glass, police ? paint : paint, paint, glass, glass]); cabin.position.set(-.15, 1.22, 0); g.add(cabin);
      if (police) {
        const doors = new THREE.Mesh(new THREE.BoxGeometry(1.6, .5, 1.72), new THREE.MeshPhongMaterial({ color: "#f4f4f8", shininess: 80 })); doors.position.set(-.1, .66, 0); g.add(doors);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(.4, .14, 1.3), black); bar.position.set(-.15, 1.58, 0); g.add(bar);
        const red = new THREE.Mesh(new THREE.BoxGeometry(.36, .16, .55), new THREE.MeshBasicMaterial({ color: "#ff2040" })); red.position.set(-.15, 1.62, .33); g.add(red);
        const blue = new THREE.Mesh(new THREE.BoxGeometry(.36, .16, .55), new THREE.MeshBasicMaterial({ color: "#2050ff" })); blue.position.set(-.15, 1.62, -.33); g.add(blue);
        g.userData.lights = [red, blue];
        // push bar
        const pb = new THREE.Mesh(new THREE.BoxGeometry(.15, .4, 1.3), black); pb.position.set(1.85, .5, 0); g.add(pb);
      } else {
        // spoiler and racing stripe
        const sp = new THREE.Mesh(new THREE.BoxGeometry(.3, .08, 1.6), black); sp.position.set(-1.7, 1.3, 0); g.add(sp);
        for (const z of [-.6, .6]) { const st = new THREE.Mesh(new THREE.BoxGeometry(.08, .28, .08), black); st.position.set(-1.7, 1.12, z); g.add(st); }
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.62, .02, .35), black); stripe.position.set(0, 1.07, 0); stripe.scale.set(1, 1, 1); g.add(stripe);
      }
      // lights
      const hl = new THREE.MeshBasicMaterial({ color: "#fff6d0" }), tl = new THREE.MeshBasicMaterial({ color: "#ff2020" });
      for (const z of [-.6, .6]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(.06, .16, .34), hl); h.position.set(1.81, .74, z); g.add(h);
        const t = new THREE.Mesh(new THREE.BoxGeometry(.06, .14, .34), tl); t.position.set(-1.81, .76, z); g.add(t);
      }
      // wheels
      g.userData.wheels = [];
      for (const [x, z] of [[1.15, .82], [1.15, -.82], [-1.15, .82], [-1.15, -.82]]) {
        const wg = new THREE.Group(); wg.position.set(x, .42, z);
        wg.add(new THREE.Mesh(wheelGeo, tire)); const rm = new THREE.Mesh(rimGeo, rim); wg.add(rm);
        g.add(wg); g.userData.wheels.push(wg);
      }
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.6), blobMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .04; g.add(shadow);
      scene.add(g);
      return g;
    }
    const playerMesh = makeCar("#ffc21a", false);
    const head = new THREE.SpotLight("#fff2d0", 30, 45, .5, .6, 1.2); head.position.set(1.8, .9, 0); playerMesh.add(head); head.target.position.set(12, 0, 0); playerMesh.add(head.target);
    const copPool = [];
    const sirenLights = [0, 1, 2].map(() => { const l = new THREE.PointLight("#ff2040", 0, 22, 1.4); scene.add(l); return l; });

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
      const lean = Math.max(-.08, Math.min(.08, -(c.steer || 0) * (c.v || 0) / 3000));
      mesh.rotation.x = lean;
      const ws = mesh.userData.wheels; const spin = (c.fwd || 0) * S / .42 * dt;
      for (let k = 0; k < 4; k++) { ws[k].children[0].rotation.z -= spin; ws[k].children[1].rotation.z -= spin; if (k < 2) ws[k].rotation.y = -(c.steer || 0) * .45; }
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
        }
        skidMesh.instanceMatrix.needsUpdate = true;
      },
      cashFx() { for (let i = 0; i < 20; i++) sparks.push({ x: player.x, y: player.y, z: 10, vx: (Math.random() - .5) * 200, vy: (Math.random() - .5) * 200, vz: 200 + Math.random() * 200, life: .7 }); },
      render(t, dt) {
        placeCar(playerMesh, player, dt);
        // cops
        while (copPool.length < cops.length) copPool.push(makeCar("#f4f4f8", true));
        copPool.forEach((m, k) => { const c = cops[k]; m.visible = !!c; if (!c) return; placeCar(m, c, dt); const on = Math.floor(t * 8 + k) % 2 === 0; m.userData.lights[0].material.color.set(on ? "#ff2040" : "#400810"); m.userData.lights[1].material.color.set(on ? "#102040" : "#3070ff"); });
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
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, 0, 0, W, H);
      },
      renderer,
    };
    return api;
  }
  let view_dome = null;

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
    // minimap, top right, north up
    const m = 170, s = m / WORLD, mx = W - m - 16, my = 16;
    ctx.save();
    ctx.fillStyle = "rgba(10,9,16,.85)"; roundRect(ctx, mx - 6, my - 6, m + 12, m + 12, 8); ctx.fill();
    ctx.strokeStyle = "#ffcc33"; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.rect(mx, my, m, m); ctx.clip();
    ctx.fillStyle = "#55535e"; ctx.fillRect(mx, my, m, m);
    for (const b of blocks) { ctx.fillStyle = b.park ? "#3f7a3a" : "#26242e"; ctx.fillRect(mx + b.x * s, my + b.y * s, b.s * s, b.s * s); }
    ctx.fillStyle = "#3f8f46"; for (const c of cash) { ctx.beginPath(); ctx.arc(mx + c.x * s, my + c.y * s, 3.5, 0, 7); ctx.fill(); ctx.fillStyle = "#ffd23a"; ctx.fillRect(mx + c.x * s - 1, my + c.y * s - 1, 2, 2); ctx.fillStyle = "#3f8f46"; }
    const on = Math.floor(t * 6) % 2;
    for (const c of cops) { ctx.fillStyle = on ? "#ff3b5c" : "#3b8cff"; ctx.beginPath(); ctx.arc(mx + c.x * s, my + c.y * s, 3.5, 0, 7); ctx.fill(); }
    ctx.translate(mx + player.x * s, my + player.y * s); ctx.rotate(player.a);
    ctx.fillStyle = "#ffcc33"; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.font = "600 11px Chakra Petch, sans-serif"; ctx.fillStyle = "#ffcc33"; ctx.textAlign = "center"; ctx.fillText("DOCKSIDE", mx + m / 2, my + m + 8);
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

  function loop(ts) {
    const t = ts / 1000, dt = Math.min(.033, t - (last || t)); last = t;
    if (state === "run") update(dt);
    if (view) { view.render(t, dt); if (state !== "menu") hud(t); }
    else { ctx.fillStyle = "#14131c"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#ffcc33"; ctx.font = "24px Bungee, Impact, sans-serif"; ctx.textAlign = "center"; ctx.fillText("LOADING CITY...", W / 2, H / 2); }
    requestAnimationFrame(loop);
  }
  function start() { reset(); state = "run"; overlay.hidden = true; pauseBtn.textContent = "Pause"; cv.focus(); }
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
  window.CodeRed = { debug: { get view() { return view; }, get cash() { return cash; }, get info() { return view && view.renderer.info.render; }, get player() { return player; }, get cops() { return cops; }, get state() { return state; }, keys, start, step(n) { for (let i = 0; i < n; i++) update(1 / 30); if (view) view.sync(true); } } };
})();
