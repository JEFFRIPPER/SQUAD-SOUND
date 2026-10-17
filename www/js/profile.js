/* Профиль: аватар, имя, уровень по времени прослушивания, статистика и бейджи. Общий для ПК и телефона.
 * Данные — локальная статистика js/stats.js; профиль хранится в localStorage 'squad.profile'.
 */
(function () {
  'use strict';
  const root = document.documentElement;
  const S = window.SquadApp, ST = window.SquadStats;
  const panel = document.getElementById('panel-profile');
  if (!S || !ST || !panel) return;

  const esc = S.esc;
  const stats = ST.data;
  const KEY = 'squad.profile';
  const prof = Object.assign({ name: '', avatar: '', badges: null }, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } })());
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prof)); } catch (_) { S.toast('Не хватило места для профиля'); } };
  const tgName = () => { try { return (JSON.parse(localStorage.getItem('squad.tg.me')) || {}).name || ''; } catch (_) { return ''; } };
  const name = () => prof.name || tgName() || 'Слушатель Сквада';

  const num = (n) => Math.round(n).toLocaleString('ru-RU');
  const dur = (sec) => {
    const m = Math.round(sec / 60);
    if (m < 60) return m + ' мин';
    const h = Math.floor(m / 60);
    return h < 100 ? h + ' ч ' + (m % 60) + ' мин' : num(h) + ' ч';
  };
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };

  // ---------- Уровень: на уровень L нужно 30·L·(L−1) минут ----------
  const need = (L) => 30 * L * (L - 1) * 60;
  function level() {
    const L = Math.max(1, Math.floor((1 + Math.sqrt(1 + 4 * stats.total / 1800)) / 2));
    const a = need(L), b = need(L + 1);
    const title = L >= 15 ? 'Легенда Сквада' : L >= 10 ? 'Аудиофил' : L >= 6 ? 'Меломан' : L >= 3 ? 'Слушатель' : 'Новичок';
    return { L, title, p: (stats.total - a) / (b - a), left: b - stats.total };
  }

  // ---------- Подсчёты ----------
  function calc() {
    const t = Object.values(stats.t);
    const plays = t.reduce((a, e) => a + e.n, 0);
    const heard = t.filter((e) => e.n > 0).length;
    const art = {};
    t.forEach((e) => {
      if (!e.artist || !e.n) return;
      const a = art[e.artist] || (art[e.artist] = { n: 0, sec: 0 });
      a.n += e.n; a.sec += e.sec;
    });
    const hours = new Array(24).fill(0);
    Object.values(stats.m || {}).forEach((M) => M.h.forEach((s, i) => { hours[i] += s; }));
    const days = new Set(Object.keys(stats.days).filter((d) => stats.days[d] >= 60));
    let cur = 0;
    for (let i = days.has(ST.today()) ? 0 : 1; days.has(ST.ymd(new Date(Date.now() - i * 864e5))); i++) cur++;
    let best = 0, run = 0, prev = 0;
    [...days].sort().forEach((d) => {
      const ts = new Date(d + 'T12:00').getTime();
      run = prev && Math.round((ts - prev) / 864e5) === 1 ? run + 1 : 1;
      best = Math.max(best, run); prev = ts;
    });
    const liked = (S.playlists.find((p) => p.id === 'liked') || { keys: [] }).keys.length;
    return {
      plays, heard, art, hours, cur, best, liked,
      lib: S.tracks.length,
      pls: S.playlists.filter((p) => p.id !== 'liked').length,
      artN: Object.keys(art).length,
      topArt: Math.max(0, ...Object.values(art).map((a) => a.n)),
      topTrack: Math.max(0, ...t.map((e) => e.n)),
      night: hours.slice(0, 5).reduce((a, x) => a + x, 0),
      morning: hours.slice(5, 8).reduce((a, x) => a + x, 0),
      tg: !!tgName(),
    };
  }

  // ---------- Бейджи ----------
  const BADGES = [
    ['first', '🎧', 'Первый трек', 'Дослушать первый трек', (c) => c.plays, 1],
    ['plays100', '💿', 'Сотня', '100 прослушиваний', (c) => c.plays, 100],
    ['plays1000', '🏆', 'Тысячник', '1000 прослушиваний', (c) => c.plays, 1000],
    ['hour', '⏱', 'Разогрев', 'Час музыки', () => stats.total / 3600, 1],
    ['day', '🌗', 'Сутки в ушах', '24 часа музыки', () => stats.total / 3600, 24],
    ['week', '🚀', 'Неделя звука', '168 часов музыки', () => stats.total / 3600, 168],
    ['streak3', '🔥', 'Втянулся', '3 дня подряд', (c) => c.best, 3],
    ['streak7', '⚡', 'Неделя без пропусков', '7 дней подряд', (c) => c.best, 7],
    ['streak30', '👑', 'Месяц в ритме', '30 дней подряд', (c) => c.best, 30],
    ['owl', '🦉', 'Ночная сова', 'Час музыки с полуночи до 5 утра', (c) => c.night / 3600, 1],
    ['bird', '🐦', 'Ранняя пташка', 'Час музыки с 5 до 8 утра', (c) => c.morning / 3600, 1],
    ['lib100', '📚', 'Коллекционер', '100 треков в медиатеке', (c) => c.lib, 100],
    ['lib1000', '🗄', 'Архивариус', '1000 треков в медиатеке', (c) => c.lib, 1000],
    ['likes', '❤️', 'Влюблённый', '50 любимых треков', (c) => c.liked, 50],
    ['pls', '🗂', 'Диджей', '5 своих плейлистов', (c) => c.pls, 5],
    ['fan', '⭐', 'Фанат', '50 прослушиваний одного артиста', (c) => c.topArt, 50],
    ['repeat', '🔁', 'На повторе', 'Один трек 25 раз', (c) => c.topTrack, 25],
    ['explorer', '🧭', 'Исследователь', '50 разных артистов', (c) => c.artN, 50],
    ['kara', '🎤', 'Звезда караоке', '10 минут в караоке', () => (stats.kara || 0) / 60, 10],
    ['tg', '✈️', 'На связи', 'Подключить Telegram', (c) => +c.tg, 1],
  ].map(([id, ic, title, desc, val, goal]) => ({ id, ic, title, desc, val, goal }));

  // новые бейджи получают дату; при первом запуске уже заработанные отмечаются без поздравлений
  function check(quiet) {
    const c = calc();
    const first = !prof.badges;
    if (first) prof.badges = {};
    const fresh = BADGES.filter((b) => !prof.badges[b.id] && b.val(c) >= b.goal);
    if (!fresh.length) { if (first) save(); return c; }
    fresh.forEach((b) => { prof.badges[b.id] = Date.now(); });
    save();
    if (!first && !quiet) S.toast('🏅 Новый бейдж: ' + fresh.map((b) => b.title).join(', '));
    return c;
  }
  setTimeout(() => check(true), 4000);
  setInterval(() => check(false), 60000);

  // ---------- Аватар ----------
  const initial = () => (name().trim()[0] || 'S').toUpperCase();
  const avatarHtml = (cls) => '<span class="pf-ava ' + (cls || '') + '">' + (prof.avatar ? '<img src="' + prof.avatar + '" alt="">' : '<b>' + esc(initial()) + '</b>') + '</span>';
  function pickAvatar() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const img = new Image();
      const url = URL.createObjectURL(f);
      img.onload = () => {
        // квадрат 256×256 из центра — в localStorage хватает места
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const s = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
        URL.revokeObjectURL(url);
        prof.avatar = c.toDataURL('image/jpeg', 0.85);
        save(); render(); emit();
      };
      img.onerror = () => { URL.revokeObjectURL(url); S.toast('Не удалось открыть картинку'); };
      img.src = url;
    };
    inp.click();
  }
  const hooks = [];
  const emit = () => hooks.forEach((f) => f());

  // ---------- Страница ----------
  function heat() {
    // последние 12 недель, столбец — неделя (пн…вс)
    const end = new Date(); end.setHours(12, 0, 0, 0);
    const start = new Date(end.getTime() - ((end.getDay() + 6) % 7 + 77) * 864e5);
    let h = '';
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 864e5)) {
      const s = stats.days[ST.ymd(d)] || 0;
      const lv = !s ? 0 : s < 900 ? 1 : s < 2700 ? 2 : s < 5400 ? 3 : 4;
      h += '<i class="l' + lv + '" title="' + d.toLocaleDateString('ru-RU') + ': ' + (s ? dur(s) : 'тишина') + '"></i>';
    }
    return '<div class="pf-heat">' + h + '</div>';
  }
  function render() {
    const c = check(true);
    const lv = level();
    const got = BADGES.filter((b) => prof.badges[b.id]).length;
    const peak = c.hours.some((x) => x) ? c.hours.indexOf(Math.max(...c.hours)) : -1;
    const topA = Object.entries(c.art).sort((a, b) => b[1].sec - a[1].sec).slice(0, 5);
    const topT = Object.entries(stats.t).filter(([, e]) => e.n).sort((a, b) => b[1].n - a[1].n || b[1].sec - a[1].sec).slice(0, 5);
    const stat = (v, l) => '<div class="pf-stat"><b>' + v + '</b><span>' + l + '</span></div>';
    const list = (rows) => rows.length ? '<ol class="pf-top">' + rows.join('') + '</ol>' : '<p class="hint">Послушайте что-нибудь — тут появится топ.</p>';
    panel.innerHTML =
      '<div class="pf">' +
      '<section class="pf-hero">' +
        '<button class="pf-ava-btn" data-pf="ava" title="Сменить фото">' + avatarHtml('big') + '<span class="pf-ava-edit">✎</span></button>' +
        '<div class="pf-id"><input class="pf-name" data-pf="name" maxlength="32" value="' + esc(name()) + '" aria-label="Имя">' +
          '<div class="pf-lv"><span class="pf-lvn">' + lv.L + '</span><b>' + lv.title + '</b><small>' + got + ' из ' + BADGES.length + ' бейджей</small></div>' +
          '<div class="pf-bar"><i style="width:' + Math.round(lv.p * 100) + '%"></i></div>' +
          '<small class="pf-next">До ' + (lv.L + 1) + ' уровня: ' + dur(lv.left) + ' музыки</small></div>' +
      '</section>' +
      '<section class="pf-stats">' +
        stat(dur(stats.total), 'всего музыки') + stat(num(c.plays), plural(c.plays, 'прослушивание', 'прослушивания', 'прослушиваний')) +
        stat(num(c.heard), plural(c.heard, 'трек услышан', 'трека услышано', 'треков услышано')) +
        stat(c.cur + ' 🔥', 'дней подряд · рекорд ' + c.best) +
        stat(peak < 0 ? '—' : ST.p2(peak) + ':00', 'любимый час') + stat(num(c.artN), plural(c.artN, 'артист', 'артиста', 'артистов')) +
      '</section>' +
      '<section class="pf-card"><h3>Активность за 12 недель</h3>' + heat() + '</section>' +
      '<section class="pf-card"><h3>Бейджи <small>' + got + '/' + BADGES.length + '</small></h3><div class="pf-badges">' +
        BADGES.map((b) => {
          const at = prof.badges[b.id];
          const p = Math.min(1, b.val(c) / b.goal);
          return '<div class="pf-badge' + (at ? ' got' : '') + '" title="' + esc(b.desc) + '"><span class="pf-bic">' + b.ic + '</span><b>' + esc(b.title) + '</b><small>' +
            (at ? 'Получен ' + new Date(at).toLocaleDateString('ru-RU') : esc(b.desc)) + '</small>' +
            (at ? '' : '<span class="pf-bp"><i style="width:' + Math.round(p * 100) + '%"></i></span>') + '</div>';
        }).join('') + '</div></section>' +
      '<div class="pf-two">' +
        '<section class="pf-card"><h3>Любимые артисты</h3>' + list(topA.map(([a, v]) => '<li><b>' + esc(a) + '</b><span>' + dur(v.sec) + '</span></li>')) + '</section>' +
        '<section class="pf-card"><h3>Чаще всего</h3>' + list(topT.map(([k, e]) => '<li' + (S.byKey(k) ? ' data-pf="play" data-k="' + esc(k) + '"' : '') + '><b>' + esc(e.title || 'Без названия') +
          '</b><span>' + esc(e.artist || '') + ' · ' + e.n + '×</span></li>')) + '</section>' +
      '</div></div>';
  }
  panel.addEventListener('click', (e) => {
    const el = e.target.closest('[data-pf]');
    if (!el) return;
    if (el.dataset.pf === 'ava') pickAvatar();
    else if (el.dataset.pf === 'play') S.play([el.dataset.k], 0, false);
  });
  panel.addEventListener('change', (e) => {
    if (e.target.dataset.pf !== 'name') return;
    prof.name = e.target.value.trim().slice(0, 32);
    save(); emit();
    if (!prof.avatar) render();
  });
  panel.addEventListener('keydown', (e) => { if (e.target.dataset.pf === 'name' && e.key === 'Enter') e.target.blur(); });
  S.on('tab', () => { if (S.settings.tab === 'profile') render(); });
  if (S.settings.tab === 'profile') render(); // вкладка открылась при старте раньше, чем загрузился этот файл

  window.SquadProfile = { avatarHtml, name, onChange: (f) => hooks.push(f), open: () => S.showTab('profile') };
  root.classList.add('has-profile');
})();
