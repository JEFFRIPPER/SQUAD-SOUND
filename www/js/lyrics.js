/* Тексты песен — общие для ПК и телефона (раньше жили в apk.js).
 * Источники по очереди: кэш → теги файла → LRCLIB → lyrics.ovh. Кэш — IndexedDB squad-apk/blobs, ключи lyr:<трек>.
 */
(function () {
  'use strict';
  const S = window.SquadApp;
  if (!S) return;
  const LS = 'squad.apk.';
  const ls = { get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } } };
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


  window.SquadLyrics = {
    get: fetchLyrics,
    parse: parseLrc,
    forget(key) { lyrCache.delete(key); return idb.del('lyr:' + key).catch(() => {}); },
    keys: () => idb.keys(),
  };
})();
