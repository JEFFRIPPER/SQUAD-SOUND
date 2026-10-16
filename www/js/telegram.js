/* Telegram: вход по номеру, музыка из профиля, кэш скачанных треков.
 * Берём только песни, которые пользователь добавил в свой профиль Telegram.
 * Клиент — GramJS (js/vendor/telegram.min.js, пересборка: scripts/build-telegram.sh).
 * Ключи приложения (api_id / api_hash) подставляет CI в js/tg-config.js из секретов TG_API_ID / TG_API_HASH.
 */
(function () {
  'use strict';

  const G = window.GramJS;
  // старый кэш схемы GramJS (без музыки профиля) — только занимает место, сборка читает свой ключ
  try { localStorage.removeItem('GramJs:apiCache'); } catch (_) {}
  const cfg = window.SQUAD_TG || {};
  const API_ID = Number(cfg.apiId) || 0;
  const API_HASH = String(cfg.apiHash || '');
  const configured = !!(G && API_ID && API_HASH);

  const LS = 'squad.tg.';
  const ls = {
    get(k, def) { try { const v = localStorage.getItem(LS + k); return v == null ? def : JSON.parse(v); } catch (_) { return def; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(LS + k); else localStorage.setItem(LS + k, JSON.stringify(v)); } catch (_) {} },
  };

  // ---------- Кэш скачанных треков (IndexedDB) ----------
  const cache = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('squad-tg', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('audio');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction('audio', mode);
        const req = fn(tx.objectStore('audio'));
        tx.oncomplete = () => res(req && req.result);
        tx.onerror = () => rej(tx.error);
      });
    };
    return {
      get: (k) => run('readonly', (s) => s.get(k)).catch(() => null),
      keys: () => run('readonly', (s) => s.getAllKeys()).catch(() => []),
      put: (k, v) => run('readwrite', (s) => s.put(v, k)),
      del: (k) => run('readwrite', (s) => s.delete(k)).catch(() => {}),
      clear: () => run('readwrite', (s) => s.clear()).catch(() => {}),
    };
  })();

  // ---------- Состояние ----------
  // phase: off | idle | connecting | phone | code | password | ready
  const st = { phase: configured ? (ls.get('session', '') ? 'connecting' : 'idle') : 'off', error: '', hint: '', viaApp: true, me: null };
  const subs = new Set();
  const emit = () => subs.forEach((cb) => { try { cb(st); } catch (e) { console.error(e); } });
  const set = (patch) => { Object.assign(st, patch); emit(); };

  let client = null;
  let ask = null; // ожидание ввода на шагах phone / code / password

  function makeClient(session) {
    const c = new G.TelegramClient(new G.StringSession(session || ''), API_ID, API_HASH, {
      connectionRetries: 5,
      useWSS: true,
      deviceModel: 'SQUAD SOUND',
      systemVersion: /Android/i.test(navigator.userAgent) ? 'Android' : 'Windows',
      appVersion: String(window.SQUAD_VERSION || '1.0'),
      langCode: 'ru',
      systemLangCode: 'ru',
    });
    c.setLogLevel('error');
    return c;
  }

  const ERRORS = {
    PHONE_NUMBER_INVALID: 'Неверный номер телефона',
    PHONE_NUMBER_BANNED: 'Этот номер заблокирован в Telegram',
    PHONE_NUMBER_UNOCCUPIED: 'На этот номер нет аккаунта Telegram',
    PHONE_CODE_INVALID: 'Неверный код',
    PHONE_CODE_EXPIRED: 'Код устарел, запросите новый',
    PHONE_CODE_EMPTY: 'Введите код',
    PASSWORD_HASH_INVALID: 'Неверный пароль',
    API_ID_INVALID: 'Ключи приложения Telegram неверные',
    AUTH_KEY_UNREGISTERED: 'Сессия завершена, войдите заново',
    SESSION_REVOKED: 'Сессия завершена, войдите заново',
  };
  function errText(e) {
    const m = (e && (e.errorMessage || e.message)) || String(e);
    if (/FLOOD/.test(m)) {
      const s = e.seconds || +(/(\d+)/.exec(m) || [])[1] || 0;
      return 'Слишком много попыток, подождите ' + (s > 90 ? Math.ceil(s / 60) + ' мин' : (s || 'немного') + ' сек');
    }
    if (ERRORS[m]) return ERRORS[m];
    if (/timeout|websocket|network|connect/i.test(m)) return 'Нет связи с Telegram';
    return m;
  }

  function saveSession() { if (client) ls.set('session', client.session.save()); }

  async function loadMe() {
    const u = await client.getMe();
    const me = { name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'Telegram', phone: u.phone ? '+' + u.phone : '' };
    ls.set('me', me);
    return me;
  }

  // Подключение с сохранённой сессией (при запуске)
  async function resume() {
    if (!configured || !ls.get('session', '')) return;
    set({ phase: 'connecting', error: '', me: ls.get('me', null) });
    try {
      client = makeClient(ls.get('session', ''));
      await client.connect();
      if (!(await client.checkAuthorization())) { await dropSession(); set({ phase: 'idle', error: 'Сессия завершена, войдите заново' }); return; }
      set({ phase: 'ready', me: await loadMe() });
    } catch (e) {
      console.warn('Telegram:', e);
      // Сеть пропала — остаёмся «вошедшими», кэш играет, повтор при следующем действии
      set({ phase: 'ready', error: errText(e), me: ls.get('me', null) });
    }
  }

  async function ensure() {
    if (client && client.connected) return client;
    if (!client) client = makeClient(ls.get('session', ''));
    await client.connect();
    if (st.error) set({ error: '' });
    return client;
  }

  // ---------- Вход ----------
  function waitInput(phase, extra) {
    return new Promise((resolve, reject) => {
      ask = { resolve, reject };
      set(Object.assign({ phase }, extra || {}));
    });
  }

  async function login() {
    if (!configured || ['phone', 'code', 'password', 'connecting'].includes(st.phase)) return;
    let cancelled = false;
    set({ phase: 'connecting', error: '' });
    try {
      client = makeClient('');
      await client.start({
        phoneNumber: () => waitInput('phone'),
        phoneCode: (viaApp) => waitInput('code', { viaApp: !!viaApp }),
        password: (hint) => waitInput('password', { hint: hint || '' }),
        onError: async (e) => {
          if (cancelled || (e && e.message === 'cancel')) { cancelled = true; return true; }
          set({ error: errText(e) });
          // ошибки, после которых повторять ввод бессмысленно
          return /API_ID|BANNED|First name/i.test((e && (e.errorMessage || e.message)) || '');
        },
      });
      saveSession();
      set({ phase: 'ready', error: '', me: await loadMe() });
    } catch (e) {
      ask = null;
      try { await client.disconnect(); } catch (_) {}
      client = null;
      set({ phase: 'idle', error: cancelled ? '' : errText(e) });
    }
  }

  function submit(value) {
    if (!ask) return;
    const a = ask; ask = null;
    set({ phase: 'connecting', error: '' });
    a.resolve(String(value || '').trim());
  }

  function cancel() {
    if (ask) { const a = ask; ask = null; a.reject(new Error('cancel')); }
  }

  async function dropSession() {
    ls.set('session', null); ls.set('me', null);
    try { if (client) await client.disconnect(); } catch (_) {}
    client = null;
  }

  async function logout() {
    pf.stop = true;
    try { await ensure(); await client.invoke(new G.Api.auth.LogOut()); } catch (_) {}
    await dropSession();
    ls.set('tracks', null); ls.set('sources', null); ls.set('found', null);
    await cache.clear();
    set({ phase: 'idle', error: '', me: null });
  }

  // ---------- Музыка из профиля (users.getSavedMusic — песни, добавленные в свой профиль) ----------
  const AUDIO_EXT = /\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|wma)$/i;

  function trackOf(d) {
    if (!d || !(d instanceof G.Api.Document)) return null;
    let audio = null, fileName = '';
    for (const a of d.attributes || []) {
      if (a instanceof G.Api.DocumentAttributeAudio) audio = a;
      else if (a instanceof G.Api.DocumentAttributeFilename) fileName = a.fileName || '';
    }
    if (audio && audio.voice) return null;
    if (!audio && !/^audio\//.test(d.mimeType || '') && !AUDIO_EXT.test(fileName)) return null;
    const id = d.id.toString();
    return {
      key: 'tg:music:' + id,
      name: fileName || [audio && audio.performer, audio && audio.title].filter(Boolean).join(' - ') || 'Трек',
      title: (audio && audio.title) || '',
      artist: (audio && audio.performer) || '',
      duration: (audio && audio.duration) || 0,
      size: Number(d.size || 0),
      mime: d.mimeType || '',
      folder: 'Telegram/Профиль',
      tg: { doc: id },
    };
  }

  // Все документы музыки профиля (свежие file_reference — нужны для скачивания)
  async function profileDocs() {
    await ensure();
    const out = [];
    for (let offset = 0; offset < 5000;) {
      const r = await client.invoke(new G.Api.users.GetSavedMusic({ id: new G.Api.InputUserSelf(), offset, limit: 100, hash: G.bigInt(0) }));
      const docs = (r && r.documents) || [];
      out.push(...docs);
      offset += docs.length;
      if (!docs.length || offset >= (r.count || 0)) break;
    }
    return out;
  }

  async function sync() {
    const out = [];
    for (const d of await profileDocs()) { const t = trackOf(d); if (t) out.push(t); }
    ls.set('tracks', out);
    return out;
  }

  // профиль + найденное поиском по Telegram (found); старые треки из чатов (без doc) больше не показываем
  const saved = () => ls.get('tracks', []).filter((t) => t.tg && t.tg.doc && !t.tg.msg).concat(ls.get('found', []));

  // ---------- Поиск музыки по всему Telegram (публичные каналы и чаты) ----------
  // Ответ messages.searchGlobal с фильтром «музыка». Трек помнит канал и сообщение — по ним файл и качаем
  // (file_reference у документа живёт недолго, свежий берём из сообщения).
  const peerOf = (m, chats, users) => {
    const p = m.peerId;
    if (p instanceof G.Api.PeerChannel) {
      const c = chats.find((x) => x.id.toString() === p.channelId.toString());
      return c && c.accessHash != null ? { t: 'c', id: c.id.toString(), h: c.accessHash.toString(), name: c.title || '' } : null;
    }
    if (p instanceof G.Api.PeerChat) {
      const c = chats.find((x) => x.id.toString() === p.chatId.toString());
      return { t: 'g', id: p.chatId.toString(), h: '0', name: (c && c.title) || '' };
    }
    if (p instanceof G.Api.PeerUser) {
      const u = users.find((x) => x.id.toString() === p.userId.toString());
      return u && u.accessHash != null ? { t: 'u', id: u.id.toString(), h: u.accessHash.toString(), name: [u.firstName, u.lastName].filter(Boolean).join(' ') } : null;
    }
    return null;
  };
  const inputPeer = (pe) => pe.t === 'c' ? new G.Api.InputPeerChannel({ channelId: G.bigInt(pe.id), accessHash: G.bigInt(pe.h) })
    : pe.t === 'g' ? new G.Api.InputPeerChat({ chatId: G.bigInt(pe.id) })
    : new G.Api.InputPeerUser({ userId: G.bigInt(pe.id), accessHash: G.bigInt(pe.h) });

  // next — курсор из прошлого ответа ({rate, peer, id}); вернёт {results, next|null}
  async function search(q, next) {
    await ensure();
    const r = await client.invoke(new G.Api.messages.SearchGlobal({
      q: String(q || '').slice(0, 120),
      filter: new G.Api.InputMessagesFilterMusic(),
      minDate: 0, maxDate: 0,
      offsetRate: (next && next.rate) || 0,
      offsetPeer: next && next.peer ? inputPeer(next.peer) : new G.Api.InputPeerEmpty(),
      offsetId: (next && next.id) || 0,
      limit: 40,
    }));
    const msgs = (r && r.messages) || [], chats = (r && r.chats) || [], users = (r && r.users) || [];
    const results = [], seenDoc = new Set();
    let last = null;
    for (const m of msgs) {
      if (!(m instanceof G.Api.Message)) continue;
      const pe = peerOf(m, chats, users);
      if (pe) last = { rate: r.nextRate || m.date, peer: pe, id: m.id };
      const t = m.media && m.media instanceof G.Api.MessageMediaDocument ? trackOf(m.media.document) : null;
      if (!t || !pe || seenDoc.has(t.tg.doc)) continue; // один и тот же файл часто пересылают по разным каналам
      seenDoc.add(t.tg.doc);
      const where = pe.name || 'Telegram';
      results.push(Object.assign(t, {
        key: 'tg:doc:' + t.tg.doc, folder: 'Telegram/Поиск', source: 'Telegram', license: where,
        tg: { doc: t.tg.doc, msg: m.id, peer: { t: pe.t, id: pe.id, h: pe.h } },
      }));
    }
    const more = msgs.length >= 40 || (r instanceof G.Api.messages.MessagesSlice && r.count > msgs.length);
    return { results, next: more && last ? last : null };
  }

  // Документ из сообщения канала/чата (свежий file_reference)
  async function msgDoc(tg) {
    await ensure();
    const pe = tg.peer;
    const r = pe.t === 'c'
      ? await client.invoke(new G.Api.channels.GetMessages({ channel: new G.Api.InputChannel({ channelId: G.bigInt(pe.id), accessHash: G.bigInt(pe.h) }), id: [new G.Api.InputMessageID({ id: tg.msg })] }))
      : await client.invoke(new G.Api.messages.GetMessages({ id: [new G.Api.InputMessageID({ id: tg.msg })] }));
    const m = ((r && r.messages) || [])[0];
    const d = m && m.media && m.media.document;
    if (!d || d.id.toString() !== tg.doc) throw new Error('Сообщение с треком удалили');
    return d;
  }

  // Добавить найденный трек: скачать в кэш и запомнить в списке found
  async function add(res, onProgress, partKb) {
    const t = { key: res.key, name: res.name, title: res.title, artist: res.artist, duration: res.duration, size: res.size, mime: res.mime, folder: res.folder, tg: res.tg };
    await blob(t, onProgress, null, partKb);
    const list = ls.get('found', []).filter((x) => x.key !== t.key);
    list.push(t);
    ls.set('found', list);
    return t;
  }
  const forget = (key) => ls.set('found', ls.get('found', []).filter((x) => x.key !== key));

  // Скачать трек (или взять из кэша). onProgress(0..1); docs — уже полученный список документов профиля;
  // partKb — размер куска: 512 быстрее, 128 мельче грузит процессор расшифровкой (пока играет музыка)
  const loading = new Map();
  function blob(t, onProgress, docs, partKb) {
    if (loading.has(t.key)) return loading.get(t.key);
    const p = (async () => {
      const hit = await cache.get(t.key);
      if (hit) return hit;
      const doc = t.tg.msg ? await msgDoc(t.tg) : (docs || await profileDocs()).find((d) => d.id.toString() === t.tg.doc);
      if (!doc) throw new Error('Трека больше нет в профиле');
      const buf = await client.downloadMedia(doc, {
        partSizeKb: partKb || 512, // по умолчанию в GramJS 128 КБ за запрос — в 4 раза больше пауз между кусками
        progressCallback: (got, total) => { if (onProgress) onProgress(Number(total) ? Number(got) / Number(total) : 0); },
      });
      if (!buf || !buf.length) throw new Error('Пустой файл');
      const b = new Blob([buf], { type: t.mime || 'audio/mpeg' });
      await cache.put(t.key, b).catch((e) => console.warn('Кэш Telegram:', e));
      return b;
    })();
    loading.set(t.key, p);
    p.finally(() => loading.delete(t.key)).catch(() => {});
    return p;
  }

  async function cachedKeys() { return new Set(await cache.keys()); }

  // Фоновая загрузка всех треков профиля в кэш: PF_WORKERS файлов одновременно, список документов — один раз.
  // onStep(done, total, track) после каждого трека. Повторный вызов во время работы ничего не делает.
  // busy() → true, пока играет музыка: тогда качаем в один поток мелкими кусками с паузами,
  // иначе расшифровка в JS отнимает процессор у звука и в наушниках щёлкает.
  const PF_WORKERS = 4;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pf = { run: null, stop: false, done: 0, total: 0 };
  function prefetch(list, onStep, busy) {
    if (pf.run) return pf.run;
    pf.stop = false;
    pf.run = (async () => {
      const have = new Set(await cache.keys());
      const todo = list.filter((t) => t.tg && t.tg.doc && !have.has(t.key));
      pf.done = 0; pf.total = todo.length;
      let ok = 0, next = 0, full = false;
      if (!todo.length) return { done: 0, failed: 0, total: 0 };
      let docs = profileDocs();
      // ссылки на файлы устарели — один перезапрос списка на всех, даже если упали сразу несколько потоков
      const refresh = (old) => { if (docs === old) docs = profileDocs().catch(() => old); return docs; };
      const quiet = () => { try { return !!(busy && busy()); } catch (_) { return false; } };
      const worker = async (_, wi) => {
        while (!pf.stop && !full && st.phase === 'ready' && next < todo.length) {
          const calm = quiet();
          if (calm) { await sleep(wi ? 3000 : 1500); if (wi) continue; } // играет музыка — работает только первый поток
          if (pf.stop || full || st.phase !== 'ready' || next >= todo.length) break;
          const t = todo[next++];
          const mine = docs;
          try {
            await blob(t, null, await mine, calm ? 128 : 512);
            ok++;
          } catch (e) {
            const m = (e && (e.errorMessage || e.message)) || '';
            if (/FILE_REFERENCE/.test(m)) {
              try { await blob(t, null, await refresh(mine), calm ? 128 : 512); ok++; } catch (_) {}
            } else if (/quota|QuotaExceeded/i.test(m + (e && e.name))) full = true; // память кончилась
          }
          pf.done++;
          if (onStep) try { onStep(pf.done, pf.total, t); } catch (_) {}
        }
      };
      await docs;
      await Promise.all(Array.from({ length: Math.min(PF_WORKERS, todo.length) }, worker));
      return { done: ok, failed: pf.done - ok + (full ? todo.length - next : 0), total: pf.total };
    })();
    pf.run.finally(() => { pf.run = null; }).catch(() => {});
    return pf.run;
  }

  window.SquadTG = {
    configured,
    state: st,
    on(cb) { subs.add(cb); return () => subs.delete(cb); },
    resume, login, submit, cancel, logout,
    sync, saved, blob, prefetch, search, add, forget,
    get prefetching() { return pf.run ? { done: pf.done, total: pf.total } : null; },
    cachedKeys,
    cached: async (key) => !!(await cache.get(key)),
    uncache: (key) => cache.del(key),
    // ключи треков, удалённых из списка вручную, не возвращаются при обновлении
    errText,
  };
})();
