/* Shared portal behavior: thumbnails, search, favorites, ratings, fullscreen, awards. */
(() => {
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  // ---------- thumbnails ----------
  function burst(c, x, y, ro, ri, n, fill) {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro, a = i * Math.PI / n - Math.PI / 2; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.closePath(); c.fillStyle = fill; c.fill();
  }
  function label(c, w, h, txt, col) {
    c.font = `${Math.round(h * .13)}px Bungee, Impact, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = h * .035; c.strokeStyle = 'rgba(0,0,0,.75)'; c.strokeText(txt, w / 2, h * .86);
    c.fillStyle = col; c.fillText(txt, w / 2, h * .86);
  }
  const art = {
    knockout(c, w, h) {
      let g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b0d18'); g.addColorStop(.55, '#2a1a24'); g.addColorStop(.56, '#2c6fd2'); g.addColorStop(1, '#4b94f2');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = '#d0262a'; [.36, .44, .52].forEach(y => c.fillRect(0, h * y, w, h * .02));
      burst(c, w / 2, h * .38, h * .3, h * .2, 14, '#ffcc4a');
      c.fillStyle = '#d8362b'; c.beginPath(); c.arc(w * .3, h * .5, h * .14, 0, 7); c.fill();
      c.fillStyle = '#f1f1f1'; c.beginPath(); c.arc(w * .7, h * .42, h * .14, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.arc(w * .27, h * .46, h * .04, 0, 7); c.arc(w * .67, h * .38, h * .04, 0, 7); c.fill();
      label(c, w, h, 'KNOCKOUT ALLEY', '#ffd23a');
    },
    pursuit(c, w, h) {
      c.fillStyle = '#1b1a24'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#34303f'; [[.04, .05, .36, .3], [.56, .05, .4, .3], [.04, .55, .36, .3], [.56, .55, .4, .3]].forEach(r => c.fillRect(r[0] * w, r[1] * h, r[2] * w, r[3] * h));
      c.strokeStyle = '#ffcc33'; c.setLineDash([h * .05, h * .05]); c.lineWidth = h * .015;
      c.beginPath(); c.moveTo(0, h * .45); c.lineTo(w, h * .45); c.moveTo(w * .48, 0); c.lineTo(w * .48, h); c.stroke(); c.setLineDash([]);
      const car = (x, y, col, cop) => { c.fillStyle = col; c.fillRect(x - h * .07, y - h * .04, h * .14, h * .08); if (cop) { c.fillStyle = '#ff3b5c'; c.fillRect(x - h * .02, y - h * .04, h * .02, h * .04); c.fillStyle = '#3b8cff'; c.fillRect(x, y - h * .04, h * .02, h * .04); } };
      car(w * .72, h * .45, '#ffcc33'); car(w * .5, h * .45, '#e8e8f0', true); car(w * .48, h * .65, '#e8e8f0', true);
      label(c, w, h, 'CODE RED PURSUIT', '#ffcc33');
    },
    ember(c, w, h) {
      c.fillStyle = '#17150e'; c.fillRect(0, 0, w, h); c.fillStyle = '#3d3725'; c.fillRect(0, h * .62, w, h * .1); c.fillRect(w * .1, h * .35, w * .35, h * .06); c.fillRect(w * .55, h * .25, w * .35, h * .06);
      c.fillStyle = '#ff6a2b'; c.beginPath(); c.moveTo(w * .25, h * .6); c.lineTo(w * .3, h * .45); c.lineTo(w * .35, h * .6); c.fill();
      c.fillStyle = '#3bb8ff'; c.beginPath(); c.arc(w * .7, h * .52, h * .07, 0, 7); c.fill();
      label(c, w, h, 'EMBER & TIDE', '#ff9a52');
    },
    turret(c, w, h) {
      c.fillStyle = '#2f3d27'; c.fillRect(0, 0, w, h); c.fillStyle = '#6b7f3a'; c.beginPath(); c.arc(w * .5, h * .45, h * .16, 0, 7); c.fill();
      c.fillStyle = '#4d5c2a'; c.fillRect(w * .5, h * .42, w * .3, h * .06);
      label(c, w, h, 'TURRET TOWN', '#d6f08a');
    },
    pocket(c, w, h) {
      c.fillStyle = '#0f5a3a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#5a3216'; c.lineWidth = h * .06; c.strokeRect(0, 0, w, h);
      ['#ffd23a', '#d8262d', '#1f5fbf', '#111'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(w * (.35 + i * .1), h * (.4 + (i % 2) * .08), h * .055, 0, 7); c.fill(); });
      label(c, w, h, 'CORNER POCKET', '#ffffff');
    },
    courier(c, w, h) {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5ab3ff'); g.addColorStop(1, '#bfe3ff'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(w * .3, h * .3, h * .08, 0, 7); c.arc(w * .36, h * .28, h * .1, 0, 7); c.fill();
      c.fillStyle = '#e8462a'; c.beginPath(); c.moveTo(w * .5, h * .45); c.lineTo(w * .72, h * .5); c.lineTo(w * .5, h * .55); c.fill();
      label(c, w, h, 'SKY COURIER', '#ffffff');
    },
  };
  function drawThumbs() {
    document.querySelectorAll('canvas[data-thumb]').forEach(cv => {
      const f = art[cv.dataset.thumb]; if (f) f(cv.getContext('2d'), cv.width, cv.height);
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawThumbs); else drawThumbs();

  // ---------- search (filters tiles on the home page, or sends you there) ----------
  const form = document.querySelector('.search');
  if (form) {
    const input = form.querySelector('input');
    const tiles = [...document.querySelectorAll('[data-name]')];
    const filter = () => {
      const q = input.value.trim().toLowerCase();
      tiles.forEach(t => { t.hidden = q && !t.dataset.name.toLowerCase().includes(q); });
    };
    input.addEventListener('input', () => { if (tiles.length) filter(); });
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!tiles.length) location.href = form.dataset.home || '../../index.html';
      else filter();
    });
  }

  // ---------- game page widgets ----------
  const page = document.body.dataset.game;
  if (!page) return;

  const fav = document.querySelector('.fav');
  if (fav) {
    const key = `fav-${page}`;
    const setFav = v => { fav.setAttribute('aria-pressed', String(v)); fav.title = v ? 'Remove from favorites' : 'Add to favorites'; };
    setFav(store.get(key, false));
    fav.addEventListener('click', () => { const v = fav.getAttribute('aria-pressed') !== 'true'; store.set(key, v); setFav(v); });
  }

  const rate = document.querySelector('.rate');
  if (rate) {
    const key = `rate-${page}`;
    const stars = [...rate.querySelectorAll('button')];
    const paint = n => stars.forEach((s, i) => s.classList.toggle('on', i < n));
    paint(store.get(key, 0));
    stars.forEach((s, i) => {
      s.addEventListener('click', () => { store.set(key, i + 1); paint(i + 1); });
      s.addEventListener('mouseenter', () => paint(i + 1));
    });
    rate.addEventListener('mouseleave', () => paint(store.get(key, 0)));
  }

  const fs = document.querySelector('.fs');
  const frame = document.querySelector('.frame');
  if (fs && frame) {
    fs.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await frame.requestFullscreen();
      } catch { fs.textContent = 'Fullscreen not available'; }
    });
  }

  // awards: each game page lists them with data-award and a test against saved progress
  const tests = {
    'ka-first': s => s.beaten >= 1,
    'ka-champ': s => s.champ,
    'ka-defend': s => s.bestDef >= 3,
    'crp-cash': () => store.get('nsa-pursuit-best', 0) >= 5000,
    'crp-surv': () => store.get('nsa-pursuit-best', 0) >= 15000,
    'crp-legend': () => store.get('nsa-pursuit-best', 0) >= 40000,
  };
  function paintAwards() {
    const s = Object.assign({ beaten: 0, champ: false, bestDef: 0 }, store.get('ka-save', {}));
    const list = [...document.querySelectorAll('[data-award]')];
    let won = 0;
    list.forEach(a => { const ok = !!(tests[a.dataset.award] && tests[a.dataset.award](s)); a.classList.toggle('won', ok); if (ok) won++; });
    const count = document.querySelector('.award-count');
    if (count) count.textContent = `You have won ${won} of ${list.length} awards for this game.`;
  }
  paintAwards();
  window.addEventListener('ka-awards', paintAwards);
  window.addEventListener('crp-score', paintAwards);
})();
