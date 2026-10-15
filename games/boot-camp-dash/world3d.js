/* Boot Camp Dash 3D view. The game logic stays 1D (x along the course, y up, in px);
   this module draws it as a 3D army obstacle course with a camera behind the runner. */
import * as THREE from '../common/three.module.min.js';

export function createWorld({ W, H, GY }) {
  const S = 1 / 40;                       // px -> meters
  const Z = x => -x * S, Y = y => (GY - y) * S;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#cfe6f4', 40, 160);
  const camera = new THREE.PerspectiveCamera(58, W / H, 0.1, 400);

  const tex = (w, h, draw, rep) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  const rng = seed => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
  const lam = (o) => new THREE.MeshLambertMaterial(o);

  // sky
  {
    const t = tex(4, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#2f7ad8'); gr.addColorStop(.55, '#8cc4ee'); gr.addColorStop(.75, '#d8eef8'); gr.addColorStop(1, '#eef6f0'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); });
    var dome = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false }));
    scene.add(dome);
    // clouds
    const ct = tex(256, 128, (g) => { g.fillStyle = 'rgba(255,255,255,.95)'; for (const [x, y, r] of [[70, 80, 40], [120, 60, 50], [175, 78, 38], [100, 92, 34], [150, 95, 30]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } });
    const cr = rng(4);
    for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, fog: false, depthWrite: false })); s.scale.set(40 + cr() * 30, 20 + cr() * 10, 1); s.position.set(-120 + cr() * 240, 55 + cr() * 30, -cr() * 260 + 40); scene.add(s); }
  }
  scene.add(new THREE.HemisphereLight('#e8f4ff', '#5a7a3a', 1.0));
  const sun = new THREE.DirectionalLight('#fff4d8', 1.6);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 }); sun.shadow.bias = -.0008;
  scene.add(sun, sun.target);

  // ---------- materials ----------
  const grassT = tex(256, 256, (g, w, h) => { g.fillStyle = '#5c9a3c'; g.fillRect(0, 0, w, h); const r = rng(3); for (let i = 0; i < 6000; i++) { g.fillStyle = r() < .5 ? 'rgba(140,210,90,.35)' : 'rgba(30,70,20,.3)'; g.fillRect(r() * w, r() * h, 2, 4); } }, true);
  grassT.repeat.set(30, 120);
  const dirtT = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a7448'; g.fillRect(0, 0, w, h); const r = rng(9);
    for (let i = 0; i < 5000; i++) { g.fillStyle = r() < .5 ? 'rgba(60,36,14,.3)' : 'rgba(220,190,140,.3)'; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2); }
    for (let i = 0; i < 40; i++) { g.fillStyle = r() < .5 ? '#8a8072' : '#a49a88'; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 4, 2 + r() * 2, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(50,30,12,.3)'; for (let y = 10; y < h; y += 46) { g.beginPath(); g.ellipse(w * .4, y, 6, 12, 0, 0, 7); g.ellipse(w * .6, y + 23, 6, 12, 0, 0, 7); g.fill(); }
  }, true);
  const plankT = tex(128, 256, (g, w, h) => {
    for (let i = 0; i < 4; i++) { const gr = g.createLinearGradient(i * 32, 0, i * 32 + 32, 0); gr.addColorStop(0, '#8a5a2c'); gr.addColorStop(.5, '#b8844c'); gr.addColorStop(1, '#7a4a20'); g.fillStyle = gr; g.fillRect(i * 32, 0, 32, h); g.strokeStyle = '#3a2210'; g.lineWidth = 2; g.strokeRect(i * 32, 0, 32, h); }
    g.strokeStyle = 'rgba(58,34,16,.35)'; g.lineWidth = 1; for (let i = 0; i < 30; i++) { const x = (i * 37) % w; g.beginPath(); g.moveTo(x, (i * 53) % h); g.lineTo(x + 2, (i * 53) % h + 40); g.stroke(); }
    g.fillStyle = '#5a3a1e'; g.fillRect(0, 30, w, 14); g.fillRect(0, h - 60, w, 14);
    g.fillStyle = '#ccc'; for (const y of [37, h - 53]) for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(16 + i * 32, y, 2.5, 0, 7); g.fill(); }
  });
  const wood = lam({ color: '#6a4424' }), darkWood = lam({ color: '#4a2e14' });
  const olive = lam({ color: '#6e7a3c' }), oliveDark = lam({ color: '#4e5828' });
  const metal = lam({ color: '#8a8a90' }), sandbagM = lam({ color: '#c8b48a' });

  // ---------- static environment ----------
  const LEN = 360;   // meters of scenery
  const env = new THREE.Group(); scene.add(env);
  for (const side of [-1, 1]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(200, LEN + 120), lam({ map: grassT }));
    g.rotation.x = -Math.PI / 2; g.position.set(side * (1.75 + 100), 0, -LEN / 2 + 40); g.receiveShadow = true; env.add(g);
  }
  // track edging boards
  for (const side of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(.12, .16, LEN + 120), lam({ color: '#e8e2cc' })); b.position.set(side * 1.72, .08, -LEN / 2 + 40); b.receiveShadow = true; env.add(b); }
  // hills + treeline
  const hillM = lam({ color: '#7fae78', flatShading: true }), hillM2 = lam({ color: '#9cc0a0', flatShading: true });
  const hr = rng(21);
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1, s = 30 + hr() * 40;
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), i % 3 ? hillM : hillM2);
    h.scale.set(s, s * (.25 + hr() * .2), s); h.position.set(side * (90 + hr() * 60), -2, 40 - i * 18 - hr() * 10); env.add(h);
  }
  {
    const n = 220, tr = rng(7);
    const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1.4, 4.5, 7), lam({ color: '#3e6e2e', flatShading: true }), n);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .22, 1.2, 5), wood, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, s = .8 + tr() * .8, x = side * (34 + tr() * 30), z = 40 - tr() * (LEN + 60);
      m.compose(v.set(x, .6 * s, z), q, sc.set(s, s, s)); trunk.setMatrixAt(i, m);
      m.compose(v.set(x, (1.2 + 2.25) * s, z), q, sc.set(s, s, s)); cone.setMatrixAt(i, m);
    }
    env.add(cone, trunk);
  }
  // camp props on the left, fence + sandbags on the right
  const add = (mesh, x, y, z, ry = 0, shadow = true) => { mesh.position.set(x, y, z); mesh.rotation.y = ry; if (shadow) { mesh.castShadow = true; mesh.receiveShadow = true; } env.add(mesh); return mesh; };
  const tent = (x, z, w, d) => {
    const g = new THREE.Group(), r = w * .62;
    const prism = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d, 3), olive); prism.rotation.x = -Math.PI / 2; prism.position.y = r / 2; prism.castShadow = true; prism.receiveShadow = true; g.add(prism);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(r * .5, r * .9), lam({ color: '#2a2e14' })); door.position.set(0, r * .3, d / 2 + .02); g.add(door);
    add(g, x, 0, z, Math.PI / 2, false);
  };
  const tower = (x, z) => {
    const g = new THREE.Group();
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.1, .14, 6, 5), wood); leg.position.set(lx * 1.1, 3, lz * 1.1); leg.castShadow = true; g.add(leg); }
    const hut = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3), lam({ color: '#7a5530' })); hut.position.y = 6.8; hut.castShadow = true; g.add(hut);
    const win = new THREE.Mesh(new THREE.BoxGeometry(3.05, .5, 3.05), lam({ color: '#2a1a0a' })); win.position.y = 7.1; g.add(win);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.4, 4), olive); roof.position.y = 8.3; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    add(g, x, 0, z);
  };
  const truck = (x, z, ry) => {
    const g = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 4.2), olive); bed.position.set(0, 1.5, -.8); g.add(bed);
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 4.2, 12, 1, false, -Math.PI / 2, Math.PI), oliveDark); cover.rotation.x = -Math.PI / 2; cover.position.set(0, 2.3, -.8); g.add(cover);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.7, 1.8), olive); cab.position.set(0, 1.55, 2.2); g.add(cab);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2, .6, .05), lam({ color: '#9ab8c8' })); glass.position.set(0, 2, 3.11); g.add(glass);
    for (const [wx, wz] of [[-1.15, 2.2], [1.15, 2.2], [-1.15, -.4], [1.15, -.4], [-1.15, -1.9], [1.15, -1.9]]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .35, 12), lam({ color: '#1a1a1a' })); wh.rotation.z = Math.PI / 2; wh.position.set(wx, .5, wz); g.add(wh); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    add(g, x, 0, z, ry, false);
  };
  const crates = (x, z) => { for (const [dx, dy, dz] of [[0, .5, 0], [1.05, .5, 0], [.5, 1.5, 0]]) add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lam({ map: plankT })), x + dx, dy, z + dz, .1); };
  const flag = (x, z) => {
    add(new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 7, 6), metal), x, 3.5, z);
    const ft = tex(64, 40, (g) => { g.fillStyle = '#4e5a2a'; g.fillRect(0, 0, 64, 40); g.fillStyle = '#e8c24a'; g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 5 : 12, a = i * Math.PI / 5 - Math.PI / 2; g.lineTo(32 + Math.cos(a) * r, 20 + Math.sin(a) * r); } g.fill(); });
    const f = add(new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1, 8, 1), lam({ map: ft, side: THREE.DoubleSide })), x + .9, 6.4, z, 0, false); f.userData.flag = true;
    flags.push(f);
  };
  const flags = [];
  const sandbags = (x, z, n = 4, ry = 0) => {
    const g = new THREE.Group();
    for (let row = 0; row < 2; row++) for (let i = 0; i < n - row; i++) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(.18, .38, 3, 8), sandbagM); b.rotation.z = Math.PI / 2; b.scale.set(1, 1, .8); b.position.set((i - (n - row - 1) / 2) * .62, .18 + row * .3, 0); b.castShadow = true; g.add(b); }
    add(g, x, 0, z, ry, false);
  };
  const drum = (x, z) => add(new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .9, 12), lam({ color: '#3a5a2a' })), x, .45, z);
  const pr = rng(31);
  for (let z = 10; z > -LEN; z -= 26 + pr() * 14) {
    const k = pr(), x = -(7 + pr() * 9);
    if (k < .3) tent(x, z, 4 + pr() * 2, 5 + pr() * 2);
    else if (k < .45) tower(x - 3, z);
    else if (k < .6) truck(x - 2, z, pr() * .6 - .3);
    else if (k < .8) { crates(x + 2, z); drum(x + 4, z + 2); }
    else flag(x + 3, z);
  }
  for (let z = 0; z > -LEN; z -= 14 + pr() * 18) { const k = pr(); if (k < .5) sandbags(3.4 + pr(), z, 4, Math.PI / 2); else if (k < .7) drum(3.5, z); else if (k < .85) flag(5, z); else crates(4, z); }
  // chain link fence on the right
  {
    const ft = tex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(150,150,150,.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke(); }, true);
    ft.repeat.set((LEN + 120) / 1.2, 2);
    const fence = new THREE.Mesh(new THREE.PlaneGeometry(LEN + 120, 2.4), lam({ map: ft, transparent: true, alphaTest: .3, side: THREE.DoubleSide }));
    fence.rotation.y = Math.PI / 2; fence.position.set(9, 1.2, -LEN / 2 + 40); env.add(fence);
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.05, .05, 2.6, 5), metal, 60);
    const m = new THREE.Matrix4(); for (let i = 0; i < 60; i++) { m.makeTranslation(9, 1.3, 40 - i * ((LEN + 120) / 60)); posts.setMatrixAt(i, m); }
    env.add(posts);
  }

  // ---------- course (rebuilt per course) ----------
  let courseGroup = null, courseKey = null, waterMats = [], mudMats = [];
  const banner = (text, w, h, bg, fg) => tex(512, 128, (g) => { g.fillStyle = bg; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#1e1408'; g.lineWidth = 10; g.strokeRect(0, 0, 512, 128); g.font = '72px "Black Ops One", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeText(text, 256, 68); g.fillStyle = fg; g.fillText(text, 256, 68); });
  function buildCourse(course) {
    if (courseKey === course) return;
    if (courseGroup) { scene.remove(courseGroup); courseGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    courseKey = course; courseGroup = new THREE.Group(); scene.add(courseGroup); waterMats = []; mudMats = [];
    const cg = courseGroup;
    const put = (m, x, y, z, ry = 0, cast = true) => { m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = cast; m.receiveShadow = true; cg.add(m); return m; };
    const obs = course.obs, len = course.d.length;
    // track segments around water pits
    const pits = obs.filter(o => o.type === 'water').map(o => [o.x, o.x + o.w]);
    let sx = -800; const segs = []; for (const [a, b] of pits) { segs.push([sx, a]); sx = b; } segs.push([sx, len + 1600]);
    for (const [a, b] of segs) {
      const l = (b - a) * S, t = dirtT.clone(); t.needsUpdate = true; t.repeat.set(1, l / 3.4);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.2, l), [lam({ color: '#6a4a2a' }), lam({ color: '#6a4a2a' }), lam({ map: t }), lam({ color: '#5a3a1e' }), lam({ color: '#6a4a2a' }), lam({ color: '#6a4a2a' })]);
      put(seg, 0, -.6, (Z(a) + Z(b)) / 2, 0, false);
    }
    for (const [a, b] of pits) {
      const l = (b - a) * S, zc = (Z(a) + Z(b)) / 2;
      const wt = tex(128, 128, (g) => { g.fillStyle = '#3a8ac8'; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(230,248,255,.6)'; g.lineWidth = 3; for (let y = 8; y < 128; y += 22) { g.beginPath(); for (let x = 0; x <= 128; x += 8) g.lineTo(x, y + Math.sin(x * .1) * 4); g.stroke(); } }, true);
      wt.repeat.set(1, l / 2);
      const wm = new THREE.MeshPhongMaterial({ map: wt, transparent: true, opacity: .9, shininess: 90 }); waterMats.push(wt);
      put(new THREE.Mesh(new THREE.PlaneGeometry(3.3, l), wm), 0, -.45, zc, 0, false).rotation.x = -Math.PI / 2;
      for (const side of [-1, 1]) put(new THREE.Mesh(new THREE.BoxGeometry(.2, 1.2, l), lam({ color: '#5a3a1e' })), side * 1.75, -.6, zc, 0, false);
      put(new THREE.Mesh(new THREE.BoxGeometry(3.3, .1, l), lam({ color: '#1a3a5a' })), 0, -1.1, zc, 0, false);
      for (const side of [-1, 1]) { sbRow(cg, side * 2.4, zc, l); }
    }
    for (const o of obs) {
      const z0 = Z(o.x), z1 = Z(o.x + o.w), zc = (z0 + z1) / 2, l = o.w * S;
      if (o.type === 'hurdle') {
        for (const side of [-1, 1]) put(new THREE.Mesh(new THREE.BoxGeometry(.1, 1.15, .1), wood), side * 1.3, .575, zc);
        const bt = tex(128, 16, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fff' : '#d8282e'; g.fillRect(i * 16, 0, 16, 16); } });
        put(new THREE.Mesh(new THREE.BoxGeometry(2.8, .2, .1), lam({ map: bt })), 0, 1.08, zc);
        for (const side of [-1, 1]) put(new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .6), wood), side * 1.3, .05, zc);
      } else if (o.type === 'wire') {
        const posts = Math.max(2, Math.round(l / 1.4) + 1);
        for (let i = 0; i < posts; i++) for (const side of [-1, 1]) put(new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, 1.9, 5), wood), side * 1.45, .95, z0 + (z1 - z0) * i / (posts - 1));
        const wireM = lam({ color: '#555' });
        for (const hy of [Y(GY - 66), Y(GY - 52)]) {
          for (let k = -2; k <= 2; k++) { const w = put(new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, l, 3), wireM), k * .7, hy + Math.sin(k) * .03, zc, 0, true); w.rotation.x = Math.PI / 2; }
          for (let i = 0; i < posts; i++) { const w = put(new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 2.9, 3), wireM), 0, hy, z0 + (z1 - z0) * i / (posts - 1)); w.rotation.z = Math.PI / 2; }
        }
        // barbs
        const barb = new THREE.InstancedMesh(new THREE.BoxGeometry(.08, .012, .012), metal, 120); let n = 0; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
        for (let k = -2; k <= 2; k++) for (let i = 0; i < 12 && n < 120; i++) { e.set(0, Math.PI / 4 * (i % 2 ? 1 : -1), 0); q.setFromEuler(e); m.compose(new THREE.Vector3(k * .7, Y(GY - 66), z0 + (z1 - z0) * (i + .5) / 12), q, new THREE.Vector3(1, 1, 1)); barb.setMatrixAt(n++, m); }
        barb.count = n; cg.add(barb);
        // DUCK sign
        const st = tex(128, 48, (g) => { g.fillStyle = '#e8c24a'; g.fillRect(0, 0, 128, 48); g.fillStyle = '#1a1a1a'; g.font = 'bold 32px Verdana'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('DUCK!', 64, 26); });
        put(new THREE.Mesh(new THREE.PlaneGeometry(1, .38), lam({ map: st })), -1.45, 2.1, z0 + .05, 0, false);
        sandbagPile(cg, -2.1, z0); sandbagPile(cg, 2.1, z0);
      } else if (o.type === 'wall') {
        const h = 130 * S, th = o.w * S;
        const wallM = lam({ map: plankT });
        put(new THREE.Mesh(new THREE.BoxGeometry(3.1, h, th), [lam({ color: '#7a4a20' }), lam({ color: '#7a4a20' }), lam({ color: '#5a3a1e' }), lam({ color: '#5a3a1e' }), wallM, wallM]), 0, h / 2, zc);
        const cap = tex(64, 8, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#1a1a1a' : '#e8c24a'; g.fillRect(i * 8, 0, 8, 8); } });
        put(new THREE.Mesh(new THREE.BoxGeometry(3.2, .14, th + .06), lam({ map: cap })), 0, h + .07, zc);
        // braces behind
        for (const side of [-1, 1]) { const b = put(new THREE.Mesh(new THREE.BoxGeometry(.14, h * 1.05, .14), darkWood), side * 1.3, h / 2, z1 - .7); b.rotation.x = -.45; }
        // knotted ropes in front
        for (const rx of [-.7, .7]) {
          const rope = put(new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, h, 6), lam({ color: '#c8a46a' })), rx, h / 2, z0 + .12); rope.rotation.x = -.06;
          for (let k = 1; k < 5; k++) put(new THREE.Mesh(new THREE.SphereGeometry(.07, 6, 4), lam({ color: '#9a7a44' })), rx, k * h / 5, z0 + .13 + k * .01);
        }
      } else if (o.type === 'mud') {
        const mt = tex(128, 128, (g) => { g.fillStyle = '#4a3018'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 40; i++) { g.fillStyle = i % 2 ? 'rgba(110,80,50,.6)' : 'rgba(30,18,6,.5)'; g.beginPath(); g.ellipse((i * 37) % 128, (i * 53) % 128, 6 + i % 8, 3 + i % 4, 0, 0, 7); g.fill(); } }, true);
        mt.repeat.set(1.4, l / 2.2); mudMats.push(mt);
        const mm = put(new THREE.Mesh(new THREE.PlaneGeometry(3.2, l + .6), new THREE.MeshPhongMaterial({ map: mt, shininess: 60 })), 0, .015, zc, 0, false); mm.rotation.x = -Math.PI / 2;
      }
    }
    // start banner, finish arch, distance markers
    const bt = banner('BOOT CAMP', 0, 0, '#4a5a2a', '#f0e6c0');
    for (const side of [-1, 1]) put(new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 4.8, 6), wood), side * 3, 2.4, Z(300));
    put(new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.3, .12), [wood, wood, wood, wood, lam({ map: bt }), lam({ map: bt })]), 0, 4.3, Z(300));
    const ft = tex(512, 128, (g) => { for (let i = 0; i < 32; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 16, j * 16, 16, 16); } g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(120, 22, 272, 84); g.font = '70px "Black Ops One", Impact'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffe14a'; g.fillText('FINISH', 256, 68); });
    for (const side of [-1, 1]) put(new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 5, 8), lam({ color: '#ddd' })), side * 3, 2.5, Z(len));
    put(new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.4, .12), [metal, metal, metal, metal, lam({ map: ft }), lam({ map: ft })]), 0, 4.5, Z(len));
    for (let m = 500; m < len; m += 500) {
      const mt = tex(128, 64, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#3a2a1a'; g.lineWidth = 6; g.strokeRect(0, 0, 128, 64); g.fillStyle = '#3a2a1a'; g.font = 'bold 40px Verdana'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${m / 10}m`, 64, 34); });
      put(new THREE.Mesh(new THREE.BoxGeometry(.06, 1.2, .06), wood), 2.2, .6, Z(m));
      const sign = put(new THREE.Mesh(new THREE.PlaneGeometry(.8, .4), lam({ map: mt, side: THREE.DoubleSide })), 2.2, 1.35, Z(m), 0, false); sign.rotation.y = -.5;
    }
  }
  function sandbagPile(group, x, z) {
    const g = new THREE.Group();
    for (const [dx, dy] of [[-.32, 0], [.32, 0], [0, .3]]) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(.18, .38, 3, 8), sandbagM); b.rotation.z = Math.PI / 2; b.position.set(dx, .18 + dy, 0); b.castShadow = true; g.add(b); }
    g.position.set(x, 0, z); group.add(g);
  }
  function sbRow(group, x, zc, l) {
    const n = Math.ceil(l / .6) + 2, g = new THREE.Group();
    for (let i = 0; i < n; i++) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(.18, .38, 3, 8), sandbagM); b.rotation.x = Math.PI / 2; b.position.set(0, .18, -l / 2 - .6 + i * .6 + .3); b.castShadow = true; g.add(b); }
    g.position.set(x, 0, zc); group.add(g);
  }

  // ---------- people ----------
  function person(cfg) {
    const M = c => lam({ color: c });
    const skin = M(cfg.skin), pants = M(cfg.pants), top = M(cfg.top), boot = M('#2a2218');
    const root = new THREE.Group(), hips = new THREE.Group(); hips.position.y = .92; root.add(hips);
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(.36, .18, .22), pants); hips.add(pelvis);
    const torso = new THREE.Group(); hips.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(.42, .5, .25), top); chest.position.y = .32; torso.add(chest);
    if (cfg.belly) { const b = new THREE.Mesh(new THREE.SphereGeometry(.2, 10, 8), top); b.scale.set(1.05, 1, .9); b.position.set(0, .2, -.08); torso.add(b); }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, .1, 8), skin); neck.position.y = .6; torso.add(neck);
    const head = new THREE.Group(); head.position.y = .75; torso.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(.15, 14, 12), skin); skull.scale.set(1, 1.08, 1.02); head.add(skull);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.03, .07, 6), skin); nose.rotation.x = -Math.PI / 2; nose.position.set(0, -.01, -.16); head.add(nose);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), M('#fff')); eye.position.set(sx * .055, .03, -.13); head.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(.016, 6, 4), M('#111')); pupil.position.set(sx * .055, .03, -.155); head.add(pupil);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(.06, .015, .02), M('#2a1608')); brow.position.set(sx * .055, .075, -.145); brow.rotation.z = sx * .25; head.add(brow);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(.035, 6, 4), skin); ear.position.set(sx * .15, 0, 0); head.add(ear);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(.06, .015, .02), M('#5a1a10')); mouth.position.set(0, -.07, -.145); head.add(mouth);
    if (cfg.hair) { const hair = new THREE.Mesh(new THREE.SphereGeometry(.155, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), M(cfg.hair)); hair.position.y = .02; head.add(hair); }
    if (cfg.bandana) { const band = new THREE.Mesh(new THREE.CylinderGeometry(.158, .158, .05, 16), M('#c8282e')); band.position.y = .06; head.add(band); for (const dy of [0, -.06]) { const tail = new THREE.Mesh(new THREE.BoxGeometry(.03, .14, .04), M('#c8282e')); tail.position.set(0, .02 + dy, .17); tail.rotation.x = .6; head.add(tail); } }
    if (cfg.hat) { const brim = new THREE.Mesh(new THREE.CylinderGeometry(.26, .26, .03, 16), M(cfg.hat)); brim.position.y = .08; head.add(brim); const crown = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, .16, 12), M(cfg.hat)); crown.position.y = .17; head.add(crown); }
    if (cfg.dogtag) { const tag = new THREE.Mesh(new THREE.BoxGeometry(.04, .06, .01), M('#d6d6d6')); tag.position.set(0, .42, -.13); torso.add(tag); }
    if (cfg.stripes) for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(.08, .02, .02), M('#e8c24a')); s.position.set(-.22, .45 - i * .04, 0); s.rotation.y = Math.PI / 2; torso.add(s); }
    const limb = (len, w, mat, handMat) => { const pivot = new THREE.Group(); const seg = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat); seg.position.y = -len / 2; pivot.add(seg); const end = new THREE.Group(); end.position.y = -len; pivot.add(end); seg.castShadow = true; return { pivot, end }; };
    const arms = [], legs = [];
    for (const sx of [-1, 1]) {
      const up = limb(.3, .11, cfg.sleeves ? top : skin); up.pivot.position.set(sx * .27, .52, 0); torso.add(up.pivot);
      const lo = limb(.28, .1, skin); up.end.add(lo.pivot);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(.055, 8, 6), skin); hand.position.y = -.3; lo.pivot.add(hand);
      arms.push({ s: up.pivot, e: lo.pivot, hand: lo.pivot });
      const th = limb(.44, .15, pants); th.pivot.position.set(sx * .11, -.04, 0); hips.add(th.pivot);
      const sh = limb(.42, .13, pants); th.end.add(sh.pivot);
      const b = new THREE.Mesh(new THREE.BoxGeometry(.14, .1, .27), boot); b.position.set(0, -.44, -.05); sh.pivot.add(b); b.castShadow = true;
      legs.push({ h: th.pivot, k: sh.pivot });
    }
    root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { root, hips, torso, head, arms, legs, mouth };
  }
  const hero = person({ skin: '#d89a6a', pants: '#5e6a36', top: '#7d8a3a', hair: '#3a2a1a', bandana: true, dogtag: true });
  scene.add(hero.root);
  const sarge = person({ skin: '#c88a5a', pants: '#4a5030', top: '#5e6e34', hat: '#4a5a2a', sleeves: true, stripes: true, belly: true });
  sarge.root.scale.setScalar(1.08); sarge.root.position.set(-2.6, 0, Z(60)); sarge.root.rotation.y = -Math.PI / 2 + .5; scene.add(sarge.root);
  {
    const mega = new THREE.Group(); const cone = new THREE.Mesh(new THREE.CylinderGeometry(.13, .05, .3, 12, 1, true), lam({ color: '#e8e8e8', side: THREE.DoubleSide })); cone.rotation.x = Math.PI / 2; mega.add(cone);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.13, .02, 6, 16), lam({ color: '#c8282e' })); ring.position.z = -.15; mega.add(ring);
    mega.position.set(0, -.3, -.12); sarge.arms[1].e.add(mega);
    sarge.arms[1].s.rotation.x = 1.9; sarge.arms[1].e.rotation.x = .9; sarge.arms[0].s.rotation.set(.2, 0, .25);
  }

  function pose(P, st, anim, t) {
    const p = anim * 1.9, A = P.arms, Lg = P.legs;
    P.root.rotation.set(0, 0, 0); P.hips.position.y = .92; P.torso.rotation.set(0, 0, 0); P.head.rotation.set(0, 0, 0);
    const set = (a0, e0, a1, e1, h0, k0, h1, k1) => { A[0].s.rotation.set(a0, 0, .12); A[0].e.rotation.set(e0, 0, 0); A[1].s.rotation.set(a1, 0, -.12); A[1].e.rotation.set(e1, 0, 0); Lg[0].h.rotation.set(h0, 0, 0); Lg[0].k.rotation.set(k0, 0, 0); Lg[1].h.rotation.set(h1, 0, 0); Lg[1].k.rotation.set(k1, 0, 0); };
    if (st === 'run') {
      const s = Math.sin(p), c = Math.cos(p);
      set(-s * 1.1, 1.4, s * 1.1, 1.4, s * .95, -(.25 + Math.max(0, c) * 1.5), -s * .95, -(.25 + Math.max(0, -c) * 1.5));
      P.torso.rotation.x = -.22; P.hips.position.y = .92 + Math.abs(c) * .05;
    } else if (st === 'jump') { set(2.6, .3, 2.2, .5, 1.3, -1.4, -.4, -.6); P.torso.rotation.x = -.15; }
    else if (st === 'slide') { P.root.rotation.x = 1.15; P.hips.position.y = .55; set(2.9, .2, 2.9, .2, .5, -.3, .2, -.2); P.head.rotation.x = -.8; }
    else if (st === 'climb') { const s = Math.sin(t); set(2.9 + s * .3, .3, 2.9 - s * .3, .3, 1.1 + s * .5, -1.6, 1.1 - s * .5, -1.6); P.torso.rotation.x = -.15; }
    else if (st === 'trip') { P.root.rotation.x = -1.0; set(1.6 + Math.sin(t * 12) * .5, .4, 1.4 - Math.sin(t * 12) * .5, .4, .6, -.8, -.4, -1.2); }
    else { const b = Math.sin(t * 2) * .03; set(.05, .15, -.05, .15, 0, 0, 0, 0); P.hips.position.y = .92 + b; }
  }

  // ---------- frame ----------
  const camPos = new THREE.Vector3(0, 3, 6), look = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  function render(ctx, g, course, t, dt) {
    if (course) buildCourse(course);
    for (const w of waterMats) w.offset.y = (t * .15) % 1;
    for (const f of flags) { const pos = f.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, Math.sin(x * 3 + t * 6) * .12 * (x + .9)); } pos.needsUpdate = true; }
    let px = 120, py = GY, st = 'idle', anim = 0;
    if (g) { px = g.p.x; py = g.p.y; st = g.p.st; anim = g.p.anim; }
    hero.root.position.set(0, Y(py), Z(px));
    pose(hero, st, anim, t);
    // sergeant bobs and shouts
    sarge.mouth.scale.y = 1 + Math.abs(Math.sin(t * 10)) * 3;
    sarge.torso.rotation.y = Math.sin(t * 1.3) * .15;
    // camera behind the runner
    const climbing = st === 'climb';
    if (!g) { const a = t * .25; camPos.set(Math.sin(a) * 6, 2.6, Z(px) + Math.cos(a) * 6); look.set(0, 1.1, Z(px)); }
    else {
      v3.set(.8, Y(py) * .6 + (climbing ? 3.4 : 2.4), Z(px) + (climbing ? 3.6 : 4.8));
      camPos.lerp(v3, Math.min(1, dt * 6));
      look.set(0, Y(py) * .7 + 1.1, Z(px) - 3.5);
    }
    camera.position.copy(camPos); camera.lookAt(look);
    dome.position.set(camera.position.x, 0, camera.position.z);
    sun.position.set(8, 18, Z(px) + 6); sun.target.position.set(0, 0, Z(px) - 2);
    renderer.render(scene, camera);
    ctx.drawImage(renderer.domElement, 0, 0, W, H);
  }
  // world (px) -> screen (canvas px), for floating text
  function project(px, py) { v3.set(0, Y(py), Z(px)).project(camera); return { x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H, vis: v3.z < 1 }; }
  return { render, project, renderer };
}
