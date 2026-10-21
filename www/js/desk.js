/* Тексты песен и караоке на ПК: кнопки в панели «Сейчас играет» и текст на всё окно с подсветкой строки.
 * Только для .exe/браузера (html без .apk). Поиск текстов — общий модуль js/lyrics.js.
 */
(function () {
  'use strict';
  const root = document.documentElement;
  const S = window.SquadApp, L = window.SquadLyrics;
  if (root.classList.contains('apk') || !S || !L) return;

  const $ = (id) => document.getElementById(id);
  const esc = S.esc;
  const svg = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  const IC = {
    lyrics: 'M4 5h16M4 10h16M4 15h10M4 20h7',
    mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
    close: 'M6 6l12 12M18 6 6 18',
  };

  // ---------- Кнопки в панели плеера ----------
  const acts = document.querySelector('.np-actions');
  const bLyr = document.createElement('button');
  bLyr.className = 'chip dk-chip';
  bLyr.innerHTML = svg(IC.lyrics) + 'Текст';
  const bKara = document.createElement('button');
  bKara.className = 'chip dk-chip';
  bKara.innerHTML = svg(IC.mic) + 'Караоке';
  acts.append(bLyr, bKara);

  // ---------- Текст на всё окно ----------
  const ov = document.createElement('div');
  ov.className = 'dl';
  ov.innerHTML = '<div class="dl-bg"></div><header class="dl-head"><img class="dl-art" alt=""><div class="dl-meta"><b></b><span></span></div>' +
    '<button class="chip dl-kara">' + svg(IC.mic) + '<span>Караоке</span></button>' +
    '<button class="icon-btn dl-close" title="Закрыть (Esc)">' + svg(IC.close) + '</button></header>' +
    '<div class="dl-body"><div class="dl-lines"></div></div>';
  document.body.appendChild(ov);
  const body = ov.querySelector('.dl-body'), box = ov.querySelector('.dl-lines'), kb = ov.querySelector('.dl-kara');
  const st = { open: false, kara: false, key: null, lines: null, cur: -1, raf: 0 };

  function setKara(on) {
    st.kara = on;
    S.setFx('karaoke', on ? 1 : 0);
    ov.classList.toggle('kara', on);
    kb.classList.toggle('on', on);
    bKara.classList.toggle('on', on && st.open);
    kb.lastChild.textContent = on ? 'Голос убран' : 'Караоке';
    st.cur = -1;
  }
  function open(kara) {
    st.open = true;
    ov.classList.add('show');
    bLyr.classList.add('on');
    if (kara !== st.kara) setKara(!!kara);
    load();
  }
  function close() {
    if (!st.open) return;
    st.open = false;
    ov.classList.remove('show');
    bLyr.classList.remove('on');
    cancelAnimationFrame(st.raf);
    if (st.kara) setKara(false); // закрыли — голос возвращается
    bKara.classList.remove('on');
  }
  bLyr.onclick = () => (st.open ? close() : open(false));
  bKara.onclick = () => (st.open && st.kara ? close() : open(true));
  kb.onclick = () => setKara(!st.kara);
  ov.querySelector('.dl-close').onclick = close;
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.open) close(); });
  body.addEventListener('click', (e) => {
    if (e.target.closest('[data-dl="retry"]')) { const t = S.cur(); if (t) { L.forget(t.key); load(); } return; }
    const l = e.target.closest('[data-t]');
    if (l) S.seek(+l.dataset.t);
  });

  function head(t) {
    ov.querySelector('.dl-meta b').textContent = t ? t.title : 'Ничего не играет';
    ov.querySelector('.dl-meta span').textContent = t ? t.artist || '' : '';
    const src = $('cover-img').getAttribute('src') || '';
    ov.querySelector('.dl-art').src = src;
    ov.querySelector('.dl-bg').style.backgroundImage = src ? 'url("' + src.replace(/"/g, '%22') + '")' : '';
  }
  async function load() {
    const t = S.cur();
    cancelAnimationFrame(st.raf);
    head(t);
    if (!t) { box.innerHTML = '<p class="dl-hint">Включите трек — здесь появится его текст.</p>'; return; }
    st.key = t.key; st.lines = null; st.cur = -1;
    box.innerHTML = '<p class="dl-hint">Ищем текст…</p>';
    try {
      const r = await L.get(t);
      if (st.key !== t.key || !st.open) return;
      if (r.none) { box.innerHTML = '<p class="dl-hint">Текст не нашёлся ни в файле, ни в LRCLIB, ни в lyrics.ovh.</p><button class="chip" data-dl="retry">Искать снова</button>'; return; }
      if (r.instrumental && !r.synced && !r.plain) { box.innerHTML = '<p class="dl-hint">Это инструментальный трек.</p>'; return; }
      const lines = L.parse(r.synced);
      if (lines.length) {
        st.lines = lines;
        box.innerHTML = lines.map((l, i) => '<p data-i="' + i + '" data-t="' + l.t + '">' + (esc(l.text) || '♪') + '</p>').join('');
        tick();
      } else box.innerHTML = '<div class="dl-plain">' + esc(r.plain).replace(/\n/g, '<br>') + '</div>';
      if (r.src) box.insertAdjacentHTML('beforeend', '<p class="dl-src">Текст: ' + esc(r.src) + '</p>');
    } catch (_) {
      if (st.key === t.key) box.innerHTML = '<p class="dl-hint">Не удалось загрузить текст. Проверьте интернет.</p><button class="chip" data-dl="retry">Ещё раз</button>';
    }
  }
  function tick() {
    if (!st.open || !st.lines) return;
    const now = S.time().cur + 0.25;
    let i = -1;
    for (let k = 0; k < st.lines.length && st.lines[k].t <= now; k++) i = k;
    if (i !== st.cur) {
      const prev = box.querySelector('.on');
      if (prev) prev.classList.remove('on');
      const el = box.querySelector('[data-i="' + i + '"]');
      if (el) {
        el.classList.add('on');
        body.scrollTo({ top: el.offsetTop - body.clientHeight / 2 + el.offsetHeight / 2, behavior: st.cur < 0 ? 'auto' : 'smooth' });
      } else if (i < 0) body.scrollTo({ top: 0 });
      st.cur = i;
    }
    st.raf = requestAnimationFrame(tick);
  }
  S.on('track', () => { if (st.open && (S.cur() || {}).key !== st.key) load(); });

  // клик по обложке или названию в нижнем плеере — текст на всё окно
  document.querySelector('.now .cover').addEventListener('click', () => { if (matchMedia('(min-width: 821px)').matches) open(false); });
  document.querySelector('.now .meta').addEventListener('click', () => { if (matchMedia('(min-width: 821px)').matches) open(false); });

  // ---------- Главная на ПК: приветствие, «Моя волна», плитки и ряды из своей медиатеки ----------
  const home = $('panel-home');
  const ST = window.SquadStats;
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const art = (t, cls) => t && t.thumb
    ? '<span class="' + cls + '"><img loading="lazy" alt="" src="' + esc(t.thumb) + '"></span>'
    : '<span class="' + cls + '" style="background:linear-gradient(135deg,hsl(' + hue(t ? t.artist + t.title : 'S') + ',70%,45%),hsl(' + ((hue(t ? t.title : 'S') + 50) % 360) + ',80%,30%))"><b>' + esc(((t && t.title) || 'S')[0].toUpperCase()) + '</b></span>';
  const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 17 ? 'Добрый день' : h < 23 ? 'Добрый вечер' : 'Доброй ночи'; };
  const MOODS = [['all', 'Вся музыка'], ['liked', 'Любимое'], ['top', 'Чаще всего'], ['fresh', 'Ещё не слушал']];
  let mood = 'all';
  try { mood = localStorage.getItem('squad.desk.mood') || 'all'; } catch (_) {}
  const stat = () => (ST ? ST.data.t : {});
  const liked = () => (S.playlists.find((p) => p.id === 'liked') || { keys: [] }).keys.filter((k) => S.byKey(k));
  function waveKeys(m) {
    const all = S.tracks.map((t) => t.key), st = stat();
    if (m === 'liked') return liked();
    if (m === 'top') return all.filter((k) => st[k] && st[k].n).sort((a, b) => st[b].n - st[a].n).slice(0, 100);
    if (m === 'fresh') return all.filter((k) => !st[k] || !st[k].n);
    return all;
  }
  function wave() {
    const keys = waveKeys(mood);
    if (!keys.length) { S.toast(mood === 'all' ? 'Добавьте музыку в медиатеку' : 'Для этого настроения пока нет треков'); return; }
    S.play(keys, Math.floor(Math.random() * keys.length), true);
  }
  // треки из статистики: по ключу, только те, что ещё есть в медиатеке
  const fromStats = (sort, n, filter) => Object.entries(stat()).filter(([k, e]) => S.byKey(k) && (!filter || filter(e))).sort(sort).slice(0, n).map(([k]) => k);
  const row = (title, keys, from) => keys.length ? '<section class="dh-sec"><h2>' + title + '</h2><div class="dh-row">' + keys.map((k) => {
    const t = S.byKey(k), cur = S.cur() === t;
    return '<button class="dh-card' + (cur ? ' on' : '') + '" data-k="' + esc(k) + '" data-from="' + from + '">' + art(t, 'dh-art') +
      '<b>' + esc(t.title) + '</b><small>' + esc(t.artist || '') + '</small></button>';
  }).join('') + '</div></section>' : '';
  const lists = {};
  function render() {
    if (S.settings.tab !== 'home' || root.classList.contains('apk')) return;
    const P = window.SquadProfile, cur = S.cur();
    const recent = fromStats((a, b) => b[1].last - a[1].last, 24);
    const top = fromStats((a, b) => b[1].n - a[1].n || b[1].sec - a[1].sec, 16, (e) => e.n > 0);
    const old = fromStats((a, b) => a[1].last - b[1].last, 16, (e) => e.n >= 2 && Date.now() - e.last > 7 * 864e5);
    const fresh = S.tracks.slice(-16).reverse().map((t) => t.key);
    Object.assign(lists, { recent, top, old, fresh });
    const lk = liked();
    const tiles = [['liked', null]].concat(recent.slice(0, 5).map((k) => ['t', k]));
    home.innerHTML =
      '<div class="dh">' +
      '<header class="dh-head">' + (P ? '<button class="dh-me" data-act="profile" title="Профиль">' + P.avatarHtml() + '</button>' : '') +
        '<h1>' + greet() + (P ? ', <span>' + esc(P.name()) + '</span>' : '') + '</h1></header>' +
      '<section class="dh-wave">' + (cur && cur.thumb ? '<i class="dh-wave-bg" style="background-image:url(&quot;' + esc(cur.thumb) + '&quot;)"></i>' : '') +
        '<div class="dh-wave-txt"><h2>Моя волна</h2><p>Бесконечный поток из вашей медиатеки под настроение</p>' +
        '<div class="dh-moods">' + MOODS.map(([id, l]) => '<button class="chip' + (mood === id ? ' on' : '') + '" data-mood="' + id + '">' + l + '</button>').join('') + '</div></div>' +
        '<button class="dh-play" data-act="wave" aria-label="Запустить волну"><svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg></button></section>' +
      (S.tracks.length ? '<div class="dh-tiles">' + tiles.map(([type, k]) => {
        if (type === 'liked') return '<button class="dh-tile" data-act="liked"><span class="dh-tart liked"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9.2-8.6C1.2 8.2 3 4.5 6.6 4.5c2.1 0 3.4 1.2 4.4 2.6 1-1.4 2.3-2.6 4.4-2.6 3.6 0 5.4 3.7 3.8 6.9C19 15.6 12 20 12 20z"/></svg></span><span><b>Любимые</b><small>' + lk.length + ' ' + (lk.length % 10 === 1 && lk.length % 100 !== 11 ? 'трек' : lk.length % 10 >= 2 && lk.length % 10 <= 4 && (lk.length % 100 < 10 || lk.length % 100 >= 20) ? 'трека' : 'треков') + '</small></span></button>';
        const t = S.byKey(k);
        return '<button class="dh-tile" data-k="' + esc(k) + '" data-from="recent">' + art(t, 'dh-tart') + '<span><b>' + esc(t.title) + '</b><small>' + esc(t.artist || '') + '</small></span></button>';
      }).join('') + '</div>' : '<div class="dh-empty"><p>Медиатека пуста. Добавьте музыку во вкладке «Треки».</p><button class="btn primary" data-act="lib">Открыть треки</button></div>') +
      row('Сейчас слушаешь', recent.slice(5), 'recent') + row('Чаще всего', top, 'top') + row('Вернуться к', old, 'old') + row('Новое в медиатеке', fresh, 'fresh') +
      (S.playlists.filter((p) => p.id !== 'liked' && p.keys.length).length ? '<section class="dh-sec"><h2>Плейлисты</h2><div class="dh-row">' +
        S.playlists.filter((p) => p.id !== 'liked' && p.keys.length).map((p) => '<button class="dh-card" data-pl="' + esc(p.id) + '">' + art(S.byKey(p.keys.find((k) => S.byKey(k))), 'dh-art') +
          '<b>' + esc(p.name) + '</b><small>' + p.keys.length + ' тр.</small></button>').join('') + '</div></section>' : '') +
      '</div>';
  }
  home.addEventListener('click', (e) => {
    const el = e.target.closest('[data-k],[data-mood],[data-act],[data-pl]');
    if (!el) return;
    if (el.dataset.mood) { mood = el.dataset.mood; try { localStorage.setItem('squad.desk.mood', mood); } catch (_) {} render(); return; }
    if (el.dataset.pl) { S.openLib('playlists', el.dataset.pl); return; }
    const act = el.dataset.act;
    if (act === 'wave') { wave(); return; }
    if (act === 'profile') { S.showTab('profile'); return; }
    if (act === 'lib') { S.showTab('library'); return; }
    if (act === 'liked') { const k = liked(); if (k.length) S.play(k, 0, false); else S.openLib('playlists', 'liked'); return; }
    const list = lists[el.dataset.from] || [el.dataset.k];
    if (S.cur() && S.cur().key === el.dataset.k) { S.togglePlay(); return; }
    S.play(list, Math.max(0, list.indexOf(el.dataset.k)), false);
  });
  let homeT = 0;
  const soon = () => { clearTimeout(homeT); homeT = setTimeout(render, 300); };
  S.on('tab', render);
  S.on('library', soon);
  S.on('track', soon);
  render();
  // обложка подгружается после события трека
  new MutationObserver(() => { if (st.open) head(S.cur()); }).observe($('cover-img'), { attributes: true, attributeFilter: ['src'] });
})();
