/* GiantClip portal behavior: featured carousel, search, favorites, ratings, fullscreen, awards. */
(() => {
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  // ---------- featured carousel ----------
  const slides = [
    { img: 'assets/icons/hero-ember.png', href: 'games/ember-tide/index.html', title: 'Ember & Tide' },
    { img: 'assets/icons/hero-bootcamp.png', href: 'games/boot-camp-dash/index.html', title: 'Boot Camp Dash' },
    { img: 'assets/icons/hero-rune.png', href: 'games/rune-raiders/index.html', title: 'Rune Raiders' },
    { img: 'assets/icons/hero-morph.png', href: 'games/morph-blob/index.html', title: 'Morph Blob' },
    { img: 'assets/icons/hero-knockout.png', href: 'games/knockout-alley/index.html', title: 'Knockout Alley' },
  ];
  const fImg = document.getElementById('fImg');
  if (fImg) {
    slides.forEach(sl => { const im = new Image(); im.src = sl.img; });
    let cur = 0, timer = null;
    const dots = [...document.querySelectorAll('.dots button')];
    const show = i => {
      cur = (i + slides.length) % slides.length; const sl = slides[cur];
      fImg.src = sl.img; fImg.alt = sl.title;
      document.getElementById('fLink').href = sl.href; document.getElementById('fPlay').href = sl.href;
      dots.forEach((d, j) => d.setAttribute('aria-current', String(j === cur)));
    };
    const auto = () => { clearInterval(timer); timer = setInterval(() => show(cur + 1), 6000); };
    document.getElementById('next').addEventListener('click', () => { show(cur + 1); auto(); });
    dots.forEach(d => d.addEventListener('click', () => { show(+d.dataset.i); auto(); }));
    auto();
  }

  // ---------- search ----------
  const form = document.querySelector('.searchbox');
  if (form) {
    const input = form.querySelector('input');
    const tiles = [...document.querySelectorAll('.home [data-name]')];
    const filter = () => {
      const q = input.value.trim().toLowerCase();
      tiles.forEach(t => { t.hidden = !!q && !t.dataset.name.toLowerCase().includes(q); });
    };
    if (tiles.length) input.addEventListener('input', filter);
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (tiles.length) { filter(); return; }
      const q = input.value.trim().toLowerCase(), home = form.dataset.home || 'index.html';
      const hit = [['knockout', 'knockout-alley'], ['boxing', 'knockout-alley'], ['ember', 'ember-tide'], ['tide', 'ember-tide'], ['temple', 'ember-tide'], ['ice', 'ember-tide'], ['pursuit', 'code-red-pursuit'], ['rune', 'rune-raiders'], ['boot', 'boot-camp-dash'], ['camp', 'boot-camp-dash'], ['assault', 'boot-camp-dash'], ['slope', 'slope-agent'], ['snow', 'slope-agent'], ['board', 'slope-agent'], ['ride', 'slope-agent'], ['morph', 'morph-blob'], ['blob', 'morph-blob'], ['alien', 'morph-blob'], ['transform', 'morph-blob'], ['flip', 'flip-runner'], ['gravity', 'flip-runner'], ['runner', 'flip-runner'], ['viking', 'rune-raiders'], ['raider', 'rune-raiders'], ['police', 'code-red-pursuit'], ['chase', 'code-red-pursuit']].find(([w]) => q.includes(w));
      location.href = hit ? home.replace('index.html', `games/${hit[1]}/index.html`) : home;
    });
  }

  // ---------- awards (every page) ----------
  const tests = {
    'ka-first': (k) => k.beaten >= 1,
    'ka-champ': (k) => k.champ,
    'ka-defend': (k) => k.bestDef >= 3,
    'et-first': (k, e) => !!e.best[0],
    'et-all': (k, e) => [0, 1, 2, 3, 4, 5, 6].every(i => e.best[i]),
    'et-ace': (k, e) => [0, 1, 2, 3, 4, 5, 6].every(i => e.best[i] && e.best[i].rank === 'A'),
    'rr-done': (k, e, r) => !!r.done,
    'rr-stars': (k, e, r) => r.stars >= 3,
    'rr-kills': (k, e, r) => !!r.allKills,
    'fr-500': (k, e, r, f) => f.best >= 500,
    'fr-2000': (k, e, r, f) => f.best >= 2000,
    'fr-orbs': (k, e, r, f) => f.orbs >= 300,
    'bc-done': (k, e, r, f, x) => (x.bc.best[0] || 0) > 0,
    'bc-gold': (k, e, r, f, x) => Math.max(...x.bc.medals.map(v => v || 0)) >= 3,
    'bc-sgt': (k, e, r, f, x) => (x.bc.medals[1] || 0) >= 3,
    'sa-5k': (k, e, r, f, x) => x.sa.best >= 5000,
    'sa-15k': (k, e, r, f, x) => x.sa.best >= 15000,
    'sa-trick': (k, e, r, f, x) => x.sa.bestTrick >= 2000,
    'mb-first': (k, e, r, f, x) => !!x.mb.best[0],
    'mb-all': (k, e, r, f, x) => [0, 1, 2, 3].every(i => x.mb.best[i]),
    'mb-stars': (k, e, r, f, x) => [0, 1, 2, 3].every(i => x.mb.best[i] && x.mb.best[i].stars >= 3),
    'crp-cash': () => store.get('nsa-pursuit-best', 0) >= 5000,
    'crp-surv': () => store.get('nsa-pursuit-best', 0) >= 15000,
    'crp-legend': () => store.get('nsa-pursuit-best', 0) >= 40000,
  };
  function paintAwards() {
    const k = Object.assign({ beaten: 0, champ: false, bestDef: 0 }, store.get('ka-save', {}));
    const e = Object.assign({ best: {} }, store.get('et-save', {}));
    const r = Object.assign({ done: false, stars: 0 }, store.get('rr-save', {}));
    const f = Object.assign({ best: 0, orbs: 0 }, store.get('fr-save', {}));
    const x = { bc: Object.assign({ best: [0, 0], medals: [0, 0] }, store.get('bc-save', {})), sa: Object.assign({ best: 0, bestTrick: 0 }, store.get('sa-save', {})), mb: Object.assign({ best: {} }, store.get('mb-save', {})) };
    let total = 0;
    for (const id in tests) if (tests[id](k, e, r, f, x)) total++;
    document.querySelectorAll('.award-total').forEach(el => { el.textContent = total; });
    const list = [...document.querySelectorAll('[data-award]')];
    let won = 0;
    list.forEach(a => { const ok = !!(tests[a.dataset.award] && tests[a.dataset.award](k, e, r, f, x)); a.classList.toggle('won', ok); if (ok) won++; });
    const count = document.querySelector('.award-count');
    if (count) count.textContent = `You have won ${won} of ${list.length} awards for this game.`;
  }
  paintAwards();
  ['ka-awards', 'et-awards', 'rr-awards', 'fr-awards', 'bc-awards', 'sa-awards', 'mb-awards', 'crp-score'].forEach(ev => window.addEventListener(ev, paintAwards));

  // ---------- accounts: coming soon ----------
  document.querySelectorAll('[data-incoming]').forEach(b => b.addEventListener('click', () => {
    const wrap = document.createElement('div'); wrap.className = 'incoming'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    const box = document.createElement('div');
    const h = document.createElement('h3'); h.textContent = 'INCOMING!';
    const p = document.createElement('p'); p.textContent = 'GiantClip accounts are on the way. For now, your scores and awards save right here in this browser.';
    const ok = document.createElement('button'); ok.type = 'button'; ok.textContent = 'GOT IT';
    box.append(h, p, ok); wrap.append(box); document.body.append(wrap); ok.focus();
    const close = () => wrap.remove();
    ok.addEventListener('click', close); wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  }));

  // ---------- random game, recently played, favorites ----------
  const GAMES = { 'knockout-alley': 'Knockout Alley', 'ember-tide': 'Ember & Tide', 'code-red-pursuit': 'Code Red Pursuit', 'rune-raiders': 'Rune Raiders', 'flip-runner': 'Flip Runner', 'boot-camp-dash': 'Boot Camp Dash', 'slope-agent': 'Slope Agent', 'morph-blob': 'Morph Blob' };
  const ICON = { 'knockout-alley': 'knockout', 'ember-tide': 'ember', 'code-red-pursuit': 'pursuit', 'rune-raiders': 'rune', 'flip-runner': 'flip', 'boot-camp-dash': 'bootcamp', 'slope-agent': 'slope', 'morph-blob': 'morph' };
  document.querySelectorAll('.random').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const keys = Object.keys(GAMES).filter(s => s !== document.body.dataset.game);
    location.href = `${a.dataset.root || ''}games/${keys[Math.floor(Math.random() * keys.length)]}/index.html`;
  }));
  const cur = document.body.dataset.game;
  if (cur) { const rec = store.get('gc-recent', []).filter(s => s !== cur); rec.unshift(cur); store.set('gc-recent', rec.slice(0, 4)); }
  const fill = (el, slugs) => {
    el.replaceChildren();
    for (const s of slugs) {
      const a = document.createElement('a'); a.href = `games/${s}/index.html`; a.className = 'mini-game';
      const img = document.createElement('img'); img.src = `assets/icons/sq-${ICON[s]}.png`; img.alt = ''; img.width = 44; img.height = 44;
      const span = document.createElement('span'); span.textContent = GAMES[s];
      a.append(img, span); el.append(a);
    }
    el.closest('section').hidden = slugs.length === 0;
  };
  const recEl = document.querySelector('[data-list="recent"]'), favEl = document.querySelector('[data-list="favs"]');
  if (recEl) fill(recEl, store.get('gc-recent', []).filter(s => GAMES[s]));
  if (favEl) fill(favEl, Object.keys(GAMES).filter(s => store.get(`fav-${s}`, false)));

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
    const key = `rate-${page}`, stars = [...rate.querySelectorAll('button')];
    const paint = n => stars.forEach((s, i) => s.classList.toggle('on', i < n));
    paint(store.get(key, 0));
    stars.forEach((s, i) => {
      s.addEventListener('click', () => { store.set(key, i + 1); paint(i + 1); });
      s.addEventListener('mouseenter', () => paint(i + 1));
    });
    rate.addEventListener('mouseleave', () => paint(store.get(key, 0)));
  }
  const fs = document.querySelector('.fs'), frame = document.querySelector('.frame');
  if (fs && frame) {
    fs.addEventListener('click', async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await frame.requestFullscreen(); }
      catch { fs.title = 'Fullscreen is not available here'; }
    });
  }
})();
