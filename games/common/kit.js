/* GiantClip shared game kit: canvas UI, loading screen, audio, input plumbing. */
window.GCKit = function (canvasId, title, saveKey) {
  const cv = document.getElementById(canvasId), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, CX = W / 2;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  const K = {
    cv, ctx, W, H, CX, store, btns: [], ptr: { x: -1, y: -1 }, muted: store.get(saveKey + '-mute', false), t: 0, loadT: 0,
    L: (a, b, k) => a + (b - a) * k, C: (v, a, b) => v < a ? a : v > b ? b : v, R: (a, b) => a + Math.random() * (b - a),
  };
  K.shade = (hex, amt) => { const n = parseInt(hex.slice(1), 16), C = K.C; return `rgb(${C((n >> 16) + amt, 0, 255)},${C((n >> 8 & 255) + amt, 0, 255)},${C((n & 255) + amt, 0, 255)})`; };
  K.rr = (c, x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
  // audio
  let ac = null, nb = null;
  K.audio = () => { if (K.muted) return; if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } } if (ac.state === 'suspended') ac.resume(); };
  K.tone = (f, dur, vol, type = 'sine', f2) => {
    if (K.muted || !ac) return;
    const o = ac.createOscillator(), g = ac.createGain(), n = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, n); if (f2) o.frequency.exponentialRampToValueAtTime(f2, n + dur);
    g.gain.setValueAtTime(vol, n); g.gain.exponentialRampToValueAtTime(.001, n + dur);
    o.connect(g).connect(ac.destination); o.start(n); o.stop(n + dur + .05);
  };
  K.noise = (dur, f, q, vol, type = 'bandpass') => {
    if (K.muted || !ac) return;
    if (!nb) { nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ac.createBufferSource(); s.buffer = nb; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ac.createGain(), n = ac.currentTime; g.gain.setValueAtTime(vol, n); g.gain.exponentialRampToValueAtTime(.001, n + dur);
    s.connect(fl).connect(g).connect(ac.destination); s.start(n); s.stop(n + dur + .05);
  };
  K.click = () => K.tone(520, .05, .12, 'square');
  K.fanfare = () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => K.tone(f, .25, .14, 'triangle'), i * 120));
  // text and controls
  K.outline = (txt, x, y, size, fill, stroke, font = 'Bungee, Impact, sans-serif', align = 'center') => {
    ctx.font = `${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, size / 5); ctx.strokeStyle = stroke; ctx.strokeText(txt, x, y); ctx.fillStyle = fill; ctx.fillText(txt, x, y);
  };
  const inside = (p, x, y, w, h) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
  K.inside = inside;
  K.button = (label, x, y, w, h, fn, opts = {}) => {
    const hov = inside(K.ptr, x - w / 2, y - h / 2, w, h);
    ctx.save(); ctx.translate(x, y); if (hov) ctx.scale(1.05, 1.05);
    ctx.fillStyle = '#5a2306'; K.rr(ctx, -w / 2, -h / 2 + 5, w, h, 14); ctx.fill();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#ffc04a'); g.addColorStop(1, '#f07a10');
    ctx.fillStyle = g; K.rr(ctx, -w / 2, -h / 2, w, h, 14); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff1c4'; K.rr(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 10); ctx.stroke();
    K.outline(label, 0, 2, opts.size || Math.min(32, h * .5), '#fff', '#7a2a06');
    ctx.restore();
    K.btns.push({ x: x - w / 2, y: y - h / 2, w, h, fn, primary: opts.primary });
  };
  K.iconBtn = (x, y, kind, fn) => {
    const hov = inside(K.ptr, x, y, 34, 34);
    ctx.fillStyle = hov ? '#ffb43a' : '#f08a14'; K.rr(ctx, x, y, 34, 34, 7); ctx.fill(); ctx.strokeStyle = '#7a3a06'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#3a1a04'; ctx.strokeStyle = '#3a1a04';
    if (kind === 'pause') { ctx.fillRect(x + 11, y + 9, 5, 16); ctx.fillRect(x + 19, y + 9, 5, 16); }
    else if (kind === 'full') { ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 8, y + 15); ctx.lineTo(x + 8, y + 8); ctx.lineTo(x + 15, y + 8); ctx.moveTo(x + 19, y + 8); ctx.lineTo(x + 26, y + 8); ctx.lineTo(x + 26, y + 15); ctx.moveTo(x + 26, y + 19); ctx.lineTo(x + 26, y + 26); ctx.lineTo(x + 19, y + 26); ctx.moveTo(x + 15, y + 26); ctx.lineTo(x + 8, y + 26); ctx.lineTo(x + 8, y + 19); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(x + 8, y + 13); ctx.lineTo(x + 13, y + 13); ctx.lineTo(x + 19, y + 8); ctx.lineTo(x + 19, y + 26); ctx.lineTo(x + 13, y + 21); ctx.lineTo(x + 8, y + 21); ctx.fill(); ctx.lineWidth = 2.5; ctx.beginPath(); if (kind === 'sound') ctx.arc(x + 20, y + 17, 6, -1, 1); else { ctx.moveTo(x + 22, y + 12); ctx.lineTo(x + 29, y + 22); ctx.moveTo(x + 29, y + 12); ctx.lineTo(x + 22, y + 22); } ctx.stroke(); }
    K.btns.push({ x, y, w: 34, h: 34, fn });
  };
  K.toggleMute = () => { K.muted = !K.muted; store.set(saveKey + '-mute', K.muted); if (!K.muted) K.audio(); };
  K.toggleFs = () => { const f = cv.parentElement; try { const r = document.fullscreenElement ? document.exitFullscreen() : f.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch {} };
  K.watermark = () => {
    ctx.save(); ctx.font = '22px "Lilita One", "Arial Black", Impact, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#5a1e00'; ctx.strokeText('GIANTCLIP', 14, H - 16);
    const g = ctx.createLinearGradient(0, H - 38, 0, H - 14); g.addColorStop(0, '#ffd23a'); g.addColorStop(1, '#ff7a10'); ctx.fillStyle = g; ctx.fillText('GIANTCLIP', 14, H - 16);
    ctx.restore();
  };
  K.hudButtons = (onPause) => {
    K.iconBtn(W - 50, H - 46, K.muted ? 'muted' : 'sound', K.toggleMute);
    if (onPause) K.iconBtn(W - 92, H - 46, 'pause', onPause);
    K.iconBtn(W - (onPause ? 134 : 92), H - 46, 'full', K.toggleFs);
    K.watermark();
  };
  K.panel = (x, y, w, h, top = '#2f6fbf', bot = '#16365e', edge = '#cfe6ff') => {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; K.rr(ctx, x, y, w, h, 18); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.08)'; K.rr(ctx, x + 6, y + 6, w - 12, h * .3, 14); ctx.fill();
  };
  K.loading = (dt, onDone) => {
    K.loadT += dt;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d2350'); g.addColorStop(1, '#03091a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = .08; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(CX, H * .42, 60 + i * 40, 0, 7); ctx.stroke(); } ctx.restore();
    const lg = ctx.createLinearGradient(0, H * .33, 0, H * .44); lg.addColorStop(0, '#ffe066'); lg.addColorStop(.5, '#ff9a10'); lg.addColorStop(1, '#e2500a');
    K.outline('GIANTCLIP', CX, H * .38, 78, lg, '#5a1e00', '"Lilita One", "Arial Black", Impact, sans-serif');
    K.outline('PLAY ONLINE GAMES', CX, H * .48, 18, '#fff', '#0d2350');
    const k = Math.min(1, K.loadT / 2.4), bw = 360, bx = CX - bw / 2, by = H * .6;
    ctx.fillStyle = '#0a1530'; K.rr(ctx, bx - 4, by - 4, bw + 8, 30, 15); ctx.fill(); ctx.strokeStyle = '#4b93e0'; ctx.lineWidth = 2; ctx.stroke();
    const pg = ctx.createLinearGradient(0, by, 0, by + 22); pg.addColorStop(0, '#ffd27a'); pg.addColorStop(.5, '#ff8a00'); pg.addColorStop(1, '#e25f00');
    ctx.fillStyle = pg; K.rr(ctx, bx, by, Math.max(22, bw * k), 22, 11); ctx.fill();
    ctx.font = 'bold 15px Verdana, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#cfe0ff';
    ctx.fillText(k < 1 ? `Loading ${title}... ${Math.floor(k * 100)}%` : 'Ready!', CX, by + 60);
    if (K.loadT > 2.7) onDone();
  };
  // pointer
  const toCanvas = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
  cv.addEventListener('pointermove', e => { K.ptr = toCanvas(e); });
  cv.addEventListener('pointerleave', () => { K.ptr = { x: -1, y: -1 }; });
  K.onPointer = null;
  cv.addEventListener('pointerdown', e => {
    K.audio(); K.ptr = toCanvas(e);
    for (let i = K.btns.length - 1; i >= 0; i--) { const b = K.btns[i]; if (inside(K.ptr, b.x, b.y, b.w, b.h)) { K.click(); b.fn(); return; } }
    if (K.onPointer) K.onPointer(K.ptr);
  });
  K.pressPrimary = () => { const b = K.btns.find(x => x.primary); if (b) { K.click(); b.fn(); } };
  K.loop = (fn, fonts = []) => {
    let last = 0;
    const frame = ts => {
      const now = ts / 1000, dt = Math.min(.033, now - (last || now)); last = now; K.t += dt;
      K.btns = []; fn(dt);
      cv.style.cursor = K.btns.some(b => inside(K.ptr, b.x, b.y, b.w, b.h)) ? 'pointer' : 'default';
      requestAnimationFrame(frame);
    };
    const all = ['20px Bungee', '20px "Lilita One"', ...fonts];
    const go = () => requestAnimationFrame(frame);
    if (document.fonts) Promise.all(all.map(f => document.fonts.load(f).catch(() => {}))).then(go); else go();
  };
  // touch pads: elements with data-pad="key" set K.keys[key]
  K.keys = {};
  K.bindPad = (onPress) => document.querySelectorAll('[data-pad]').forEach(b => {
    const k = b.dataset.pad;
    b.addEventListener('pointerdown', e => { e.preventDefault(); K.audio(); b.classList.add('on'); K.keys[k] = 1; if (onPress) onPress(k); });
    const up = () => { b.classList.remove('on'); K.keys[k] = 0; };
    b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
  });
  return K;
};
