/* GiantClip portal behavior: featured carousel, search, favorites, ratings, fullscreen, awards. */
(() => {
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  // ---------- latest games carousel ----------
  const slides = [
    { img: 'assets/icons/rune-feature.png', href: 'games/rune-raiders/index.html', title: 'Rune Raiders', text: 'Fight through a Viking fjord village and reach the longship.' },
    { img: 'assets/icons/ember-feature.png', href: 'games/ember-tide/index.html', title: 'Ember & Tide', text: 'Guide fire and water through the Ice Temple. Two players, one keyboard.' },
    { img: 'assets/icons/knockout-feature.png', href: 'games/knockout-alley/index.html', title: 'Knockout Alley', text: 'Five fighters stand between you and the belt. Dodge, counter, knock them out!' },
    { img: 'assets/icons/pursuit.png', href: 'games/code-red-pursuit/index.html', title: 'Code Red Pursuit', text: 'Grab the cash and lose the cops. How long can you last?' },
  ];
  const fImg = document.getElementById('fImg');
  if (fImg) {
    let cur = 0, timer = null;
    const pages = [...document.querySelectorAll('.pager .pg button')];
    const show = i => {
      cur = (i + slides.length) % slides.length; const s = slides[cur];
      fImg.src = s.img; fImg.alt = s.title;
      ['fLink', 'fTitle', 'fPlay'].forEach(id => { document.getElementById(id).href = s.href; });
      document.getElementById('fTitle').textContent = s.title;
      document.getElementById('fText').textContent = s.text;
      pages.forEach((b, j) => b.setAttribute('aria-current', String(j === cur)));
    };
    const auto = () => { clearInterval(timer); timer = setInterval(() => show(cur + 1), 6000); };
    document.getElementById('prev').addEventListener('click', () => { show(cur - 1); auto(); });
    document.getElementById('next').addEventListener('click', () => { show(cur + 1); auto(); });
    pages.forEach(b => b.addEventListener('click', () => { show(+b.dataset.i); auto(); }));
    auto();
  }

  // ---------- search ----------
  const form = document.querySelector('.searchbox');
  if (form) {
    const input = form.querySelector('input');
    const tiles = [...document.querySelectorAll('.page [data-name]')];
    const filter = () => {
      const q = input.value.trim().toLowerCase();
      tiles.forEach(t => { t.hidden = !!q && !t.dataset.name.toLowerCase().includes(q); });
    };
    if (tiles.length) input.addEventListener('input', filter);
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (tiles.length) { filter(); return; }
      const q = input.value.trim().toLowerCase(), home = form.dataset.home || 'index.html';
      const hit = [['knockout', 'knockout-alley'], ['boxing', 'knockout-alley'], ['ember', 'ember-tide'], ['tide', 'ember-tide'], ['temple', 'ember-tide'], ['ice', 'ember-tide'], ['pursuit', 'code-red-pursuit'], ['rune', 'rune-raiders'], ['viking', 'rune-raiders'], ['raider', 'rune-raiders'], ['police', 'code-red-pursuit'], ['chase', 'code-red-pursuit']].find(([w]) => q.includes(w));
      location.href = hit ? home.replace('index.html', `games/${hit[1]}/index.html`) : home;
    });
  }

  // ---------- awards (every page) ----------
  const tests = {
    'ka-first': (k) => k.beaten >= 1,
    'ka-champ': (k) => k.champ,
    'ka-defend': (k) => k.bestDef >= 3,
    'et-first': (k, e) => !!e.best[0],
    'et-all': (k, e) => [0, 1, 2].every(i => e.best[i]),
    'et-ace': (k, e) => [0, 1, 2].every(i => e.best[i] && e.best[i].rank === 'A'),
    'rr-done': (k, e, r) => !!r.done,
    'rr-stars': (k, e, r) => r.stars >= 3,
    'rr-kills': (k, e, r) => !!r.allKills,
    'crp-cash': () => store.get('nsa-pursuit-best', 0) >= 5000,
    'crp-surv': () => store.get('nsa-pursuit-best', 0) >= 15000,
    'crp-legend': () => store.get('nsa-pursuit-best', 0) >= 40000,
  };
  function paintAwards() {
    const k = Object.assign({ beaten: 0, champ: false, bestDef: 0 }, store.get('ka-save', {}));
    const e = Object.assign({ best: {} }, store.get('et-save', {}));
    const r = Object.assign({ done: false, stars: 0 }, store.get('rr-save', {}));
    let total = 0;
    for (const id in tests) if (tests[id](k, e, r)) total++;
    document.querySelectorAll('.award-total').forEach(el => { el.textContent = total; });
    const list = [...document.querySelectorAll('[data-award]')];
    let won = 0;
    list.forEach(a => { const ok = !!(tests[a.dataset.award] && tests[a.dataset.award](k, e, r)); a.classList.toggle('won', ok); if (ok) won++; });
    const count = document.querySelector('.award-count');
    if (count) count.textContent = `You have won ${won} of ${list.length} awards for this game.`;
  }
  paintAwards();
  ['ka-awards', 'et-awards', 'rr-awards', 'crp-score'].forEach(ev => window.addEventListener(ev, paintAwards));

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
