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


  // ---------- Перевод и латиница под строками ----------
  // Перевод (и латиница для японского, корейского и т. п.) — бесплатный публичный переводчик Google без ключа;
  // русский и украинский переводим в латиницу сами, без сети. Результат кэшируется по треку.
  const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
    і: 'i', ї: 'yi', є: 'ye', ґ: 'g' };
  const cyrLat = (x) => x.replace(/[а-яёіїєґ]/gi, (c) => {
    const l = CYR[c.toLowerCase()];
    return c === c.toLowerCase() ? l : l.charAt(0).toUpperCase() + l.slice(1);
  });
  function script(texts) {
    const all = texts.join(' ');
    const cyr = (all.match(/[а-яёіїєґ]/gi) || []).length, lat = (all.match(/[a-z]/gi) || []).length;
    const other = (all.match(/[^\s\d\p{P}\p{S}a-zа-яёіїєґ]/giu) || []).length;
    return other > (cyr + lat) * 0.3 ? 'other' : cyr > lat ? 'cyr' : 'lat';
  }
  // один запрос на кусок до ~1500 символов; строки идут через \n и так же возвращаются
  async function gtx(chunk, rm) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ru&dt=t' + (rm ? '&dt=rm' : '') + '&q=' + encodeURIComponent(chunk);
    const d = await window.SquadOnline.json(url);
    if (!Array.isArray(d) || !Array.isArray(d[0])) throw new Error('Пустой ответ переводчика');
    const segs = d[0].filter(Array.isArray);
    return {
      tr: segs.filter((x) => typeof x[0] === 'string').map((x) => x[0]).join(''),
      rm: segs.filter((x) => x[0] == null && typeof x[3] === 'string').map((x) => x[3]).join(' '),
      lang: typeof d[2] === 'string' ? d[2] : '',
    };
  }
  function chunks(texts) {
    const out = [];
    let cur = [];
    for (const x of texts) {
      if (cur.length && cur.join('\n').length + x.length > 1500) { out.push(cur); cur = []; }
      cur.push(x);
    }
    if (cur.length) out.push(cur);
    return out;
  }
  // texts — строки текста (пустые не переводим). mode: 'tr' — перевод на русский, 'rm' — латиницей.
  // Ответ: { subs: [строка под каждой из texts], note } — note вместо subs, когда добавлять нечего.
  async function extra(key, texts, mode) {
    const ck = 'tr:' + mode + ':' + key;
    const saved = await idb.get(ck).catch(() => null);
    if (saved && saved.n === texts.length) return saved;
    const sc = script(texts);
    let res;
    if (mode === 'rm' && sc === 'lat') res = { note: 'Текст и так латиницей' };
    else if (mode === 'rm' && sc === 'cyr') res = { subs: texts.map(cyrLat) };
    else {
      if (!window.SquadOnline || !navigator.onLine) throw new Error('Нет сети');
      const idx = [], src = [];
      texts.forEach((x, i) => { if (x.trim()) { idx.push(i); src.push(x.replace(/\n/g, ' ')); } });
      const subs = texts.map(() => '');
      let lang = '', at = 0;
      const pick = (r) => (mode === 'rm' ? r.rm : r.tr);
      for (const part of chunks(src)) {
        const r = await gtx(part.join('\n'), mode === 'rm');
        lang = lang || r.lang;
        let got = pick(r).split('\n');
        if (got.length !== part.length) { // строки склеились — переводим этот кусок построчно (по 4 запроса разом)
          got = new Array(part.length).fill('');
          for (let j = 0; j < part.length; j += 4) {
            const rs = await Promise.all(part.slice(j, j + 4).map((x) => gtx(x, mode === 'rm')));
            rs.forEach((x, k) => { got[j + k] = pick(x).replace(/\n/g, ' '); });
          }
        }
        got.forEach((x, j) => { subs[idx[at + j]] = x.trim(); });
        at += part.length;
      }
      if (mode === 'tr' && lang === 'ru') res = { note: 'Текст уже на русском' };
      else if (!subs.some(Boolean)) res = { note: mode === 'rm' ? 'Латиницей не получилось' : 'Перевод пустой' };
      else res = { subs };
    }
    res.n = texts.length;
    idb.set(ck, res).catch(() => {});
    return res;
  }

  window.SquadLyrics = {
    extra,
    get: fetchLyrics,
    parse: parseLrc,
    forget(key) { lyrCache.delete(key); return idb.del('lyr:' + key).catch(() => {}); },
    keys: () => idb.keys(),
  };
})();
