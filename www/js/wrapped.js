/* Итоги месяца и года — истории в духе Wrapped из локальной статистики (js/stats.js). Общие для ПК и телефона:
 * на телефоне на весь экран, на ПК карточкой посередине. Открывает главная: SquadWrapped.open('2026-10') или open('2026').
 */
(function () {
  'use strict';
  const root = document.documentElement;
  const S = window.SquadApp, ST = window.SquadStats;
  if (!S || !ST) return;
  const stats = ST.data;
  const { p2, ymd, today } = ST;
  const esc = S.esc;
  const svg = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  const IC = { play: 'M7 4v16l13-8z', close: 'M6 6l12 12M18 6 6 18' };
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const m = n % 10; return n > 10 && n < 20 ? c : m > 1 && m < 5 ? b : m === 1 ? a : c; };
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const dur = (sec) => {
    const m = Math.round(sec / 60);
    if (sec > 0 && !m) return '<1 мин';
    return m < 60 ? m + ' мин' : Math.floor(m / 60) + ' ч ' + (m % 60) + ' мин';
  };

  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const isYear = (k) => k.length === 4;
  const monthName = (k) => (isYear(k) ? k + ' год' : MONTHS[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4));
  const cap1 = (x) => x[0].toUpperCase() + x.slice(1);
  // данные периода: месяц как есть, год — сумма его месяцев
  function period(k) {
    if (!isYear(k)) return stats.m[k] || null;
    const ms = Object.keys(stats.m).filter((m) => m.startsWith(k + '-'));
    if (!ms.length) return null;
    const P = { t: {}, h: new Array(24).fill(0), total: 0 };
    for (const m of ms) {
      const M = stats.m[m];
      P.total += M.total;
      M.h.forEach((v, i) => { P.h[i] += v; });
      for (const key of Object.keys(M.t)) { const a = P.t[key] || (P.t[key] = [0, 0]); a[0] += M.t[key][0]; a[1] += M.t[key][1]; }
    }
    return P;
  }
  // месяцы (и годы), за которые есть что показать: от новых к старым
  function list() {
    const ms = Object.keys(stats.m).filter((k) => stats.m[k].total >= 60).sort().reverse();
    const years = Array.from(new Set(ms.map((k) => k.slice(0, 4)))).filter((y) => ms.filter((k) => k.startsWith(y)).length >= 2);
    return { months: ms, years };
  }
  // серии дней подряд: текущая (до сегодня/вчера) и лучшая за период
  function streaks(mk) {
    const days = new Set(Object.keys(stats.days).filter((d) => stats.days[d] >= 60));
    let cur = 0;
    for (let i = days.has(today()) ? 0 : 1; days.has(ymd(new Date(Date.now() - i * 864e5))); i++) cur++;
    let best = 0, run = 0, active = 0;
    const y = +mk.slice(0, 4);
    const from = isYear(mk) ? new Date(y, 0, 1) : new Date(y, +mk.slice(5, 7) - 1, 1);
    const to = isYear(mk) ? new Date(y + 1, 0, 1) : new Date(y, +mk.slice(5, 7), 1);
    for (let d = new Date(from); d < to; d.setDate(d.getDate() + 1)) {
      if (days.has(ymd(d))) { run++; active++; best = Math.max(best, run); } else run = 0;
    }
    return { cur, best, active };
  }
  function wrapData(mk) {
    const M = period(mk);
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
    const Y = isYear(D.mk);
    const name = Y ? D.mk : MONTHS[+D.mk.slice(5, 7) - 1];
    const per = Y ? 'год' : 'месяц', perG = Y ? 'года' : 'месяца';
    const min = Math.round(D.M.total / 60);
    const sl = [];
    sl.push('<div class="w-kick">SQUAD SOUND · итоги ' + perG + '</div><div class="w-huge">' + cap1(name) + '</div><div class="w-sub">' + (Y ? 'год в музыке' : D.mk.slice(0, 4)) +
      '</div><p class="w-p">Посмотрим, как звучал твой ' + per + '.</p>');
    sl.push('<div class="w-kick">Ты слушал музыку</div><div class="w-huge">' + min.toLocaleString('ru') + '</div><div class="w-sub">' + plural(min, 'минуту', 'минуты', 'минут') + '</div>' +
      '<p class="w-p">' + D.plays + ' ' + plural(D.plays, 'прослушивание', 'прослушивания', 'прослушиваний') + ' · ' + D.tr.length + ' ' + plural(D.tr.length, 'трек', 'трека', 'треков') +
      (D.st.active ? ' · ' + D.st.active + ' ' + plural(D.st.active, 'день', 'дня', 'дней') + ' с музыкой' : '') + '</p>');
    if (D.tr[0]) {
      const x = D.tr[0];
      sl.push('<div class="w-kick">Трек ' + perG + '</div>' + wArt(x) + '<div class="w-big">' + esc(x.title) + '</div><div class="w-sub">' + esc(x.artist) + '</div>' +
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
    if (D.genres.length) sl.push('<div class="w-kick">Жанр ' + perG + '</div><div class="w-big">' + esc(D.genres[0].name) + '</div><p class="w-p">' + dur(D.genres[0].sec) + '</p>');
    if (D.peak >= 0) {
      const [t, d] = persona(D.peak);
      const mx = Math.max(...D.M.h) || 1;
      sl.push('<div class="w-kick">Твоё время</div><div class="w-big">' + t + '</div><div class="w-hours">' +
        D.M.h.map((v, i) => '<i style="height:' + Math.max(3, Math.round(v / mx * 100)) + '%"' + (i === D.peak ? ' class="on"' : '') + '></i>').join('') +
        '</div><div class="w-hl"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div><p class="w-p">' + d + '. Пик — ' + p2(D.peak) + ':00–' + p2((D.peak + 1) % 24) + ':00.</p>');
    }
    if (D.st.best > 1 || D.st.cur > 1) {
      sl.push('<div class="w-kick">Серия</div><div class="w-huge">' + D.st.best + '</div><div class="w-sub">' + plural(D.st.best, 'день', 'дня', 'дней') + ' подряд с музыкой</div>' +
        '<p class="w-p">' + (D.st.cur > 1 ? 'Сейчас серия ' + D.st.cur + ' ' + plural(D.st.cur, 'день', 'дня', 'дней') + '. Не прерывай!' : 'Лучшая серия за ' + per + '.') + '</p>');
    }
    sl.push('<div class="w-kick">' + cap1(name) + ' в цифрах</div><div class="w-sum">' +
      '<div><b>' + min.toLocaleString('ru') + '</b><span>минут</span></div><div><b>' + D.tr.length + '</b><span>треков</span></div>' +
      '<div><b>' + D.st.best + '</b><span>дней подряд</span></div><div><b>' + D.plays + '</b><span>прослушиваний</span></div></div>' +
      (D.tr[0] ? '<p class="w-p">Трек ' + perG + ': <b>' + esc(D.tr[0].title) + '</b>' + (D.artists[0] ? '<br>Исполнитель: <b>' + esc(D.artists[0].name) + '</b>' : '') + '</p>' : '') +
      '<div class="w-acts">' + (D.tr.some((x) => x.t) ? '<button class="btn" data-w="play">' + svg(IC.play) + ' Включить топ ' + perG + '</button><button class="btn ghost" data-w="save">Сохранить плейлистом</button>' : '') + '</div>');
    return sl;
  }
  const back = document.createElement('div');
  back.className = 'wrap-back';
  const wrap = document.createElement('div');
  wrap.className = 'wrap-ov';
  wrap.innerHTML = '<div class="w-bars"></div><button class="w-x" aria-label="Закрыть">' + svg(IC.close) + '</button><div class="w-slide"></div>';
  document.body.append(back, wrap);
  const W = { i: 0, sl: [], D: null, timer: 0 };
  function wShow(i) {
    if (i < 0) i = 0;
    if (i >= W.sl.length) { close(); return; }
    W.i = i;
    const slide = wrap.querySelector('.w-slide');
    slide.innerHTML = '<div class="w-in">' + W.sl[i] + '</div>';
    wrap.style.setProperty('--wh', (hue(W.D.mk) + i * 37) % 360);
    wrap.querySelectorAll('.w-bars i').forEach((b, k) => { b.className = k < i ? 'done' : k === i ? 'run' : ''; });
    clearTimeout(W.timer);
    if (i < W.sl.length - 1) W.timer = setTimeout(() => wShow(W.i + 1), 7000);
  }
  function open(mk) {
    if (!period(mk)) return false;
    W.D = wrapData(mk);
    W.sl = wrapSlides(W.D);
    wrap.querySelector('.w-bars').innerHTML = W.sl.map(() => '<i></i>').join('');
    wrap.classList.add('show'); back.classList.add('show');
    root.classList.add('wrap-open');
    wShow(0);
    return true;
  }
  function close() {
    if (!wrap.classList.contains('show')) return false;
    clearTimeout(W.timer);
    wrap.classList.remove('show'); back.classList.remove('show');
    root.classList.remove('wrap-open');
    return true;
  }
  const api = { open, close, list, monthName, isOpen: () => wrap.classList.contains('show'), onPlay: null };
  back.addEventListener('click', close);
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.w-x')) { close(); return; }
    const b = e.target.closest('[data-w]');
    if (b) {
      const keys = W.D.tr.filter((x) => x.t).slice(0, 25).map((x) => x.key);
      if (b.dataset.w === 'play') { close(); if (api.onPlay) api.onPlay(); S.play(keys, 0, false); }
      else {
        const name = 'Итоги: ' + monthName(W.D.mk);
        let pl = S.playlists.find((p) => p.name === name && !p.smart);
        if (!pl) { pl = { id: 'w' + Date.now().toString(36), name, keys: [] }; S.playlists.push(pl); }
        pl.keys = keys; S.savePlaylists(); S.toast('Плейлист «' + name + '» сохранён');
      }
      return;
    }
    const r = wrap.getBoundingClientRect();
    wShow(W.i + (e.clientX < r.left + r.width * 0.3 ? -1 : 1));
  });
  // ПК: стрелки листают, Esc закрывает
  window.addEventListener('keydown', (e) => {
    if (!api.isOpen()) return;
    if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); wShow(W.i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); wShow(W.i - 1); }
  }, true);
  window.SquadWrapped = api;
})();
