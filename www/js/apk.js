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
  function toggleLike(key) {
    const pl = likedList();
    const i = pl.keys.indexOf(key);
    if (i >= 0) pl.keys.splice(i, 1); else pl.keys.unshift(key);
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
      (tr.length ? 'В медиатеке ' + tr.length + ' ' + plural(tr.length, 'трек', 'трека', 'треков') : 'Медиатека пока пуста') + '</div></div></header>';

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
      '<button class="h-card" data-h="playlists"><div class="h-art big add">' + svg(IC.plus) + '</div><span class="h-ct">Все плейлисты</span><span class="h-ca">Создать новый</span></button></div>';

    h += '<h2 class="h-title">Источники</h2><div class="h-tiles">' +
      tile('telegram', IC.tg, 'Telegram', 'Музыка из профиля') + tile('online', IC.globe, 'Онлайн', 'Открытые источники') +
      tile('artists', IC.mic, 'Исполнители', '') + tile('folders', IC.folder, 'Папки', '') + '</div>';

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
    sheet.querySelector('.sheet-body').innerHTML = html;
    sheetWrap.classList.remove('closing');
    sheetWrap.classList.add('show');
    onSheetClose = onClose || null;
    return sheet.querySelector('.sheet-body');
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
  async function fetchLyrics(t) {
    if (lyrCache.has(t.key)) return lyrCache.get(t.key);
    const saved = ls.get('lyr:' + t.key, null);
    if (saved) { lyrCache.set(t.key, saved); return saved; }
    if (!window.SquadOnline || !window.SquadOnline.json) throw new Error('Нет сети');
    const artist = t.artist && t.artist !== 'Неизвестный исполнитель' ? t.artist : '';
    const title = String(t.title || '').replace(/\s*[([](?:official|lyric|audio|video|hd|hq|clip|клип)[^)\]]*[)\]]/ig, '').trim();
    const url = 'https://lrclib.net/api/search?' + (artist ? 'track_name=' + encodeURIComponent(title) + '&artist_name=' + encodeURIComponent(artist) : 'q=' + encodeURIComponent(title));
    let list = await window.SquadOnline.json(url);
    if ((!Array.isArray(list) || !list.length) && artist) list = await window.SquadOnline.json('https://lrclib.net/api/search?q=' + encodeURIComponent(artist + ' ' + title));
    list = Array.isArray(list) ? list : [];
    const d = S.time().dur || t.duration || 0;
    const score = (x) => (x.syncedLyrics ? 0 : 30) + (d && x.duration ? Math.abs(x.duration - d) : 15) + (x.instrumental ? 100 : 0);
    const best = list.filter((x) => x && (x.syncedLyrics || x.plainLyrics || x.instrumental)).sort((a, b) => score(a) - score(b))[0];
    const res = best ? { synced: best.syncedLyrics || '', plain: best.plainLyrics || '', instrumental: !!best.instrumental } : { none: true };
    lyrCache.set(t.key, res);
    if (!res.none) ls.set('lyr:' + t.key, res);
    return res;
  }
  let lyrBody = null;
  function openLyrics() {
    lyr.open = true;
    lyrBody = openSheet('Текст', '<div class="lyr"></div>', 'tall lyr-sheet', () => { lyr.open = false; cancelAnimationFrame(lyr.raf); });
    lyrBody.addEventListener('click', (e) => {
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
      if (r.none) { box.innerHTML = '<p class="hint">Текст для этого трека не нашёлся.</p>'; return; }
      if (r.instrumental && !r.synced && !r.plain) { box.innerHTML = '<p class="hint">Это инструментальный трек.</p>'; return; }
      const lines = parseLrc(r.synced);
      if (lines.length) {
        lyr.lines = lines;
        box.innerHTML = lines.map((l, i) => '<p data-i="' + i + '" data-t="' + l.t + '">' + (esc(l.text) || '♪') + '</p>').join('');
        tickLyrics();
      } else {
        box.innerHTML = '<div class="lyr-plain">' + esc(r.plain).replace(/\n/g, '<br>') + '</div>';
      }
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
    return { get: (k) => tx('readonly', (st) => st.get(k)), set: (k, v) => tx('readwrite', (st) => st.put(v, k)), del: (k) => tx('readwrite', (st) => st.delete(k)) };
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
    });
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
