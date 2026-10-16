/* Интерфейс APK на Material Design 3: нижняя навигация, главная с «Моей волной» и статистикой,
 * поиск, плеер на весь экран (фон из обложки, тексты песен, таймер, скорость), «Любимые».
 * Работает только с классом html.apk (ставит js/app.js на Android или с ?apk=1), .exe не меняется.
 */
(function () {
  'use strict';
  const root = document.documentElement;
  const S = window.SquadApp;
  if (!root.classList.contains('apk') || !S) return;

  const $ = (id) => document.getElementById(id);
  const esc = S.esc;
  const LS = 'squad.apk.';
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (_) {} },
  };
  const cap = window.Capacitor;
  const native = (plugin, m, o) => (cap && cap.nativePromise ? cap.nativePromise(plugin, m, o || {}) : Promise.reject(new Error('no native')));
  const svg = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  const IC = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    library: 'M4 4v16M8 4v16M12 5l5 15M18 4l3 1-1 15',
    sound: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    down: 'm6 9 6 6 6-6',
    heart: 'M12 20s-7-4.4-9.2-8.6C1.2 8.2 3 4.5 6.6 4.5c2.1 0 3.4 1.2 4.4 2.6 1-1.4 2.3-2.6 4.4-2.6 3.6 0 5.4 3.7 3.8 6.9C19 15.6 12 20 12 20z',
    queue: 'M3 6h13M3 12h13M3 18h9M17 15v6l5-3z',
    lyrics: 'M4 5h16M4 10h16M4 15h10M4 20h7',
    timer: 'M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
    speed: 'M12 14l4-4M4 18a9 9 0 1 1 16 0',
    plus: 'M12 5v14M5 12h14',
    play: 'M7 4v16l13-8z',
    wave: 'M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0 2 2 2 2',
    tg: 'M21 4 3 11l6 2 2 6 3-4 5 4z',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
    mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
    close: 'M6 6l12 12M18 6 6 18',
  };

  // ---------- Настройки интерфейса ----------
  const prefs = Object.assign({ bg: 'blur', shape: 'round', spin: false }, ls.get('prefs', {}));
  function applyPrefs() {
    root.dataset.npBg = prefs.bg;
    root.dataset.npShape = prefs.shape;
    root.classList.toggle('np-spin', !!prefs.spin);
  }
  applyPrefs();

  // ---------- Статистика прослушиваний (локально, без ограничений) ----------
  // {t: {key: {n, sec, last, title, artist}}, days: {'2026-10-16': sec}, total,
  //  m: {'2026-10': {t: {key: [n, sec]}, h: [24 × sec], total}}} — помесячно для «Итогов месяца»
  const stats = Object.assign({ t: {}, days: {}, total: 0 }, ls.get('stats', {}));
  let statsDirty = false;
  const p2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); // местная дата, не UTC
  const today = () => ymd(new Date());
  const monthOf = (k) => stats.m[k] || (stats.m[k] = { t: {}, h: new Array(24).fill(0), total: 0 });
  if (!stats.m) {
    // первый запуск с «Итогами»: текущий месяц собираем из того, что уже накоплено
    stats.m = {};
    const mk = today().slice(0, 7);
    const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const M = monthOf(mk);
    Object.keys(stats.t).forEach((k) => { const e = stats.t[k]; if (e.last >= from) M.t[k] = [e.n, e.sec]; });
    Object.keys(stats.days).forEach((d) => { if (d.startsWith(mk)) M.total += stats.days[d]; });
    // время по трекам накоплено за всё время — ужимаем до времени месяца
    const all = Object.values(M.t).reduce((a, x) => a + x[1], 0);
    if (all > M.total && all) Object.values(M.t).forEach((x) => { x[1] = Math.round(x[1] * M.total / all); });
    M.seeded = true;
  }
  let counted = null;
  setInterval(() => {
    const t = S.cur();
    if (!t || !S.playing()) return;
    const e = stats.t[t.key] || (stats.t[t.key] = { n: 0, sec: 0, last: 0 });
    const d = today();
    const M = monthOf(d.slice(0, 7));
    const me = M.t[t.key] || (M.t[t.key] = [0, 0]);
    e.sec += 5; e.last = Date.now(); e.title = t.title; e.artist = t.artist;
    me[1] += 5; M.h[new Date().getHours()] += 5; M.total += 5;
    if (t.genre) e.genre = t.genre;
    if (counted !== t.key && e.sec >= 30) { e.n++; me[0]++; counted = t.key; } // прослушивание засчитываем после 30 с
    stats.days[d] = (stats.days[d] || 0) + 5;
    stats.total += 5;
    statsDirty = true;
  }, 5000);
  setInterval(() => { if (statsDirty) { statsDirty = false; saveStats(); } }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.hidden && statsDirty) { statsDirty = false; saveStats(); } });
  function saveStats() {
    // старые дни и забытые треки не копим бесконечно
    const days = Object.keys(stats.days).sort();
    while (days.length > 400) delete stats.days[days.shift()];
    const months = Object.keys(stats.m).sort();
    while (months.length > 13) delete stats.m[months.shift()];
    const keys = Object.keys(stats.t);
    if (keys.length > 4000) keys.sort((a, b) => stats.t[a].last - stats.t[b].last).slice(0, keys.length - 4000).forEach((k) => delete stats.t[k]);
    ls.set('stats', stats);
  }
  S.on('track', () => { const t = S.cur(); if (t && counted !== t.key) counted = null; });

  const dur = (sec) => {
    const m = Math.round(sec / 60);
    if (sec > 0 && !m) return '<1 мин';
    return m < 60 ? m + ' мин' : Math.floor(m / 60) + ' ч ' + (m % 60) + ' мин';
  };

  // ---------- Любимые (обычный плейлист, виден и в «Плейлистах») ----------
  const LIKED = 'liked';
  function likedList() {
    let pl = S.playlists.find((p) => p.id === LIKED);
    if (!pl) { pl = { id: LIKED, name: 'Любимые', keys: [] }; S.playlists.unshift(pl); }
    return pl;
  }
  const isLiked = (key) => { const pl = S.playlists.find((p) => p.id === LIKED); return !!(pl && pl.keys.includes(key)); };
  const likeHooks = [];
  function toggleLike(key) {
    const pl = likedList();
    const i = pl.keys.indexOf(key);
    if (i >= 0) pl.keys.splice(i, 1); else pl.keys.unshift(key);
    likeHooks.forEach((f) => f(key, i < 0));
    S.savePlaylists();
    S.toast(i >= 0 ? 'Убрано из любимых' : 'Добавлено в любимые');
    syncLike();
    if (S.view.tab === 'playlists') S.renderLib();
  }

  // ---------- Нижняя навигация ----------
  const NAV = [['home', 'Главная'], ['search', 'Поиск'], ['library', 'Медиатека'], ['sound', 'Звук'], ['settings', 'Настройки']];
  const nav = document.createElement('nav');
  nav.className = 'bnav';
  nav.id = 'bnav';
  nav.innerHTML = NAV.map(([id, label]) => '<button data-dest="' + id + '"><span class="bn-ic">' + svg(IC[id]) + '</span><span class="bn-label">' + label + '</span></button>').join('');
  document.querySelector('.app').appendChild(nav);

  // панель «Главная»
  const home = $('panel-home');

  let dest = 'home';
  let lastTab = 'home';
  function go(d) {
    const was = dest;
    dest = d;
    root.classList.toggle('apk-search', d === 'search');
    if (d === 'home') S.showTab('home');
    else if (d === 'search') {
      S.showTab('library');
      if (!['tracks', 'online'].includes(S.view.tab)) S.openLib('tracks');
      setTimeout(() => $('search').focus(), 60);
    } else if (d === 'library') {
      if (was === 'search' && $('search').value) { $('search').value = ''; $('search').dispatchEvent(new Event('input')); }
      if (was === 'search' && S.view.tab === 'online') S.openLib('tracks');
      S.showTab('library');
    } else if (d === 'sound') S.showTab(ls.get('sound', 'eq'));
    else if (d === 'settings') S.showTab('themes');
    S.saveSettings();
    syncNav();
  }
  function destOf(tab) {
    if (tab === 'home') return 'home';
    if (tab === 'library') return root.classList.contains('apk-search') ? 'search' : 'library';
    if (tab === 'eq' || tab === 'fx') return 'sound';
    if (tab === 'themes') return 'settings';
    return dest;
  }
  function syncNav() {
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.dest === dest));
  }
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.dest === dest && dest === 'home') home.scrollTo({ top: 0, behavior: 'smooth' });
    go(b.dataset.dest);
  });

  S.on('tab', () => {
    const tab = S.settings.tab;
    root.classList.toggle('np-open', tab === 'player');
    if (tab === 'player') {
      if (!(history.state && history.state.apkPlayer)) history.pushState({ apkPlayer: 1 }, '');
      return;
    }
    lastTab = tab;
    if (tab === 'eq' || tab === 'fx') ls.set('sound', tab);
    dest = destOf(tab);
    if (dest !== 'search') root.classList.remove('apk-search');
    syncNav();
    if (tab === 'home') renderHome();
  });

  // ---------- Звук: эквалайзер и эффекты одной вкладкой ----------
  ['eq', 'fx'].forEach((p) => {
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.innerHTML = '<button data-p="eq">Эквалайзер</button><button data-p="fx">Эффекты</button>';
    seg.querySelector('[data-p="' + p + '"]').classList.add('on');
    seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.p !== p) S.showTab(b.dataset.p); });
    $('panel-' + p).prepend(seg);
  });

  // ---------- Поиск: медиатека или открытые источники ----------
  const sseg = document.createElement('div');
  sseg.className = 'seg search-seg';
  sseg.innerHTML = '<button data-v="tracks">В медиатеке</button><button data-v="online">Онлайн</button>';
  $('lib-tabs').after(sseg);
  sseg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.openLib(b.dataset.v);
    const q = $('search').value.trim();
    if (b.dataset.v === 'online' && q) S.webSearch(q);
    $('search').focus();
  });
  S.on('library', () => sseg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.view.tab)));
  $('search').addEventListener('focus', () => { $('search').placeholder = S.view.tab === 'online' ? 'Название трека или исполнитель, Enter — найти' : 'Поиск по трекам'; });

  // ---------- Главная ----------
  const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; };
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  function cardArt(t, big) {
    if (t && t.thumb) return '<div class="h-art' + (big ? ' big' : '') + '"><img loading="lazy" decoding="async" alt="" src="' + esc(t.thumb) + '"></div>';
    const h = hue(t ? t.artist + t.title : 'S');
    return '<div class="h-art' + (big ? ' big' : '') + '" style="background:linear-gradient(135deg,hsl(' + h + ',70%,45%),hsl(' + ((h + 50) % 360) + ',80%,30%))">' +
      esc(((t && t.title) || 'S')[0].toUpperCase()) + '</div>';
  }

  const MOODS = [
    ['all', 'Вся музыка'], ['fav', 'Любимое'], ['top', 'Чаще всего'], ['fresh', 'Новое'], ['forgot', 'Давно не слушал'],
  ];
  let mood = ls.get('mood', 'all');
  let wave = false;

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // Подбор «волны»: настроение + немного случайности, недавно звучавшие уходят в конец
  function wavePick() {
    const all = S.tracks;
    const st = (k) => stats.t[k] || { n: 0, sec: 0, last: 0 };
    let pool = all.slice();
    const liked = new Set((S.playlists.find((p) => p.id === LIKED) || { keys: [] }).keys);
    if (mood === 'fav') pool = pool.filter((t) => liked.has(t.key) || st(t.key).n >= 2);
    else if (mood === 'top') pool = pool.filter((t) => st(t.key).n > 0).sort((a, b) => st(b.key).n - st(a.key).n).slice(0, 150);
    else if (mood === 'fresh') pool = pool.filter((t) => !st(t.key).n).slice(-300);
    else if (mood === 'forgot') pool = pool.filter((t) => st(t.key).n && Date.now() - st(t.key).last > 14 * 864e5);
    else if (mood.startsWith('g:')) pool = pool.filter((t) => (t.genre || '') === mood.slice(2));
    if (pool.length < 5) pool = all.slice();
    const hour = Date.now() - 3 * 3600e3;
    const fresh = shuffle(pool.filter((t) => st(t.key).last < hour));
    const recent = shuffle(pool.filter((t) => st(t.key).last >= hour));
    // любимые и часто слушаемые чуть чаще оказываются в начале
    fresh.sort((a, b) => (Math.random() - 0.5) * 3 - ((liked.has(a.key) ? 1 : 0) - (liked.has(b.key) ? 1 : 0)));
    return fresh.concat(recent).map((t) => t.key);
  }
  function startWave() {
    const keys = wavePick();
    if (!keys.length) { S.toast('Сначала добавьте музыку'); return; }
    wave = true;
    S.play(keys, 0, false);
    S.toast('Моя волна: ' + (MOODS.find((m) => m[0] === mood) || [0, mood.slice(2)])[1]);
    renderHome();
  }
  // бесконечная волна: под конец очереди подкладываем новую порцию
  S.on('track', () => {
    if (!wave) return;
    const q = S.queueInfo;
    if (q.len - q.pos <= 2) S.append(wavePick());
  });

  function renderHome() {
    if (S.settings.tab !== 'home') return;
    const tr = S.tracks;
    const byKey = (k) => S.byKey(k);
    const recent = Object.keys(stats.t).sort((a, b) => stats.t[b].last - stats.t[a].last).map(byKey).filter(Boolean).slice(0, 12);
    const top = Object.keys(stats.t).filter((k) => stats.t[k].n).sort((a, b) => stats.t[b].n - stats.t[a].n).map(byKey).filter(Boolean).slice(0, 5);
    const genres = {};
    tr.forEach((t) => { if (t.genre) genres[t.genre] = (genres[t.genre] || 0) + 1; });
    const topGenres = Object.keys(genres).sort((a, b) => genres[b] - genres[a]).slice(0, 4);
    const moods = MOODS.concat(topGenres.map((g) => ['g:' + g, g]));
    const pls = S.playlists;
    const artists = {};
    Object.keys(stats.t).forEach((k) => { const e = stats.t[k]; if (e.artist && byKey(k)) artists[e.artist] = (artists[e.artist] || 0) + e.sec; });
    const topArtist = Object.keys(artists).sort((a, b) => artists[b] - artists[a])[0];
    const week = (() => { let s = 0; for (let i = 0; i < 7; i++) s += stats.days[ymd(new Date(Date.now() - i * 864e5))] || 0; return s; })();
    const plays = Object.values(stats.t).reduce((s, e) => s + e.n, 0);

    let h = '<header class="h-head"><div><div class="h-hello">' + greet() + '</div><div class="h-sub">' +
      (tr.length ? 'В медиатеке ' + tr.length + ' ' + plural(tr.length, 'трек', 'трека', 'треков') : 'Медиатека пока пуста') + '</div></div>' +
      '<button class="icon-btn h-rz" data-h="rz" aria-label="Что играет?">' + svg(IC.mic) + '</button></header>';

    // Моя волна
    h += '<div class="wave' + (wave && S.playing() ? ' live' : '') + '"><i class="b1"></i><i class="b2"></i><i class="b3"></i>' +
      '<div class="wave-in"><div class="wave-t">Моя волна</div><div class="wave-s">Бесконечный поток из вашей музыки под настроение</div></div>' +
      '<button class="wave-play" data-h="wave" aria-label="Запустить волну">' + svg(IC.play) + '</button></div>';
    h += '<div class="h-chips">' + moods.map((m) => '<button class="chip' + (m[0] === mood ? ' on' : '') + '" data-mood="' + esc(m[0]) + '">' + esc(m[1]) + '</button>').join('') + '</div>';

    if (!tr.length) {
      h += '<div class="h-empty"><p>Добавьте музыку, и здесь появятся волна, недавние треки и статистика.</p>' +
        (S.canScan ? '<button class="btn primary" data-h="scan">Найти музыку на телефоне</button>' : '') +
        '<button class="btn" data-h="files">Выбрать файлы</button></div>';
    }

    if (recent.length) {
      h += '<h2 class="h-title">Недавно играли</h2><div class="h-row">' + recent.map((t) =>
        '<button class="h-card" data-play="' + esc(t.key) + '" data-from="recent">' + cardArt(t, true) + '<span class="h-ct">' + esc(t.title) + '</span><span class="h-ca">' + esc(t.artist) + '</span></button>').join('') + '</div>';
    }

    h += '<h2 class="h-title">Плейлисты</h2><div class="h-row">' +
      '<button class="h-card" data-h="liked"><div class="h-art big liked">' + svg(IC.heart) + '</div><span class="h-ct">Любимые</span><span class="h-ca">' +
      ((pls.find((p) => p.id === LIKED) || { keys: [] }).keys.length) + ' ' + plural((pls.find((p) => p.id === LIKED) || { keys: [] }).keys.length, 'трек', 'трека', 'треков') + '</span></button>' +
      pls.filter((p) => p.id !== LIKED).map((p) => {
        const first = p.keys.map(byKey).find((t) => t && t.thumb) || byKey(p.keys[0]);
        return '<button class="h-card" data-pl="' + esc(p.id) + '">' + cardArt(first || { title: p.name, artist: '' }, true) + '<span class="h-ct">' + esc(p.name) + '</span><span class="h-ca">' + p.keys.length + ' ' + plural(p.keys.length, 'трек', 'трека', 'треков') + '</span></button>';
      }).join('') +
      '<button class="h-card" data-h="playlists"><div class="h-art big add">' + svg(IC.plus) + '</div><span class="h-ct">Все плейлисты</span><span class="h-ca">Создать новый</span></button>' +
      '<button class="h-card" data-h="import"><div class="h-art big add">' + svg(IC.down) + '</div><span class="h-ct">Импорт</span><span class="h-ca">Из ссылки или списка</span></button></div>';

    h += '<h2 class="h-title">Источники</h2><div class="h-tiles">' +
      tile('telegram', IC.tg, 'Telegram', 'Музыка из профиля') + tile('online', IC.globe, 'Онлайн', 'Открытые источники') +
      tile('artists', IC.mic, 'Исполнители', '') + tile('folders', IC.folder, 'Папки', '') +
      '<button class="h-tile" data-h="rz">' + svg(IC.wave) + '<span><b>Что играет?</b><small>Узнать песню вокруг</small></span></button></div>';

    if (stats.total) {
      h += '<h2 class="h-title">Статистика</h2>' + wrapCards() + '<div class="h-stats">' +
        stat(dur(stats.days[today()] || 0), 'сегодня') + stat(dur(week), 'за неделю') + stat(dur(stats.total), 'всего') + stat(String(plays), 'прослушиваний') +
        '</div>' + (topArtist ? '<div class="h-top-artist">Чаще всего: <b>' + esc(topArtist) + '</b></div>' : '');
      if (top.length) {
        h += '<ol class="h-top">' + top.map((t, i) => '<li data-play="' + esc(t.key) + '" data-from="top"><b>' + (i + 1) + '</b>' + cardArt(t) +
          '<div class="h-tt"><div>' + esc(t.title) + '</div><span>' + esc(t.artist) + ' · ' + stats.t[t.key].n + ' ' + plural(stats.t[t.key].n, 'раз', 'раза', 'раз') + '</span></div></li>').join('') + '</ol>';
      }
    }
    h += '<p class="h-free">Всё в SQUAD SOUND бесплатно: эквалайзер, эффекты, тексты, статистика и волна.</p>';
    home.innerHTML = h;
    home._recent = recent.map((t) => t.key);
    home._top = top.map((t) => t.key);
  }
  const tile = (lib, ic, t, s) => '<button class="h-tile" data-lib="' + lib + '">' + svg(ic) + '<span><b>' + t + '</b>' + (s ? '<small>' + s + '</small>' : '') + '</span></button>';
  const stat = (v, l) => '<div class="h-stat"><b>' + esc(v) + '</b><span>' + l + '</span></div>';
  function plural(n, a, b, c) { n = Math.abs(n) % 100; const m = n % 10; return n > 10 && n < 20 ? c : m > 1 && m < 5 ? b : m === 1 ? a : c; }

  home.addEventListener('click', (e) => {
    const el = e.target.closest('[data-h],[data-mood],[data-play],[data-pl],[data-lib]');
    if (!el) return;
    if (el.dataset.mood) { mood = el.dataset.mood; ls.set('mood', mood); startWave(); return; }
    if (el.dataset.play) {
      const list = el.dataset.from === 'top' ? home._top : home._recent;
      wave = false;
      S.play(list, list.indexOf(el.dataset.play), false);
      return;
    }
    if (el.dataset.pl) { go('library'); S.openLib('playlists', el.dataset.pl); return; }
    if (el.dataset.lib) { go(el.dataset.lib === 'online' ? 'search' : 'library'); S.openLib(el.dataset.lib); return; }
    const h = el.dataset.h;
    if (h === 'wrap') { openWrap(el.dataset.m); return; }
    if (h === 'import') { openImport(); return; }
    if (h === 'rz') { openRecognize(); return; }
    if (h === 'wave') { if (wave && S.playing()) S.togglePlay(); else startWave(); }
    else if (h === 'liked') { likedList(); S.savePlaylists(); go('library'); S.openLib('playlists', LIKED); }
    else if (h === 'playlists') { go('library'); S.openLib('playlists'); }
    else if (h === 'scan') $('btn-scan').click();
    else if (h === 'files') $('btn-add-files').click();
  });
  let homeT = 0;
  const homeSoon = () => { if (S.settings.tab !== 'home' || homeT) return; homeT = setTimeout(() => { homeT = 0; renderHome(); }, 400); };
  S.on('library', homeSoon);
  S.on('play', () => { const w = home.querySelector('.wave'); if (w) w.classList.toggle('live', wave && S.playing()); });

  // ---------- Плеер на весь экран ----------
  const now = $('panel-player');
  const bg = document.createElement('div');
  bg.className = 'np-bg';
  now.prepend(bg);
  const top = document.createElement('div');
  top.className = 'np-top';
  top.innerHTML = '<button class="icon-btn" data-np="close" aria-label="Свернуть">' + svg(IC.down) + '</button>' +
    '<div class="np-from"><small>Сейчас играет</small><span id="np-from"></span></div>' +
    '<button class="icon-btn" data-np="eq" aria-label="Звук">' + svg(IC.sound) + '</button>';
  bg.after(top);
  const like = document.createElement('button');
  like.className = 'icon-btn np-like';
  like.dataset.np = 'like';
  like.setAttribute('aria-label', 'В любимые');
  like.innerHTML = svg(IC.heart);
  now.querySelector('.meta').append(like);
  const acts = document.createElement('div');
  acts.className = 'np-acts';
  acts.innerHTML = [['queue', 'Очередь'], ['lyrics', 'Текст'], ['timer', 'Таймер'], ['speed', 'Скорость'], ['plus', 'В плейлист']]
    .map(([k, l]) => '<button data-np="' + k + '">' + svg(IC[k]) + '<span>' + l + '</span></button>').join('');
  now.append(acts);

  function syncBg() {
    const img = $('cover-img');
    const src = img && img.getAttribute('src');
    const t = S.cur();
    const ci = $('cover').querySelector('.np-custom');
    const custom = ci && ci.getAttribute('src');
    bg.style.backgroundImage = custom ? 'url("' + custom + '")' : t && t.thumb && src ? 'url("' + src.replace(/"/g, '%22') + '")' : 'none';
  }
  $('cover-img').addEventListener('load', syncBg);
  function syncLike() { const t = S.cur(); like.classList.toggle('on', !!(t && isLiked(t.key))); }
  S.on('track', () => {
    syncBg(); syncLike();
    const t = S.cur();
    $('np-from').textContent = wave ? 'Моя волна' : t ? (t.album || t.folder || 'Медиатека') : '';
    if (lyr.open) loadLyrics();
  });

  function closePlayer() {
    if (S.settings.tab !== 'player') return;
    if (history.state && history.state.apkPlayer) history.back();
    else S.showTab(lastTab);
  }
  window.addEventListener('popstate', () => { if (S.settings.tab === 'player') S.showTab(lastTab); });

  now.addEventListener('click', (e) => {
    const b = e.target.closest('[data-np]');
    if (!b) return;
    const t = S.cur();
    const k = b.dataset.np;
    if (k === 'close') closePlayer();
    else if (k === 'eq') { closePlayer(); setTimeout(() => go('sound'), 0); }
    else if (k === 'like') { if (t) toggleLike(t.key); }
    else if (k === 'queue') { closePlayer(); setTimeout(() => { go('library'); S.openLib('queue'); }, 0); }
    else if (k === 'plus') $('np-playlist').click();
    else if (k === 'lyrics') openLyrics();
    else if (k === 'timer') openTimer();
    else if (k === 'speed') openSpeed();
  });

  // свайп вниз по плееру — свернуть
  let sw = null;
  now.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest('input, .np-acts') || now.scrollTop > 0) { sw = null; return; }
    sw = { y: e.touches[0].clientY, x: e.touches[0].clientX, dy: 0 };
  }, { passive: true });
  now.addEventListener('touchmove', (e) => {
    if (!sw) return;
    sw.dy = e.touches[0].clientY - sw.y;
    if (Math.abs(e.touches[0].clientX - sw.x) > Math.abs(sw.dy) && sw.dy < 30) { sw = null; now.style.transform = ''; return; }
    if (sw.dy > 0) { now.style.transition = 'none'; now.style.transform = 'translateY(' + sw.dy + 'px)'; }
  }, { passive: true });
  now.addEventListener('touchend', () => {
    if (!sw) return;
    const dy = sw.dy; sw = null;
    now.style.transition = '';
    now.style.transform = '';
    if (dy > 120) closePlayer();
  });

  // ---------- Свайпы по трекам: вправо — в очередь, влево — в любимые ----------
  const tl = $('tracklist');
  let ts = null, swallow = false;
  tl.addEventListener('touchstart', (e) => {
    const li = e.target.closest('li.track');
    ts = null;
    if (!li || e.touches.length !== 1 || e.target.closest('.t-handle, .t-more')) return;
    const it = S.item(+li.dataset.idx);
    if (!it || !it.t || !S.byKey(it.t.key)) return;
    ts = { li, key: it.t.key, x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, on: false, q: S.view.tab === 'queue' };
  }, { passive: true });
  tl.addEventListener('touchmove', (e) => {
    if (!ts) return;
    const dx = e.touches[0].clientX - ts.x, dy = e.touches[0].clientY - ts.y;
    if (!ts.on) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { ts = null; return; } // это прокрутка
      if (Math.abs(dx) < 14) return;
      ts.on = true;
      ts.li.classList.add('swiping');
    }
    ts.dx = Math.max(-140, Math.min(ts.q ? 0 : 140, dx));
    ts.li.style.setProperty('--sx', ts.dx + 'px');
    ts.li.classList.toggle('sw-r', ts.dx > 0);
    ts.li.classList.toggle('sw-l', ts.dx < 0);
    ts.li.classList.toggle('sw-go', Math.abs(ts.dx) >= 80);
  }, { passive: true });
  const swEnd = () => {
    if (!ts) return;
    const { li, dx, on, key } = ts;
    ts = null;
    if (!on) return;
    swallow = true; setTimeout(() => { swallow = false; }, 350); // не считать свайп нажатием
    li.classList.remove('swiping', 'sw-go');
    li.style.setProperty('--sx', '0px');
    setTimeout(() => li.classList.remove('sw-r', 'sw-l'), 220);
    if (dx >= 80) S.enqueue(key);
    else if (dx <= -80) toggleLike(key);
  };
  tl.addEventListener('touchend', swEnd);
  tl.addEventListener('touchcancel', swEnd);
  tl.addEventListener('click', (e) => { if (swallow) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  // ---------- Нижние листы ----------
  const sheetWrap = document.createElement('div');
  sheetWrap.className = 'sheet-wrap';
  sheetWrap.innerHTML = '<div class="sheet"><div class="sheet-handle"></div><h3 class="sheet-title"></h3><div class="sheet-body"></div></div>';
  document.body.appendChild(sheetWrap);
  const sheet = sheetWrap.querySelector('.sheet');
  let onSheetClose = null;
  function openSheet(title, html, cls, onClose) {
    if (onSheetClose) { const f = onSheetClose; onSheetClose = null; f(); }
    sheet.className = 'sheet ' + (cls || '');
    sheet.querySelector('.sheet-title').textContent = title;
    // новый узел каждый раз: обработчики кликов прошлых окон не срабатывают в новом и не копятся
    const old = sheet.querySelector('.sheet-body'), body = old.cloneNode(false);
    body.innerHTML = html;
    old.replaceWith(body);
    sheetWrap.classList.remove('closing');
    sheetWrap.classList.add('show');
    onSheetClose = onClose || null;
    return body;
  }
  function closeSheet() {
    if (!sheetWrap.classList.contains('show') || sheetWrap.classList.contains('closing')) return false;
    sheetWrap.classList.add('closing');
    setTimeout(() => sheetWrap.classList.remove('show', 'closing'), 220);
    if (onSheetClose) { const f = onSheetClose; onSheetClose = null; f(); }
    return true;
  }
  sheetWrap.addEventListener('click', (e) => { if (e.target === sheetWrap) closeSheet(); });
  // свайп вниз за ручку/заголовок
  let ss = null;
  sheet.addEventListener('touchstart', (e) => { if (e.target.closest('.sheet-handle, .sheet-title')) ss = { y: e.touches[0].clientY, dy: 0 }; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => { if (ss) { ss.dy = Math.max(0, e.touches[0].clientY - ss.y); sheet.style.transform = 'translateY(' + ss.dy + 'px)'; } }, { passive: true });
  sheet.addEventListener('touchend', () => { if (!ss) return; const dy = ss.dy; ss = null; sheet.style.transform = ''; if (dy > 90) closeSheet(); });

  // Таймер сна — те же кнопки, что во вкладке «Эффекты»
  function openTimer() {
    const body = openSheet('Таймер сна', '<div class="chips sheet-chips"></div><p class="hint"></p>');
    const chips = body.querySelector('.sheet-chips');
    const sync = () => {
      chips.innerHTML = '';
      document.querySelectorAll('#sleep-chips .chip').forEach((c) => {
        const b = c.cloneNode(true);
        b.onclick = () => { c.click(); sync(); };
        chips.appendChild(b);
      });
      body.querySelector('.hint').textContent = $('sleep-hint').textContent || 'Музыка остановится сама через выбранное время.';
    };
    sync();
  }

  // Точная скорость: шаг 0,01, кнопки ±0,05 и готовые значения
  function openSpeed() {
    const r = $('speed');
    const body = openSheet('Скорость', '<div class="spd"><button class="icon-btn" data-d="-0.05">−</button><b class="spd-v"></b><button class="icon-btn" data-d="0.05">+</button></div>' +
      '<input type="range" min="0.5" max="2" step="0.01" class="spd-r"><div class="chips sheet-chips">' +
      [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].map((v) => '<button class="chip" data-v="' + v + '">' + String(v).replace('.', ',') + '×</button>').join('') + '</div>' +
      '<label class="switch"><input type="checkbox" class="spd-vinyl"><span></span>Тон вместе со скоростью (винил)</label>');
    const rr = body.querySelector('.spd-r');
    const vin = body.querySelector('.spd-vinyl');
    const set = (v) => {
      v = Math.min(2, Math.max(0.5, Math.round(v * 100) / 100));
      r.value = v; r.dispatchEvent(new Event('input', { bubbles: true }));
      sync();
    };
    const sync = () => {
      const v = +r.value;
      rr.value = v;
      rr.style.setProperty('--p', ((v - 0.5) / 1.5 * 100) + '%');
      body.querySelector('.spd-v').textContent = v.toFixed(2).replace('.', ',') + '×';
      body.querySelectorAll('[data-v]').forEach((c) => c.classList.toggle('on', Math.abs(+c.dataset.v - v) < 0.001));
      vin.checked = $('vinyl').checked;
    };
    rr.oninput = () => set(+rr.value);
    vin.onchange = () => { $('vinyl').checked = vin.checked; $('vinyl').dispatchEvent(new Event('change', { bubbles: true })); };
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-d],[data-v]');
      if (!b) return;
      set(b.dataset.d ? +r.value + +b.dataset.d : +b.dataset.v);
    });
    sync();
  }

  // ---------- Тексты песен (LRCLIB — открытая база, синхронизация по строкам) ----------
  const lyr = { open: false, key: null, lines: null, plain: '', raf: 0, cur: -1 };
  const lyrCache = new Map();
  function parseLrc(s) {
    const out = [];
    for (const line of String(s || '').split(/\r?\n/)) {
      const tags = [...line.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
      if (!tags.length) continue;
      const text = line.replace(/\[[^\]]*\]/g, '').trim();
      for (const m of tags) out.push({ t: +m[1] * 60 + parseFloat(m[2].replace(':', '.')), text });
    }
    return out.sort((a, b) => a.t - b.t);
  }
  // Источники по очереди: кэш → теги файла → LRCLIB (точное совпадение, потом поиск) → lyrics.ovh.
  // Кэш — IndexedDB (в localStorage тексты всей медиатеки не помещаются). Пустой результат помним 14 дней.
  const LYR_NONE_TTL = 14 * 864e5;
  const cleanTitle = (x) => String(x || '').replace(/\s*[([](?:official|lyric|lyrics|audio|video|hd|hq|clip|клип|prod\.?[^)\]]*|feat\.?[^)\]]*|ft\.?[^)\]]*)[^)\]]*[)\]]/ig, '').replace(/\s+-\s+(?:remaster(?:ed)?|live).*$/i, '').trim();
  const realArtist = (t) => (t.artist && t.artist !== 'Неизвестный исполнитель' ? t.artist : '');
  async function lyrSaved(key) {
    if (lyrCache.has(key)) return lyrCache.get(key);
    let r = await idb.get('lyr:' + key).catch(() => null);
    if (!r) { // перенос старого кэша из localStorage
      const old = ls.get('lyr:' + key, null);
      if (old) { r = old; idb.set('lyr:' + key, old).catch(() => {}); try { localStorage.removeItem(LS + 'lyr:' + key); } catch (_) {} }
    }
    if (r && r.none && Date.now() - (r.at || 0) > LYR_NONE_TTL) r = null;
    if (r) lyrCache.set(key, r);
    return r || null;
  }
  function lyrStore(key, r) {
    lyrCache.set(key, r);
    idb.set('lyr:' + key, r).catch(() => {});
  }
  // «не найдено» (404) — нормальный ответ; прочие ошибки считаем, чтобы не запомнить «нет текста» из-за сбоя сети
  const J = (url, net) => window.SquadOnline.json(url).catch((e) => { if (!/HTTP 4\d\d/.test(String(e && e.message))) net.fail++; return null; });
  async function fromLrclib(t, d, net) {
    const artist = realArtist(t), title = cleanTitle(t.title);
    if (!title) return null;
    const pick = (list) => {
      list = (Array.isArray(list) ? list : [list]).filter((x) => x && (x.syncedLyrics || x.plainLyrics || x.instrumental));
      const score = (x) => (x.syncedLyrics ? 0 : 30) + (d && x.duration ? Math.abs(x.duration - d) : 15) + (x.instrumental ? 100 : 0);
      const best = list.sort((a, b) => score(a) - score(b))[0];
      return best ? { synced: best.syncedLyrics || '', plain: best.plainLyrics || '', instrumental: !!best.instrumental, src: 'LRCLIB' } : null;
    };
    let r = null;
    if (artist && d) r = pick(await J('https://lrclib.net/api/get?artist_name=' + encodeURIComponent(artist) + '&track_name=' + encodeURIComponent(title) + '&duration=' + Math.round(d), net));
    if (!r && artist) r = pick(await J('https://lrclib.net/api/search?track_name=' + encodeURIComponent(title) + '&artist_name=' + encodeURIComponent(artist), net));
    if (!r) r = pick(await J('https://lrclib.net/api/search?q=' + encodeURIComponent((artist + ' ' + title).trim()), net));
    return r;
  }
  async function fromOvh(t, net) {
    const artist = realArtist(t), title = cleanTitle(t.title);
    if (!artist || !title) return null;
    const j = await J('https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title), net);
    const v = j && typeof j.lyrics === 'string' ? j.lyrics.replace(/\r/g, '').replace(/^Paroles de la chanson[^\n]*\n/i, '').trim() : '';
    return v ? { synced: '', plain: v, src: 'lyrics.ovh' } : null;
  }
  // heavy — можно читать файл Android целиком (открыт текст текущего трека); online — разрешены сетевые базы
  async function fetchLyrics(t, opts) {
    const o = Object.assign({ heavy: true, online: true }, opts);
    const saved = await lyrSaved(t.key);
    if (saved) return saved;
    let r = null;
    try { const e = await S.embeddedLyrics(t, o.heavy); if (e) r = Object.assign(e, { src: 'теги файла' }); } catch (_) {}
    if (!r && o.online) {
      if (!window.SquadOnline || !window.SquadOnline.json) throw new Error('Нет сети');
      if (!navigator.onLine) throw new Error('Нет сети');
      const d = (S.cur() === t ? S.time().dur : 0) || t.duration || 0;
      const net = { fail: 0 };
      r = await fromLrclib(t, d, net) || await fromOvh(t, net);
      if (!r && net.fail) throw new Error('Нет сети');
    }
    if (!r && !o.online) return null;
    r = r || { none: true, at: Date.now() };
    lyrStore(t.key, r);
    return r;
  }

  // Фоновая загрузка текстов для всей медиатеки (по одному запросу, без спешки)
  const lyrAuto = { on: ls.get('lyrAuto', true), run: false, done: 0, total: 0, found: 0 };
  async function lyricsPrefetch(force) {
    if (lyrAuto.run || (!lyrAuto.on && !force)) return;
    lyrAuto.run = true;
    try {
      const keys = new Set((await idb.keys().catch(() => [])).map(String));
      const todo = S.tracks.filter((t) => t.title && !keys.has('lyr:' + t.key));
      Object.assign(lyrAuto, { done: 0, total: todo.length, found: 0 });
      lyrUI();
      for (const t of todo) {
        if (!lyrAuto.on && !force) break;
        if (!navigator.onLine) { await new Promise((r) => setTimeout(r, 30000)); if (!navigator.onLine) break; }
        try { const r = await fetchLyrics(t, { heavy: false }); if (r && !r.none) lyrAuto.found++; } catch (_) {}
        lyrAuto.done++;
        if (lyrAuto.done % 5 === 0 || lyrAuto.done === lyrAuto.total) lyrUI();
        await new Promise((r) => setTimeout(r, 400));
      }
    } finally {
      lyrAuto.run = false;
      lyrUI();
    }
  }
  let lyrT = 0;
  const lyrSoon = () => { clearTimeout(lyrT); lyrT = setTimeout(() => lyricsPrefetch(false), 15000); };
  S.on('library', lyrSoon);
  window.addEventListener('online', lyrSoon);
  let lyrUI = () => {};

  let lyrBody = null;
  function openLyrics() {
    lyr.open = true;
    lyrBody = openSheet('Текст', '<div class="lyr"></div>', 'tall lyr-sheet', () => { lyr.open = false; cancelAnimationFrame(lyr.raf); });
    lyrBody.addEventListener('click', (e) => {
      if (e.target.closest('[data-lyr="retry"]')) {
        const t = S.cur();
        if (t) { lyrCache.delete(t.key); idb.del('lyr:' + t.key).catch(() => {}); loadLyrics(); }
        return;
      }
      const l = e.target.closest('[data-t]');
      if (l) S.seek(+l.dataset.t);
    });
    loadLyrics();
  }
  async function loadLyrics() {
    const box = lyrBody && lyrBody.querySelector('.lyr');
    const t = S.cur();
    if (!box) return;
    cancelAnimationFrame(lyr.raf);
    if (!t) { box.innerHTML = '<p class="hint">Ничего не играет</p>'; return; }
    sheet.querySelector('.sheet-title').textContent = t.title;
    lyr.key = t.key; lyr.lines = null; lyr.cur = -1;
    box.innerHTML = '<div class="tg-spin"></div>';
    try {
      const r = await fetchLyrics(t);
      if (lyr.key !== t.key || !lyr.open) return;
      if (r.none) { box.innerHTML = '<p class="hint">Текст для этого трека не нашёлся ни в файле, ни в LRCLIB, ни в lyrics.ovh.</p><button class="chip" data-lyr="retry">Искать снова</button>'; return; }
      if (r.instrumental && !r.synced && !r.plain) { box.innerHTML = '<p class="hint">Это инструментальный трек.</p>'; return; }
      const lines = parseLrc(r.synced);
      if (lines.length) {
        lyr.lines = lines;
        box.innerHTML = lines.map((l, i) => '<p data-i="' + i + '" data-t="' + l.t + '">' + (esc(l.text) || '♪') + '</p>').join('');
        tickLyrics();
      } else {
        box.innerHTML = '<div class="lyr-plain">' + esc(r.plain).replace(/\n/g, '<br>') + '</div>';
      }
      if (r.src) box.insertAdjacentHTML('beforeend', '<p class="lyr-src">Текст: ' + esc(r.src) + '</p>');
    } catch (e) {
      if (lyr.key === t.key) box.innerHTML = '<p class="hint">Не удалось загрузить текст. Проверьте интернет.</p>';
    }
  }
  function tickLyrics() {
    if (!lyr.open || !lyr.lines || !lyrBody) return;
    const now = S.time().cur + 0.25;
    let i = -1;
    for (let k = 0; k < lyr.lines.length && lyr.lines[k].t <= now; k++) i = k;
    if (i !== lyr.cur) {
      const box = lyrBody.querySelector('.lyr');
      const prev = box.querySelector('.on');
      if (prev) prev.classList.remove('on');
      const el = box.querySelector('[data-i="' + i + '"]');
      if (el) {
        el.classList.add('on');
        // scrollIntoView прокрутил бы и саму страницу — крутим только лист
        lyrBody.scrollTo({ top: el.offsetTop - lyrBody.clientHeight / 2 + el.offsetHeight / 2, behavior: lyr.cur < 0 ? 'auto' : 'smooth' });
      }
      lyr.cur = i;
    }
    lyr.raf = requestAnimationFrame(tickLyrics);
  }

  // ---------- Настройки: внешний вид плеера ----------
  const pcard = document.createElement('div');
  pcard.className = 'card';
  const opt = (name, val, label) => '<button class="chip' + (prefs[name] === val ? ' on' : '') + '" data-pref="' + name + '" data-val="' + val + '">' + label + '</button>';
  pcard.innerHTML = '<h3>Плеер</h3>' +
    '<p class="hint">Фон</p><div class="chips">' + opt('bg', 'blur', 'Размытая обложка') + opt('bg', 'grad', 'Градиент под обложку') + opt('bg', 'plain', 'Как тема') + '</div>' +
    '<p class="hint">Форма обложки</p><div class="chips">' + opt('shape', 'round', 'Скруглённая') + opt('shape', 'square', 'Квадрат') + opt('shape', 'circle', 'Круг') + '</div>' +
    '<label class="switch"><input type="checkbox" id="pref-spin"' + (prefs.spin ? ' checked' : '') + '><span></span>Вращать обложку, как пластинку</label>';
  $('panel-themes').prepend(pcard);
  pcard.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pref]');
    if (!b) return;
    prefs[b.dataset.pref] = b.dataset.val;
    pcard.querySelectorAll('[data-pref="' + b.dataset.pref + '"]').forEach((c) => c.classList.toggle('on', c === b));
    ls.set('prefs', prefs); applyPrefs();
  });
  $('pref-spin').addEventListener('change', (e) => { prefs.spin = e.target.checked; ls.set('prefs', prefs); applyPrefs(); });

  // ---------- Свой фон приложения и свои обложки (картинки и GIF, лежат в IndexedDB) ----------
  const idb = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('squad-apk', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('blobs');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = (mode, f) => open().then((db) => new Promise((res, rej) => {
      const t = db.transaction('blobs', mode);
      const r = f(t.objectStore('blobs'));
      t.oncomplete = () => res(r.result);
      t.onerror = () => rej(t.error);
    }));
    return { get: (k) => tx('readonly', (st) => st.get(k)), set: (k, v) => tx('readwrite', (st) => st.put(v, k)), del: (k) => tx('readwrite', (st) => st.delete(k)),
      keys: () => tx('readonly', (st) => st.getAllKeys()) };
  })();
  const MAX_IMG = 30 * 1024 * 1024;
  function pickImage() {
    return new Promise((res) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return res(null);
        if (f.size > MAX_IMG) { S.toast('Файл больше 30 МБ'); return res(null); }
        res(f);
      };
      inp.click();
    });
  }

  // фон приложения
  const appBg = document.createElement('div');
  appBg.className = 'app-bg';
  appBg.innerHTML = '<img alt="">';
  document.body.prepend(appBg);
  let appBgUrl = null;
  function applyAppBg(blob) {
    if (appBgUrl) { URL.revokeObjectURL(appBgUrl); appBgUrl = null; }
    if (blob) { appBgUrl = URL.createObjectURL(blob); appBg.firstChild.src = appBgUrl; } else appBg.firstChild.removeAttribute('src');
    root.classList.toggle('has-bg', !!blob);
    const rm = $('bg-remove'); if (rm) rm.disabled = !blob;
  }
  const bgVars = () => {
    root.style.setProperty('--app-bg-dim', (prefs.bgDim ?? 55) / 100);
    root.style.setProperty('--app-bg-blur', (prefs.bgBlur ?? 0) + 'px');
  };
  bgVars();
  if (prefs.appBg) idb.get('appBg').then((b) => applyAppBg(b || null)).catch(() => {});

  // свои обложки: для трека (cover:<key>) и общая для треков без обложки (cover:*)
  const covers = new Set(ls.get('covers', []));
  const coverUrls = new Map();
  const npCustom = document.createElement('img');
  npCustom.className = 'np-custom';
  npCustom.alt = '';
  $('cover').appendChild(npCustom);
  let customFor = null;
  async function coverUrl(id) {
    if (coverUrls.has(id)) return coverUrls.get(id);
    const b = await idb.get('cover:' + id).catch(() => null);
    const u = b ? URL.createObjectURL(b) : null;
    coverUrls.set(id, u);
    return u;
  }
  function dropCoverUrl(id) { const u = coverUrls.get(id); if (u) URL.revokeObjectURL(u); coverUrls.delete(id); }
  async function syncCustomCover() {
    const t = S.cur();
    const id = t && covers.has(t.key) ? t.key : t && !t.thumb && covers.has('*') ? '*' : null;
    customFor = t ? t.key : null;
    const u = id ? await coverUrl(id) : null;
    if (customFor !== (t ? t.key : null)) return;
    if (u) npCustom.src = u; else npCustom.removeAttribute('src');
    $('cover').classList.toggle('has-custom', !!u);
    syncBg();
  }
  S.on('track', syncCustomCover);
  async function setCover(id, blob) {
    dropCoverUrl(id);
    if (blob) { await idb.set('cover:' + id, blob); covers.add(id); } else { await idb.del('cover:' + id).catch(() => {}); covers.delete(id); }
    ls.set('covers', [...covers]);
    syncCustomCover();
  }
  function openCoverSheet() {
    const t = S.cur();
    const body = openSheet('Своя обложка', '<p class="hint">Картинка или анимированный GIF. Хранится только на этом телефоне.</p><div class="sheet-list">' +
      (t ? '<button data-cv="track">' + svg(IC.plus) + 'Для «' + esc(t.title) + '»</button>' : '') +
      '<button data-cv="all">' + svg(IC.plus) + 'Для всех треков без обложки</button>' +
      (t && covers.has(t.key) ? '<button data-cv="rm-track">' + svg(IC.close) + 'Убрать у этого трека</button>' : '') +
      (covers.has('*') ? '<button data-cv="rm-all">' + svg(IC.close) + 'Убрать общую обложку</button>' : '') + '</div>');
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-cv]');
      if (!b) return;
      const k = b.dataset.cv;
      closeSheet();
      try {
        if (k === 'rm-track') await setCover(t.key, null);
        else if (k === 'rm-all') await setCover('*', null);
        else { const f = await pickImage(); if (f) { await setCover(k === 'all' ? '*' : t.key, f); S.toast('Обложка сохранена'); } }
      } catch (_) { S.toast('Не удалось сохранить картинку'); }
    });
  }
  // долгое нажатие на обложку в плеере
  let lp = 0;
  $('cover').addEventListener('touchstart', () => { clearTimeout(lp); lp = setTimeout(() => { lp = 0; if (navigator.vibrate) navigator.vibrate(15); openCoverSheet(); }, 550); }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => $('cover').addEventListener(ev, () => clearTimeout(lp), { passive: true }));
  $('cover').addEventListener('contextmenu', (e) => { e.preventDefault(); });

  const bcard = document.createElement('div');
  bcard.className = 'card';
  bcard.innerHTML = '<h3>Фон и обложки</h3>' +
    '<p class="hint">Своя картинка или GIF на фоне всего приложения. Бесплатно и без ограничений.</p>' +
    '<div class="chips"><button class="chip" id="bg-pick">Выбрать фон</button><button class="chip" id="bg-remove" disabled>Убрать фон</button></div>' +
    '<p class="hint">Затемнение</p><input type="range" id="bg-dim" min="0" max="90" value="' + (prefs.bgDim ?? 55) + '">' +
    '<p class="hint">Размытие</p><input type="range" id="bg-blur" min="0" max="30" value="' + (prefs.bgBlur ?? 0) + '">' +
    '<p class="hint">Обложки</p><div class="chips"><button class="chip" id="cv-open">Своя обложка трека или GIF</button></div>' +
    '<p class="hint">Совет: долгое нажатие на обложку в плеере тоже открывает выбор.</p>';
  pcard.after(bcard);
  $('bg-pick').addEventListener('click', async () => {
    const f = await pickImage();
    if (!f) return;
    try { await idb.set('appBg', f); prefs.appBg = true; ls.set('prefs', prefs); applyAppBg(f); S.toast('Фон установлен'); } catch (_) { S.toast('Не удалось сохранить картинку'); }
  });
  $('bg-remove').addEventListener('click', () => { idb.del('appBg').catch(() => {}); prefs.appBg = false; ls.set('prefs', prefs); applyAppBg(null); });
  $('bg-dim').addEventListener('input', (e) => { prefs.bgDim = +e.target.value; bgVars(); ls.set('prefs', prefs); });
  $('bg-blur').addEventListener('input', (e) => { prefs.bgBlur = +e.target.value; bgVars(); ls.set('prefs', prefs); });
  $('cv-open').addEventListener('click', openCoverSheet);

  // ---------- Last.fm: скробблинг, «сейчас играет», любимые → «♥» ----------
  // Ключ API и секрет пользователь берёт бесплатно на last.fm/api/account/create; вход — через страницу Last.fm (пароль мы не видим).
  const md5 = (() => {
    const K = new Uint32Array(64);
    const R = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32);
    return (str) => {
      const b = new TextEncoder().encode(str), n = ((b.length + 8) >> 6) + 1, w = new Uint32Array(n * 16);
      for (let i = 0; i < b.length; i++) w[i >> 2] |= b[i] << ((i % 4) * 8);
      w[b.length >> 2] |= 0x80 << ((b.length % 4) * 8);
      w[n * 16 - 2] = b.length * 8;
      let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
      for (let j = 0; j < w.length; j += 16) {
        let A = a0, B = b0, C = c0, D = d0;
        for (let i = 0; i < 64; i++) {
          let F, g;
          if (i < 16) { F = (B & C) | (~B & D); g = i; }
          else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
          else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
          else { F = C ^ (B | ~D); g = (7 * i) % 16; }
          const r = R[(i >> 4) * 4 + (i % 4)];
          const x = (A + F + K[i] + w[j + g]) >>> 0;
          A = D; D = C; C = B;
          B = (B + ((x << r) | (x >>> (32 - r)))) >>> 0;
        }
        a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
      }
      return [a0, b0, c0, d0].map((v) => [0, 8, 16, 24].map((k) => ((v >>> k) & 255).toString(16).padStart(2, '0')).join('')).join('');
    };
  })();
  const LFM = 'https://ws.audioscrobbler.com/2.0/';
  const lfm = Object.assign({ key: '', secret: '', sk: '', user: '', love: true }, ls.get('lfm', {}));
  const lfmQ = ls.get('lfmq', []);
  const lfmSave = () => ls.set('lfm', lfm);
  async function lfmCall(params, signed) {
    const p = Object.assign({ api_key: lfm.key }, params);
    if (signed) p.api_sig = md5(Object.keys(p).sort().map((k) => k + p[k]).join('') + lfm.secret);
    p.format = 'json';
    const body = Object.keys(p).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(p[k])).join('&');
    let text;
    if (S.isAndroid && cap && cap.nativePromise) text = (await native('SquadMedia', 'post', { url: LFM, body })).body;
    else text = await (await fetch(LFM, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })).text();
    const j = JSON.parse(text || '{}');
    if (j.error) { const e = new Error(j.message || 'Last.fm ' + j.error); e.code = j.error; throw e; }
    return j;
  }
  const lfmOk = () => !!(lfm.key && lfm.secret && lfm.sk);
  const lfmTrack = (t) => t && t.artist && t.artist !== 'Неизвестный исполнитель' && t.title ? t : null;
  let lfmFlushing = false;
  async function lfmFlush() {
    if (!lfmOk() || lfmFlushing || !lfmQ.length || !navigator.onLine) return;
    lfmFlushing = true;
    try {
      while (lfmQ.length) {
        const batch = lfmQ.slice(0, 50), p = { method: 'track.scrobble', sk: lfm.sk };
        batch.forEach((x, i) => {
          p['artist[' + i + ']'] = x.artist; p['track[' + i + ']'] = x.track; p['timestamp[' + i + ']'] = x.ts;
          if (x.album) p['album[' + i + ']'] = x.album;
          if (x.dur) p['duration[' + i + ']'] = x.dur;
        });
        await lfmCall(p, true);
        lfmQ.splice(0, batch.length);
        ls.set('lfmq', lfmQ);
        lfm.count = (lfm.count || 0) + batch.length; lfmSave(); lfmUI();
      }
    } catch (e) {
      if (e.code === 9) { lfm.sk = ''; lfmSave(); lfmUI(); S.toast('Last.fm: войдите заново'); } // сессия отозвана
    } finally { lfmFlushing = false; }
  }
  // правило Last.fm: трек длиннее 30 с, прослушан наполовину или 4 минуты
  const play = { key: null, ts: 0, sec: 0, done: false, np: false };
  function lfmNow() {
    const x = lfmTrack(S.cur());
    if (play.np || !lfmOk() || !x || !S.playing()) return;
    play.np = true;
    lfmCall({ method: 'track.updateNowPlaying', sk: lfm.sk, artist: x.artist, track: x.title, album: x.album || '' }, true).catch(() => {});
  }
  S.on('track', () => {
    const t = S.cur();
    if (!t || t.key === play.key) return;
    Object.assign(play, { key: t.key, ts: Math.floor(Date.now() / 1000), sec: 0, done: false, np: false });
    lfmNow();
  });
  S.on('play', lfmNow);
  setInterval(() => {
    const t = S.cur();
    if (!t || t.key !== play.key || !S.playing() || play.done) return;
    play.sec += 2;
    const d = S.time().dur;
    if (!(d > 30) || play.sec < Math.min(d / 2, 240)) return;
    play.done = true;
    const x = lfmTrack(t);
    if (!x || !lfmOk()) return;
    lfmQ.push({ artist: x.artist, track: x.title, album: x.album || '', ts: play.ts, dur: Math.round(d) });
    if (lfmQ.length > 1000) lfmQ.splice(0, lfmQ.length - 1000);
    ls.set('lfmq', lfmQ);
    lfmFlush();
  }, 2000);
  window.addEventListener('online', lfmFlush);
  likeHooks.push((key, loved) => {
    const x = lfmTrack(S.byKey(key));
    if (lfmOk() && lfm.love && x) lfmCall({ method: loved ? 'track.love' : 'track.unlove', sk: lfm.sk, artist: x.artist, track: x.title }, true).catch(() => {});
  });

  let lfmToken = '';
  async function lfmLogin() {
    lfm.key = $('lfm-key').value.trim(); lfm.secret = $('lfm-secret').value.trim(); lfmSave();
    if (!/^[0-9a-f]{32}$/i.test(lfm.key) || !/^[0-9a-f]{32}$/i.test(lfm.secret)) { S.toast('Ключ и секрет — по 32 символа из last.fm/api'); return; }
    try {
      lfmToken = (await lfmCall({ method: 'auth.getToken' }, true)).token;
      openExt('https://www.last.fm/api/auth/?api_key=' + lfm.key + '&token=' + lfmToken);
      lfmUI('Разрешите доступ на странице Last.fm и вернитесь в приложение');
    } catch (e) { S.toast('Last.fm: ' + e.message); }
  }
  async function lfmSession() {
    if (!lfmToken) return;
    try {
      const r = await lfmCall({ method: 'auth.getSession', token: lfmToken }, true);
      lfmToken = '';
      lfm.sk = r.session.key; lfm.user = r.session.name; lfmSave(); lfmUI();
      S.toast('Last.fm: вы вошли как ' + lfm.user);
      lfmFlush();
    } catch (e) { if (e.code !== 14) { lfmToken = ''; lfmUI(); S.toast('Last.fm: ' + e.message); } } // 14 — ещё не разрешили
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lfmSession(); lfmFlush(); } });
  const openExt = (url) => native('SquadUpdater', 'openUrl', { url }).catch(() => window.open(url, '_blank', 'noopener'));

  const lcard = document.createElement('div');
  lcard.className = 'card';
  bcard.after(lcard);
  function lfmUI(msg) {
    if (lfmOk()) {
      lcard.innerHTML = '<h3>Last.fm</h3><p class="hint">Скробблинг включён: <b>' + esc(lfm.user) + '</b>' +
        (lfm.count ? ' · отправлено ' + lfm.count : '') + (lfmQ.length ? ' · в очереди ' + lfmQ.length : '') + '</p>' +
        '<label class="switch"><input type="checkbox" id="lfm-love"' + (lfm.love ? ' checked' : '') + '><span></span>Отмечать «Любимые» сердечком на Last.fm</label>' +
        '<div class="chips"><button class="chip" id="lfm-out">Выйти</button></div>';
      return;
    }
    lcard.innerHTML = '<h3>Last.fm</h3><p class="hint">Отправляйте прослушанное в свой профиль Last.fm. Нужен бесплатный ключ API: создайте приложение на last.fm и вставьте сюда «API key» и «Shared secret».</p>' +
      '<input class="search lfm-in" id="lfm-key" placeholder="API key" autocomplete="off" spellcheck="false" value="' + esc(lfm.key) + '">' +
      '<input class="search lfm-in" id="lfm-secret" placeholder="Shared secret" autocomplete="off" spellcheck="false" value="' + esc(lfm.secret) + '">' +
      (msg ? '<p class="hint">' + esc(msg) + '</p>' : '') +
      '<div class="chips"><button class="chip" id="lfm-get">Получить ключ</button><button class="chip" id="lfm-in">Войти через Last.fm</button>' +
      (lfmToken ? '<button class="chip" id="lfm-done">Я разрешил</button>' : '') + '</div>';
  }
  lcard.addEventListener('click', (e) => {
    const id = e.target.id;
    if (id === 'lfm-get') openExt('https://www.last.fm/api/account/create');
    else if (id === 'lfm-in') lfmLogin();
    else if (id === 'lfm-done') lfmSession();
    else if (id === 'lfm-out') { lfm.sk = ''; lfm.user = ''; lfmSave(); lfmUI(); }
  });
  lcard.addEventListener('change', (e) => { if (e.target.id === 'lfm-love') { lfm.love = e.target.checked; lfmSave(); } });
  lfmUI();
  setTimeout(lfmFlush, 5000);

  // ---------- Фоновое воспроизведение: уведомление, экран блокировки, наушники ----------
  if (S.isAndroid && cap && cap.nativePromise) {
    const media = (o) => native('SquadMedia', 'update', o).catch(() => {});
    let artFor = null, started = false;
    const state = () => { const tm = S.time(); return { playing: S.playing(), position: tm.cur, duration: isFinite(tm.dur) ? tm.dur : 0, speed: S.rate() }; };
    // обложка для уведомления: 256px jpeg (внешние картинки без CORS пропускаем)
    const artOf = (src) => new Promise((res) => {
      if (!src) return res('');
      const img = new Image();
      if (!/^(data|blob):/.test(src)) img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 256;
          const k = Math.max(256 / img.naturalWidth, 256 / img.naturalHeight);
          const w = img.naturalWidth * k, h = img.naturalHeight * k;
          c.getContext('2d').drawImage(img, (256 - w) / 2, (256 - h) / 2, w, h);
          res(c.toDataURL('image/jpeg', 0.85));
        } catch (_) { res(''); }
      };
      img.onerror = () => res('');
      img.src = src;
    });
    const sendTrack = () => {
      const t = S.cur();
      if (!t) return;
      const key = t.key;
      media(Object.assign({ title: t.title, artist: t.artist || '' }, state()));
      if (artFor === key) return;
      artFor = key;
      artOf(t.thumb).then((art) => { if (artFor === key) media({ art }); });
    };
    S.on('track', sendTrack);
    S.on('play', () => {
      if (!started && !S.playing()) return; // не показываем уведомление, пока ничего не включали
      if (!started) { started = true; sendTrack(); } else media(state());
    });
    for (const ev of ['seeked', 'ratechange', 'durationchange']) {
      document.addEventListener(ev, (e) => { if (started && e.target && e.target.tagName === 'AUDIO' && S.playing()) media(state()); }, true);
    }
    window.addEventListener('squadMedia', (e) => {
      const a = e.action;
      if (a === 'play') { if (!S.playing()) S.togglePlay(); }
      else if (a === 'pause') { if (S.playing()) S.pause(); }
      else if (a === 'next') S.step(1);
      else if (a === 'prev') S.step(-1);
      else if (a === 'seek' && e.pos >= 0) S.seek(e.pos);
      else if (a === 'noisy') { if (S.playing()) S.pause(); }
      else if (a === 'route') reopenOutput();
    });
    // Новый выход звука (наушники): перезапускаем вывод Web Audio, чтобы он открылся с параметрами нового устройства
    let routeT = 0;
    function reopenOutput() {
      clearTimeout(routeT);
      routeT = setTimeout(() => {
        const c = window.squadEngine && window.squadEngine.ctx;
        if (!c || c.state !== 'running') return;
        c.suspend().then(() => setTimeout(() => c.resume().catch(() => {}), 150)).catch(() => {});
      }, 400);
    }
  }

  // ---------- Итоги месяца (истории в духе Wrapped, из локальной статистики) ----------
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const monthName = (k) => MONTHS[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4);
  const cap1 = (x) => x[0].toUpperCase() + x.slice(1);
  function wrapCards() {
    const keys = Object.keys(stats.m).filter((k) => stats.m[k].total >= 60).sort().reverse().slice(0, 2);
    return keys.map((k, i) => '<button class="h-wrap" data-h="wrap" data-m="' + k + '"><span class="h-wrap-ic">' + svg(IC.sparkle) + '</span>' +
      '<span><b>Итоги: ' + monthName(k) + '</b><small>' + (i === 0 && k === today().slice(0, 7) ? 'Месяц ещё идёт · ' : '') + dur(stats.m[k].total) + ' музыки</small></span></button>').join('');
  }
  // серии дней подряд: текущая (до сегодня/вчера) и лучшая за месяц
  function streaks(mk) {
    const days = new Set(Object.keys(stats.days).filter((d) => stats.days[d] >= 60));
    let cur = 0;
    for (let i = days.has(today()) ? 0 : 1; days.has(ymd(new Date(Date.now() - i * 864e5))); i++) cur++;
    let best = 0, run = 0;
    const y = +mk.slice(0, 4), m = +mk.slice(5, 7) - 1, n = new Date(y, m + 1, 0).getDate();
    let active = 0;
    for (let d = 1; d <= n; d++) {
      if (days.has(ymd(new Date(y, m, d)))) { run++; active++; best = Math.max(best, run); } else run = 0;
    }
    return { cur, best, active };
  }
  function wrapData(mk) {
    const M = stats.m[mk];
    const tr = Object.keys(M.t).map((k) => {
      const e = stats.t[k] || {}, t = S.byKey(k);
      return { key: k, n: M.t[k][0], sec: M.t[k][1], title: (t && t.title) || e.title || '—', artist: (t && t.artist) || e.artist || '', thumb: t && t.thumb, genre: (t && t.genre) || e.genre, t };
    }).filter((x) => x.sec > 0).sort((a, b) => b.n - a.n || b.sec - a.sec);
    const sum = (field) => { const o = {}; tr.forEach((x) => { const v = x[field]; if (v) o[v] = (o[v] || 0) + x.sec; }); return Object.keys(o).sort((a, b) => o[b] - o[a]).map((k) => ({ name: k, sec: o[k] })); };
    const hsum = M.h.reduce((a, b) => a + b, 0);
    let peak = -1;
    if (hsum >= 300) peak = M.h.indexOf(Math.max(...M.h));
    return { mk, M, tr, artists: sum('artist'), genres: sum('genre'), peak, st: streaks(mk), plays: tr.reduce((a, x) => a + x.n, 0) };
  }
  const persona = (h) => h < 5 ? ['Ночной охотник', 'Самая музыка у тебя после полуночи'] : h < 11 ? ['Ранняя пташка', 'Утро начинается с трека'] :
    h < 17 ? ['Дневной слушатель', 'Музыка фоном весь день'] : ['Вечерний вайб', 'Главное звучит после работы и учёбы'];
  const wArt = (x) => x.thumb ? '<img class="w-cover" alt="" src="' + esc(x.thumb) + '">' :
    '<div class="w-cover" style="background:linear-gradient(135deg,hsl(' + hue(x.artist + x.title) + ',70%,45%),hsl(' + ((hue(x.artist + x.title) + 50) % 360) + ',80%,30%))">' + esc((x.title[0] || 'S').toUpperCase()) + '</div>';
  function wrapSlides(D) {
    const name = MONTHS[+D.mk.slice(5, 7) - 1];
    const min = Math.round(D.M.total / 60);
    const sl = [];
    sl.push('<div class="w-kick">SQUAD SOUND · итоги</div><div class="w-huge">' + cap1(name) + '</div><div class="w-sub">' + D.mk.slice(0, 4) +
      '</div><p class="w-p">Посмотрим, как звучал твой месяц.</p>');
    sl.push('<div class="w-kick">Ты слушал музыку</div><div class="w-huge">' + min.toLocaleString('ru') + '</div><div class="w-sub">' + plural(min, 'минуту', 'минуты', 'минут') + '</div>' +
      '<p class="w-p">' + D.plays + ' ' + plural(D.plays, 'прослушивание', 'прослушивания', 'прослушиваний') + ' · ' + D.tr.length + ' ' + plural(D.tr.length, 'трек', 'трека', 'треков') +
      (D.st.active ? ' · ' + D.st.active + ' ' + plural(D.st.active, 'день', 'дня', 'дней') + ' с музыкой' : '') + '</p>');
    if (D.tr[0]) {
      const x = D.tr[0];
      sl.push('<div class="w-kick">Трек месяца</div>' + wArt(x) + '<div class="w-big">' + esc(x.title) + '</div><div class="w-sub">' + esc(x.artist) + '</div>' +
        '<p class="w-p">' + x.n + ' ' + plural(x.n, 'раз', 'раза', 'раз') + ' · ' + dur(x.sec) + '</p>');
    }
    if (D.artists.length) {
      sl.push('<div class="w-kick">Твои исполнители</div><ol class="w-list">' + D.artists.slice(0, 5).map((a, i) =>
        '<li><b>' + (i + 1) + '</b><span>' + esc(a.name) + '</span><small>' + dur(a.sec) + '</small></li>').join('') + '</ol>');
    }
    if (D.tr.length > 1) {
      sl.push('<div class="w-kick">Топ треков</div><ol class="w-list">' + D.tr.slice(0, 5).map((x, i) =>
        '<li><b>' + (i + 1) + '</b><span>' + esc(x.title) + '<em>' + esc(x.artist) + '</em></span><small>' + x.n + '×</small></li>').join('') + '</ol>');
    }
    if (D.genres.length) sl.push('<div class="w-kick">Жанр месяца</div><div class="w-big">' + esc(D.genres[0].name) + '</div><p class="w-p">' + dur(D.genres[0].sec) + '</p>');
    if (D.peak >= 0) {
      const [t, d] = persona(D.peak);
      const mx = Math.max(...D.M.h) || 1;
      sl.push('<div class="w-kick">Твоё время</div><div class="w-big">' + t + '</div><div class="w-hours">' +
        D.M.h.map((v, i) => '<i style="height:' + Math.max(3, Math.round(v / mx * 100)) + '%"' + (i === D.peak ? ' class="on"' : '') + '></i>').join('') +
        '</div><div class="w-hl"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div><p class="w-p">' + d + '. Пик — ' + p2(D.peak) + ':00–' + p2((D.peak + 1) % 24) + ':00.</p>');
    }
    if (D.st.best > 1 || D.st.cur > 1) {
      sl.push('<div class="w-kick">Серия</div><div class="w-huge">' + D.st.best + '</div><div class="w-sub">' + plural(D.st.best, 'день', 'дня', 'дней') + ' подряд с музыкой</div>' +
        '<p class="w-p">' + (D.st.cur > 1 ? 'Сейчас серия ' + D.st.cur + ' ' + plural(D.st.cur, 'день', 'дня', 'дней') + '. Не прерывай!' : 'Лучшая серия за месяц.') + '</p>');
    }
    sl.push('<div class="w-kick">' + cap1(name) + ' в цифрах</div><div class="w-sum">' +
      '<div><b>' + min.toLocaleString('ru') + '</b><span>минут</span></div><div><b>' + D.tr.length + '</b><span>треков</span></div>' +
      '<div><b>' + D.st.best + '</b><span>дней подряд</span></div><div><b>' + D.plays + '</b><span>прослушиваний</span></div></div>' +
      (D.tr[0] ? '<p class="w-p">Трек месяца: <b>' + esc(D.tr[0].title) + '</b>' + (D.artists[0] ? '<br>Исполнитель: <b>' + esc(D.artists[0].name) + '</b>' : '') + '</p>' : '') +
      '<div class="w-acts">' + (D.tr.some((x) => x.t) ? '<button class="btn" data-w="play">' + svg(IC.play) + ' Включить топ месяца</button><button class="btn ghost" data-w="save">Сохранить плейлистом</button>' : '') + '</div>');
    return sl;
  }
  const wrap = document.createElement('div');
  wrap.className = 'wrap-ov';
  wrap.innerHTML = '<div class="w-bars"></div><button class="w-x" aria-label="Закрыть">' + svg(IC.close) + '</button><div class="w-slide"></div>';
  document.body.appendChild(wrap);
  const W = { i: 0, sl: [], D: null, timer: 0 };
  function wShow(i) {
    if (i < 0) i = 0;
    if (i >= W.sl.length) { closeWrap(); return; }
    W.i = i;
    const slide = wrap.querySelector('.w-slide');
    slide.innerHTML = '<div class="w-in">' + W.sl[i] + '</div>';
    wrap.style.setProperty('--wh', (hue(W.D.mk) + i * 37) % 360);
    wrap.querySelectorAll('.w-bars i').forEach((b, k) => { b.className = k < i ? 'done' : k === i ? 'run' : ''; });
    clearTimeout(W.timer);
    if (i < W.sl.length - 1) W.timer = setTimeout(() => wShow(W.i + 1), 7000);
  }
  function openWrap(mk) {
    if (!stats.m[mk]) return;
    W.D = wrapData(mk);
    W.sl = wrapSlides(W.D);
    wrap.querySelector('.w-bars').innerHTML = W.sl.map(() => '<i></i>').join('');
    wrap.classList.add('show');
    root.classList.add('wrap-open');
    wShow(0);
  }
  function closeWrap() {
    if (!wrap.classList.contains('show')) return false;
    clearTimeout(W.timer);
    wrap.classList.remove('show');
    root.classList.remove('wrap-open');
    return true;
  }
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.w-x')) { closeWrap(); return; }
    const b = e.target.closest('[data-w]');
    if (b) {
      const keys = W.D.tr.filter((x) => x.t).slice(0, 25).map((x) => x.key);
      if (b.dataset.w === 'play') { closeWrap(); wave = false; S.play(keys, 0, false); }
      else {
        const name = 'Итоги: ' + monthName(W.D.mk);
        let pl = S.playlists.find((p) => p.name === name);
        if (!pl) { pl = { id: 'w' + Date.now().toString(36), name, keys: [] }; S.playlists.push(pl); }
        pl.keys = keys; S.savePlaylists(); S.toast('Плейлист «' + name + '» сохранён');
      }
      return;
    }
    wShow(W.i + (e.clientX < innerWidth * 0.3 ? -1 : 1));
  });

  // ---------- Свои пресеты звука и резервная копия настроек (файл) ----------
  const presets = ls.get('presets', []); // [{name, s: состояние движка}]
  const pcardS = document.createElement('div');
  pcardS.className = 'card';
  $('panel-eq').prepend(pcardS);
  function presetsUI() {
    pcardS.innerHTML = '<h3>Мои пресеты</h3><p class="hint">Эквалайзер и эффекты целиком. Без ограничений по количеству.</p>' +
      (presets.length ? '<div class="chips">' + presets.map((x, i) => '<span class="chip pr-chip" data-pr="' + i + '">' + esc(x.name) +
        '<button class="pr-x" data-prx="' + i + '" aria-label="Удалить">×</button></span>').join('') + '</div>' : '') +
      '<div class="chips"><button class="chip" id="pr-save">' + svg(IC.plus) + ' Сохранить текущий звук</button>' +
      (presets.length ? '<button class="chip" id="pr-export">Экспорт в файл</button>' : '') + '<button class="chip" id="pr-import">Импорт из файла</button></div>';
  }
  presetsUI();
  pcardS.addEventListener('click', (e) => {
    const x = e.target.closest('[data-prx]');
    if (x) {
      const i = +x.dataset.prx;
      if (confirm('Удалить пресет «' + presets[i].name + '»?')) { presets.splice(i, 1); ls.set('presets', presets); presetsUI(); }
      return;
    }
    const c = e.target.closest('[data-pr]');
    if (c) { const p = presets[+c.dataset.pr]; S.setSound(p.s); S.toast('Пресет: ' + p.name); return; }
    const id = e.target.closest('button') && e.target.closest('button').id;
    if (id === 'pr-save') {
      const name = (prompt('Название пресета', 'Мой звук ' + (presets.length + 1)) || '').trim().slice(0, 40);
      if (!name) return;
      const st = S.sound(); delete st.volume;
      const i = presets.findIndex((p) => p.name === name);
      if (i >= 0) presets[i].s = st; else presets.push({ name, s: st });
      ls.set('presets', presets); presetsUI(); S.toast('Пресет «' + name + '» сохранён');
    } else if (id === 'pr-export') saveFile('squad-presets.json', { type: 'presets', presets });
    else if (id === 'pr-import') importFile();
  });

  // что уходит в резервную копию: настройки, звук, плейлисты, статистика, вид; без сессий Telegram/Last.fm и кэшей
  const BACKUP_KEYS = ['squad.settings', 'squad.fx', 'squad.playlists', 'squad.web.tracks', 'squad.apk.prefs', 'squad.apk.stats', 'squad.apk.presets', 'squad.apk.mood'];
  async function saveFile(name, payload) {
    const text = JSON.stringify(Object.assign({ app: 'SQUAD SOUND', v: 1, date: new Date().toISOString() }, payload), null, 1);
    try {
      if (S.isAndroid && cap && cap.nativePromise) {
        const r = await native('SquadMedia', 'saveText', { name, text, mime: 'application/json' });
        if (r && r.saved) S.toast('Файл сохранён');
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    } catch (e) { S.toast('Не удалось сохранить файл'); }
  }
  function importFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json,text/plain';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      let j;
      try { j = JSON.parse(await f.text()); } catch (_) { S.toast('Это не файл SQUAD SOUND'); return; }
      if (!j || j.app !== 'SQUAD SOUND') { S.toast('Это не файл SQUAD SOUND'); return; }
      if (j.type === 'presets' && Array.isArray(j.presets)) {
        let n = 0;
        j.presets.forEach((p) => {
          if (!p || typeof p.name !== 'string' || !p.s || typeof p.s !== 'object') return;
          const name = p.name.slice(0, 40), i = presets.findIndex((x) => x.name === name);
          if (i >= 0) presets[i].s = p.s; else presets.push({ name, s: p.s });
          n++;
        });
        ls.set('presets', presets); presetsUI();
        S.toast('Пресетов добавлено: ' + n);
      } else if (j.type === 'backup' && j.data && typeof j.data === 'object') {
        if (!confirm('Заменить настройки, плейлисты и статистику данными из файла? Приложение перезапустится.')) return;
        BACKUP_KEYS.forEach((k) => { if (typeof j.data[k] === 'string') try { localStorage.setItem(k, j.data[k]); } catch (_) {} });
        location.reload();
      } else S.toast('Файл не распознан');
    };
    inp.click();
  }
  const kcard = document.createElement('div');
  kcard.className = 'card';
  kcard.innerHTML = '<h3>Резервная копия</h3><p class="hint">Настройки, эквалайзер и пресеты, плейлисты, статистика и вид — одним файлом. Удобно перенести на другой телефон. Входы в Telegram и Last.fm в файл не попадают.</p>' +
    '<div class="chips"><button class="chip" id="bk-save">Сохранить в файл</button><button class="chip" id="bk-load">Восстановить из файла</button></div>';
  lcard.after(kcard);
  $('bk-save').addEventListener('click', () => {
    const data = {};
    BACKUP_KEYS.forEach((k) => { try { const v = localStorage.getItem(k); if (v != null) data[k] = v; } catch (_) {} });
    saveFile('squad-sound-' + today() + '.json', { type: 'backup', data });
  });
  $('bk-load').addEventListener('click', importFile);

  // Тексты песен: фоновая загрузка для всей медиатеки
  const ycard = document.createElement('div');
  ycard.className = 'card';
  kcard.before(ycard);
  lyrUI = () => {
    ycard.innerHTML = '<h3>Тексты песен</h3><p class="hint">Ищем в тегах файла, в LRCLIB (с синхронизацией по строкам) и в lyrics.ovh. ' +
      'Найденные тексты сохраняются на телефоне и открываются без интернета.</p>' +
      '<label class="switch"><input type="checkbox" id="lyr-auto"' + (lyrAuto.on ? ' checked' : '') + '><span></span>Скачивать тексты для всей медиатеки сами</label>' +
      (lyrAuto.run ? '<p class="hint">Скачиваю: ' + lyrAuto.done + ' из ' + lyrAuto.total + ', найдено ' + lyrAuto.found + '</p>'
        : lyrAuto.total ? '<p class="hint">Готово: проверено ' + lyrAuto.done + ', найдено ' + lyrAuto.found + '</p>' : '') +
      '<div class="chips"><button class="chip" id="lyr-now"' + (lyrAuto.run ? ' disabled' : '') + '>Скачать сейчас</button></div>';
  };
  lyrUI();
  ycard.addEventListener('change', (e) => { if (e.target.id === 'lyr-auto') { lyrAuto.on = e.target.checked; ls.set('lyrAuto', lyrAuto.on); if (lyrAuto.on) lyricsPrefetch(false); } });
  ycard.addEventListener('click', (e) => { if (e.target.id === 'lyr-now') lyricsPrefetch(true); });

  // ---------- Импорт плейлиста: список, файл или ссылка → треки из своей медиатеки и Telegram ----------
  // Музыку ниоткуда не качаем: сопоставляем названия с тем, что уже есть. Ненайденное помним и досопоставляем,
  // когда медиатека пополнится (pl.missing).
  const nrm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|wma)$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  // без «(Remastered)», «[Live]», «feat. …» — в разных сервисах их пишут по-разному
  const core = (s) => nrm(String(s || '').replace(/\s*[([{][^)\]}]*[)\]}]/g, ' ').replace(/\s+(feat|ft|prod)\.?\s.*$/i, ''));
  const words = (s) => nrm(s).split(' ').filter((w) => w.length > 1);
  function splitLine(s) {
    s = String(s || '').replace(/^\s*\d{1,4}[.)]\s+/, '').replace(/\s*[([]?\d{1,2}:\d{2}(:\d{2})?[)\]]?\s*$/, '').trim();
    const m = s.match(/^(.+?)\s+[-–—]\s+(.+)$/) || s.match(/^(.+?)\s*[–—]\s*(.+)$/);
    return m ? { a: m[1].trim(), t: m[2].trim() } : { a: '', t: s };
  }
  let mIdx = null, mIdxN = -1;
  function matchIndex() {
    const tr = S.tracks;
    if (mIdx && mIdxN === tr.length) return mIdx;
    mIdx = new Map(); mIdxN = tr.length;
    const add = (k, t) => { if (!k) return; let l = mIdx.get(k); if (!l) mIdx.set(k, l = []); if (!l.includes(t)) l.push(t); };
    tr.forEach((t) => {
      add(core(t.title), t);
      const f = splitLine(String(t.name || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/_/g, ' '));
      if (f.a) { add(core(f.t), t); add(core(f.a), t); } // имя файла «Исполнитель - Название» (или наоборот)
    });
    return mIdx;
  }
  // {a, t} → трек из медиатеки или null. Порядок «исполнитель — название» в списках бывает обратным — пробуем оба.
  function findTrack(q) {
    const idx = matchIndex();
    let best = null, bestS = 0;
    const tryPair = (a, t) => {
      const list = idx.get(core(t));
      if (!list) return;
      const aw = words(core(a));
      list.forEach((tr) => {
        const have = new Set(words(tr.artist + ' ' + tr.name));
        const hit = aw.filter((w) => have.has(w)).length;
        let s = aw.length ? (hit ? 2 + hit / aw.length : 0) : (list.length === 1 ? 1.5 : 0);
        if (s && core(tr.title) === core(t)) s += 0.5;
        if (s > bestS) { bestS = s; best = tr; }
      });
    };
    tryPair(q.a, q.t);
    if (q.a) tryPair(q.t, q.a);
    return best;
  }
  function parseList(text) {
    text = String(text || '').replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    // CSV (Exportify и похожие): ищем колонки названия и исполнителя
    const csv = (l) => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',' || c === ';') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
    const head = csv(lines[0]).map((h) => h.toLowerCase());
    const ti = head.findIndex((h) => /^(track name|track|title|name|название|трек)$/.test(h.trim()));
    const ai = head.findIndex((h) => /^(artist name\(s\)|artist name|artists?|исполнител[ьи])$/.test(h.trim()));
    if (ti >= 0 && ai >= 0) return lines.slice(1).map(csv).filter((r) => r[ti]).map((r) => ({ a: (r[ai] || '').split(/[,;]/)[0].trim(), t: r[ti].trim() }));
    const out = [];
    for (const l of lines) {
      if (/^#EXTM3U|^#(?!EXTINF)/i.test(l)) continue;
      if (/^#EXTINF/i.test(l)) { out.push(splitLine(l.replace(/^#EXTINF:[^,]*,/i, ''))); continue; }
      if (/^(\w:)?[\\/]|\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|wma)$/i.test(l)) { // путь к файлу из m3u
        if (out.length && /^#EXTINF/i.test(lines[lines.indexOf(l) - 1] || '')) continue;
        out.push(splitLine(l.split(/[\\/]/).pop().replace(/\.[a-z0-9]{2,4}$/i, '').replace(/_/g, ' ')));
        continue;
      }
      if (/^https?:\/\//i.test(l)) continue;
      out.push(splitLine(l));
    }
    return out.filter((q) => q.t);
  }
  // Ссылка на плейлист/альбом сервиса → {name, items}. Запрос идёт с телефона (у сервисов нет CORS для WebView).
  async function getJSON(url) {
    const r = S.isAndroid && cap && cap.nativePromise ? await native('SquadMedia', 'get', { url }) : await fetch(url).then(async (x) => ({ status: x.status, body: await x.text() }));
    if (!r || r.status >= 400) throw new Error('Сервис ответил ' + (r ? r.status : 'ошибкой'));
    return r.body;
  }
  async function fromLink(u) {
    let m;
    const arts = (l) => (l || []).map((x) => x.name).filter(Boolean)[0] || '';
    if ((m = u.match(/music\.yandex\.[a-z]+\/users\/([^/?#]+)\/playlists\/(\d+)/))) {
      const j = JSON.parse(await getJSON('https://api.music.yandex.net/users/' + encodeURIComponent(m[1]) + '/playlists/' + m[2])).result;
      return { name: j.title, items: (j.tracks || []).map((x) => x.track || x).filter((x) => x && x.title).map((x) => ({ a: arts(x.artists), t: x.title })) };
    }
    if ((m = u.match(/music\.yandex\.[a-z]+\/album\/(\d+)/))) {
      const j = JSON.parse(await getJSON('https://api.music.yandex.net/albums/' + m[1] + '/with-tracks')).result;
      return { name: j.title, items: [].concat(...(j.volumes || [])).map((x) => ({ a: arts(x.artists), t: x.title })) };
    }
    if ((m = u.match(/deezer\.com\/(?:[a-z]{2}\/)?(playlist|album)\/(\d+)/))) {
      const j = JSON.parse(await getJSON('https://api.deezer.com/' + m[1] + '/' + m[2]));
      if (j.error) throw new Error(j.error.message || 'Deezer');
      return { name: j.title, items: ((j.tracks && j.tracks.data) || []).map((x) => ({ a: (x.artist && x.artist.name) || '', t: x.title })) };
    }
    if ((m = u.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album)\/([A-Za-z0-9]+)/))) {
      const html = await getJSON('https://open.spotify.com/embed/' + m[1] + '/' + m[2]);
      const d = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      const e = d && JSON.parse(d[1]).props.pageProps.state.data.entity;
      if (!e) throw new Error('Spotify не отдал список');
      return { name: e.name || e.title, items: (e.trackList || []).map((x) => ({ a: String(x.subtitle || '').split(',')[0].trim(), t: x.title })) };
    }
    throw new Error('Такие ссылки не поддерживаются. Скопируйте список треков текстом');
  }
  function matchItems(items) {
    const keys = [], missing = [];
    items.forEach((q) => { const t = findTrack(q); if (t) { if (!keys.includes(t.key)) keys.push(t.key); } else missing.push(q); });
    return { keys, missing };
  }
  const qText = (q) => (q.a ? q.a + ' — ' : '') + q.t;
  function saveImported(name, items) {
    const r = matchItems(items);
    const pl = { id: 'i' + Date.now().toString(36), name: name || 'Импорт ' + new Date().toLocaleDateString('ru-RU'), keys: r.keys, missing: r.missing, imported: Date.now() };
    S.playlists.push(pl); S.savePlaylists();
    return pl;
  }
  // медиатека пополнилась — досопоставляем ненайденное во всех импортированных плейлистах
  let rematchT = 0;
  S.on('library', () => {
    clearTimeout(rematchT);
    rematchT = setTimeout(() => {
      let changed = 0;
      S.playlists.forEach((pl) => {
        if (!pl.missing || !pl.missing.length) return;
        const r = matchItems(pl.missing);
        if (!r.keys.length) return;
        r.keys.forEach((k) => { if (!pl.keys.includes(k)) pl.keys.push(k); });
        pl.missing = r.missing; changed += r.keys.length;
      });
      if (changed) { S.savePlaylists(); S.toast('В импортированные плейлисты добавлено: ' + changed); }
    }, 3000);
  });
  function copyText(s) {
    (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(() => S.toast('Скопировано'), () => {
      const ta = document.createElement('textarea'); ta.value = s; document.body.append(ta); ta.select();
      try { document.execCommand('copy'); S.toast('Скопировано'); } catch (_) {} ta.remove();
    });
  }
  function importResult(pl) {
    const total = pl.keys.length + pl.missing.length;
    const body = openSheet('«' + pl.name + '»', '<p class="hint">Найдено у вас <b>' + pl.keys.length + '</b> из ' + total + '.' +
      (pl.missing.length ? ' Остальное плейлист подхватит сам, когда эти треки появятся в медиатеке или в Telegram.' : '') + '</p>' +
      '<div class="chips">' + (pl.keys.length ? '<button class="chip" data-im="play">' + svg(IC.play) + ' Слушать</button><button class="chip" data-im="open">Открыть плейлист</button>' : '') +
      (pl.missing.length ? '<button class="chip" data-im="copy">Скопировать ненайденные</button>' : '') + '</div>' +
      (pl.missing.length ? '<ol class="im-miss">' + pl.missing.slice(0, 300).map((q) => '<li>' + esc(qText(q)) + '</li>').join('') + '</ol>' : ''), 'tall');
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-im]');
      if (!b) return;
      if (b.dataset.im === 'play') { closeSheet(); S.play(pl.keys, 0, false); }
      else if (b.dataset.im === 'open') { closeSheet(); go('library'); S.openLib('playlists', pl.id); }
      else if (b.dataset.im === 'copy') copyText(pl.missing.map(qText).join('\n'));
    });
  }
  function openImport() {
    const body = openSheet('Импорт плейлиста', '<p class="hint">Вставьте ссылку на плейлист или альбом (Яндекс Музыка, Deezer, Spotify) или список треков — по строке «Исполнитель — Название». Подойдёт и файл .m3u, .csv или .txt. Треки ищутся в вашей медиатеке и Telegram.</p>' +
      '<input class="search lfm-in" id="im-name" placeholder="Название плейлиста (необязательно)" autocomplete="off">' +
      '<textarea class="search im-text" id="im-text" rows="7" placeholder="https://music.yandex.ru/users/…/playlists/…&#10;или&#10;Кино — Группа крови&#10;Земфира — Хочешь?"></textarea>' +
      '<p class="hint" id="im-msg"></p>' +
      '<div class="chips"><button class="btn primary" data-im="go">Найти треки</button><button class="chip" data-im="file">Из файла</button><button class="chip" data-im="paste">Вставить</button></div>', 'tall');
    const msg = body.querySelector('#im-msg'), ta = body.querySelector('#im-text'), nm = body.querySelector('#im-name');
    let busy = false;
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-im]');
      if (!b || busy) return;
      const k = b.dataset.im;
      if (k === 'paste') { try { ta.value = await navigator.clipboard.readText(); } catch (_) { S.toast('Вставьте долгим нажатием в поле'); } return; }
      if (k === 'file') {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.m3u,.m3u8,.csv,.txt,text/plain,text/csv,audio/x-mpegurl';
        inp.onchange = async () => { const f = inp.files && inp.files[0]; if (!f) return; ta.value = await f.text(); if (!nm.value) nm.value = f.name.replace(/\.[^.]+$/, ''); };
        inp.click();
        return;
      }
      const v = ta.value.trim();
      if (!v) { msg.textContent = 'Вставьте ссылку или список'; return; }
      busy = true;
      try {
        let name = nm.value.trim(), items;
        const url = /^https?:\/\/\S+$/.test(v) ? v : '';
        if (url) {
          msg.textContent = 'Загружаю список…';
          const r = await fromLink(url);
          items = r.items; name = name || r.name;
        } else items = parseList(v);
        if (!items.length) { msg.textContent = 'Не нашёл в тексте ни одного трека'; return; }
        importResult(saveImported(name.slice(0, 80), items.slice(0, 5000)));
      } catch (err) {
        msg.textContent = (err && err.message) || 'Не получилось загрузить ссылку';
      } finally { busy = false; }
    });
  }

  // ---------- «Что играет?»: 10 секунд с микрофона → AudD ----------
  // Свободного распознавания без ключа нет: AudD даёт бесплатные запросы, свой ключ (api_token) вставляется в настройках.
  const audd = Object.assign({ token: '', hist: [] }, ls.get('audd', {}));
  const auddSave = () => ls.set('audd', audd);
  const AUDD = 'https://api.audd.io/';
  const REC_SEC = 10;
  let rec = null, recGen = 0; // recGen: закрыли окно — результат старой записи никуда не отправляем
  function b64(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
  }
  async function auddCall(audio) {
    const body = 'api_token=' + encodeURIComponent(audd.token) + '&return=deezer&audio=' + encodeURIComponent(audio);
    let text;
    if (S.isAndroid && cap && cap.nativePromise) text = (await native('SquadMedia', 'post', { url: AUDD, body })).body;
    else text = await (await fetch(AUDD, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })).text();
    const j = JSON.parse(text);
    if (j.status !== 'success') {
      const c = j.error && j.error.error_code;
      throw new Error(c === 900 ? 'Ключ AudD не подходит — проверьте его в настройках' : c === 901 ? 'Бесплатные распознавания без ключа на сегодня кончились. Вставьте свой ключ AudD в настройках' : (j.error && j.error.error_message) || 'AudD не ответил');
    }
    return j.result;
  }
  function recStop() { if (rec) { const r = rec; rec = null; try { if (r.mr.state !== 'inactive') r.mr.stop(); } catch (_) {} r.stream.getTracks().forEach((t) => t.stop()); clearInterval(r.tick); } }
  async function recognize(body) {
    const box = body.querySelector('.rz');
    const show = (h) => { box.innerHTML = h; };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { show('<p class="hint">Запись звука здесь недоступна</p>'); return; }
    const my = ++recGen;
    if (S.playing()) S.pause(); // иначе услышим сами себя
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch (_) { show('<p class="hint">Нет доступа к микрофону. Разрешите его приложению в настройках телефона.</p><div class="chips"><button class="btn primary" data-rz="again">Ещё раз</button></div>'); return; }
    if (my !== recGen) { stream.getTracks().forEach((t) => t.stop()); return; }
    const chunks = [];
    const mr = new MediaRecorder(stream);
    rec = { mr, stream, tick: 0 };
    let left = REC_SEC;
    show('<div class="rz-pulse">' + svg(IC.mic) + '</div><p class="rz-t">Слушаю… <b class="rz-n">' + left + '</b></p><p class="hint">Поднесите телефон к источнику звука</p>');
    rec.tick = setInterval(() => { left--; const n = box.querySelector('.rz-n'); if (n) n.textContent = Math.max(0, left); }, 1000);
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { mr.onstop = res; });
    mr.start();
    setTimeout(() => { if (rec && rec.mr === mr) recStop(); }, REC_SEC * 1000);
    await done;
    recStop();
    if (my !== recGen || !chunks.length) return;
    show('<div class="tg-spin"></div><p class="rz-t">Узнаю…</p>');
    let r;
    try { r = await auddCall(await b64(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }))); }
    catch (e) { if (my === recGen) show('<p class="hint">' + esc(e.message || 'Не получилось') + '</p><div class="chips"><button class="btn primary" data-rz="again">Ещё раз</button></div>'); return; }
    if (my !== recGen) return;
    if (!r) { show('<p class="hint">Не узнал. Подойдите ближе к звуку или попробуйте в другом месте песни.</p><div class="chips"><button class="btn primary" data-rz="again">Ещё раз</button></div>'); return; }
    const item = { a: r.artist || '', t: r.title || '', al: r.album || '', y: String(r.release_date || '').slice(0, 4), at: Date.now(),
      art: (r.deezer && r.deezer.album && r.deezer.album.cover_medium) || '', link: r.song_link || '' };
    audd.hist = [item].concat(audd.hist.filter((h) => !(h.a === item.a && h.t === item.t))).slice(0, 50); auddSave();
    show(rzCard(item) + '<div class="chips"><button class="chip" data-rz="again">Ещё раз</button></div>');
  }
  function rzCard(h) {
    const mine = findTrack({ a: h.a, t: h.t });
    return '<div class="rz-res">' + (h.art ? '<img class="rz-art" src="' + esc(h.art) + '" alt="">' : '<div class="rz-art">' + svg(IC.mic) + '</div>') +
      '<div><b>' + esc(h.t) + '</b><span>' + esc(h.a) + '</span>' + (h.al ? '<small>' + esc(h.al) + (h.y ? ' · ' + esc(h.y) : '') + '</small>' : '') + '</div></div>' +
      '<div class="chips">' + (mine ? '<button class="btn primary" data-rz="play" data-k="' + esc(mine.key) + '">' + svg(IC.play) + ' Есть у вас — включить</button>' : '<p class="hint">В медиатеке и Telegram этого трека пока нет</p>') +
      '<button class="chip" data-rz="copy" data-q="' + esc(qText(h)) + '">Скопировать название</button></div>';
  }
  function openRecognize() {
    const body = openSheet('Что играет?', '<div class="rz"></div>' + (audd.hist.length ? '<h4 class="rz-h">Узнанные раньше</h4><div class="rz-hist">' +
      audd.hist.map((h, i) => '<button class="rz-row" data-rzh="' + i + '"><b>' + esc(h.t) + '</b><span>' + esc(h.a) + '</span></button>').join('') +
      '</div><div class="chips"><button class="chip" data-rz="pl">Плейлист из узнанных</button></div>' : ''), 'tall', () => { recGen++; recStop(); });
    body.addEventListener('click', (e) => {
      const h = e.target.closest('[data-rzh]');
      if (h) { body.querySelector('.rz').innerHTML = rzCard(audd.hist[+h.dataset.rzh]); body.scrollTop = 0; return; }
      const b = e.target.closest('[data-rz]');
      if (!b) return;
      const k = b.dataset.rz;
      if (k === 'again') recognize(body);
      else if (k === 'play') { closeSheet(); S.play([b.dataset.k], 0, false); }
      else if (k === 'copy') copyText(b.dataset.q);
      else if (k === 'pl') importResult(saveImported('Узнанные песни', audd.hist.map((x) => ({ a: x.a, t: x.t }))));
    });
    recognize(body);
  }
  const zcard = document.createElement('div');
  zcard.className = 'card';
  kcard.before(zcard);
  function auddUI() {
    zcard.innerHTML = '<h3>Распознавание песни</h3><p class="hint">«Что играет?» на главной слушает 10 секунд и узнаёт песню через сервис AudD. ' +
      'Без ключа даётся несколько бесплатных распознаваний в день; свой бесплатный ключ (api_token) берётся на dashboard.audd.io.</p>' +
      '<input class="search lfm-in" id="audd-key" placeholder="api_token AudD (необязательно)" autocomplete="off" spellcheck="false" value="' + esc(audd.token) + '">' +
      '<div class="chips"><button class="chip" id="audd-get">Получить ключ</button><button class="chip" id="audd-try">Узнать песню</button></div>';
  }
  auddUI();
  zcard.addEventListener('change', (e) => { if (e.target.id === 'audd-key') { audd.token = e.target.value.trim(); auddSave(); S.toast(audd.token ? 'Ключ AudD сохранён' : 'Ключ AudD удалён'); } });
  zcard.addEventListener('click', (e) => {
    if (e.target.id === 'audd-get') openExt('https://dashboard.audd.io/');
    else if (e.target.id === 'audd-try') openRecognize();
  });

  // ---------- Кнопка «Назад» Android ----------
  function back() {
    if (closeWrap()) return;
    if (closeSheet()) return;
    if ($('dialog').classList.contains('show')) { $('dialog-cancel').click(); return; }
    if ($('menu').classList.contains('show')) { $('menu').classList.remove('show'); return; }
    if ($('update-panel') && $('update-panel').classList.contains('show')) { const c = $('up-close'); if (c) c.click(); return; }
    if (S.settings.tab === 'player') { closePlayer(); return; }
    if (S.view.group && S.settings.tab === 'library') { S.openLib(S.view.tab); return; }
    if (dest !== 'home') { go('home'); return; }
    native('MusicScanner', 'minimize').catch(() => {});
  }
  window.addEventListener('squadBack', back);

  // ---------- Старт ----------
  const t0 = S.settings.tab;
  if (!t0 || t0 === 'player' || t0 === 'library' && !ls.get('started', false)) { ls.set('started', true); go('home'); }
  else { dest = destOf(t0); syncNav(); if (t0 === 'home') S.showTab('home'); }
  syncBg(); syncLike();
})();
