/* Статистика прослушиваний — общая для ПК и телефона (раньше жила в apk.js).
 * {t: {key: {n, sec, last, title, artist, genre}}, days: {'2026-10-16': sec}, total,
 *  m: {'2026-10': {t: {key: [n, sec]}, h: [24 × sec], total}}, kara: sec}
 * Хранится в localStorage 'squad.apk.stats' (ключ прежний — у пользователей уже накоплено).
 */
(function () {
  'use strict';
  const S = window.SquadApp;
  if (!S) return;
  const KEY = 'squad.apk.stats';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) {}
  const stats = Object.assign({ t: {}, days: {}, total: 0, kara: 0 }, saved);
  let dirty = false;
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
    if (S.sound().karaoke > 0.5) stats.kara = (stats.kara || 0) + 5;
    dirty = true;
  }, 5000);
  function save() {
    // старые дни и забытые треки не копим бесконечно
    const days = Object.keys(stats.days).sort();
    while (days.length > 400) delete stats.days[days.shift()];
    const months = Object.keys(stats.m).sort();
    while (months.length > 13) delete stats.m[months.shift()];
    const keys = Object.keys(stats.t);
    if (keys.length > 4000) keys.sort((a, b) => stats.t[a].last - stats.t[b].last).slice(0, keys.length - 4000).forEach((k) => delete stats.t[k]);
    try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch (_) {}
  }
  const flush = () => { if (dirty) { dirty = false; save(); } };
  setInterval(flush, 20000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('beforeunload', flush);
  S.on('track', () => { const t = S.cur(); if (t && counted !== t.key) counted = null; });

  window.SquadStats = { data: stats, save, p2, ymd, today, monthOf };
})();
