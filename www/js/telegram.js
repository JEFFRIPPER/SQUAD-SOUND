/* Telegram: вход по номеру, музыка из «Избранного» и выбранных чатов, кэш скачанных треков.
 * Клиент — GramJS (js/vendor/telegram.min.js, пересборка: scripts/build-telegram.sh).
 * Ключи приложения (api_id / api_hash) подставляет CI в js/tg-config.js из секретов TG_API_ID / TG_API_HASH.
 */
(function () {
  'use strict';

  const G = window.GramJS;
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
    try { await ensure(); await client.invoke(new G.Api.auth.LogOut()); } catch (_) {}
    await dropSession();
    ls.set('tracks', null); ls.set('sources', null);
    await cache.clear();
    set({ phase: 'idle', error: '', me: null });
  }

  // ---------- Источники: «Избранное» + выбранные чаты ----------
  const SAVED = { id: 'me', title: 'Избранное' };
  const sources = () => ls.get('sources', [SAVED]);
  const setSources = (list) => ls.set('sources', list);

  // InputPeer ⇄ JSON (сессия StringSession не хранит сущности, поэтому храним access_hash сами)
  function packPeer(p) {
    const o = { c: p.className };
    for (const k of ['userId', 'chatId', 'channelId', 'accessHash']) if (p[k] != null) o[k] = p[k].toString();
    return o;
  }
  function unpackPeer(src) {
    if (src.id === 'me' || !src.peer) return 'me';
    const o = {};
    for (const k of ['userId', 'chatId', 'channelId', 'accessHash']) if (src.peer[k] != null) o[k] = G.bigInt(src.peer[k]);
    return new G.Api[src.peer.c](o);
  }

  async function dialogs() {
    await ensure();
    const list = await client.getDialogs({ limit: 300 });
    return list.filter((d) => d.inputEntity && !(d.inputEntity instanceof G.Api.InputPeerSelf)).map((d) => ({
      id: d.id.toString(),
      title: d.title || d.name || 'Без названия',
      kind: d.isChannel && !d.isGroup ? 'Канал' : d.isGroup ? 'Группа' : 'Чат',
      peer: packPeer(d.inputEntity),
    }));
  }

  // ---------- Треки ----------
  const AUDIO_EXT = /\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|wma)$/i;

  function trackOf(msg, src) {
    const d = msg.media && msg.media.document;
    if (!d || !(d instanceof G.Api.Document)) return null;
    let audio = null, fileName = '';
    for (const a of d.attributes || []) {
      if (a instanceof G.Api.DocumentAttributeAudio) audio = a;
      else if (a instanceof G.Api.DocumentAttributeFilename) fileName = a.fileName || '';
    }
    if (audio && audio.voice) return null;
    if (!audio && !/^audio\//.test(d.mimeType || '') && !AUDIO_EXT.test(fileName)) return null;
    const name = fileName || [audio && audio.performer, audio && audio.title].filter(Boolean).join(' - ') || 'Трек ' + msg.id;
    return {
      key: 'tg:' + src.id + ':' + msg.id,
      name,
      title: (audio && audio.title) || '',
      artist: (audio && audio.performer) || '',
      duration: (audio && audio.duration) || 0,
      size: Number(d.size || 0),
      mime: d.mimeType || '',
      folder: 'Telegram/' + src.title,
      tg: { src: src.id, id: msg.id },
    };
  }

  // Собрать музыку из всех источников. onProgress(текст)
  async function sync(onProgress) {
    await ensure();
    const out = [];
    const seen = new Set();
    for (const src of sources()) {
      if (onProgress) onProgress(src.title);
      const peer = unpackPeer(src);
      for (const filter of [new G.Api.InputMessagesFilterMusic(), new G.Api.InputMessagesFilterDocument()]) {
        let msgs = [];
        try { msgs = await client.getMessages(peer, { limit: 3000, filter }); }
        catch (e) { console.warn('Telegram:', src.title, e); continue; }
        for (const m of msgs) {
          const t = m && trackOf(m, src);
          if (t && !seen.has(t.key)) { seen.add(t.key); out.push(t); }
        }
      }
    }
    ls.set('tracks', out);
    return out;
  }

  const saved = () => ls.get('tracks', []);

  // Скачать трек (или взять из кэша). onProgress(0..1)
  const loading = new Map();
  function blob(t, onProgress) {
    if (loading.has(t.key)) return loading.get(t.key);
    const p = (async () => {
      const hit = await cache.get(t.key);
      if (hit) return hit;
      await ensure();
      const src = sources().find((s) => s.id === t.tg.src) || (t.tg.src === 'me' ? SAVED : null);
      if (!src) throw new Error('Чат больше не выбран');
      // сообщение берём заново: ссылка на файл в Telegram со временем устаревает
      const [msg] = await client.getMessages(unpackPeer(src), { ids: [t.tg.id] });
      if (!msg || !msg.media) throw new Error('Сообщение с треком удалено');
      const buf = await client.downloadMedia(msg, {
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

  window.SquadTG = {
    configured,
    state: st,
    on(cb) { subs.add(cb); return () => subs.delete(cb); },
    resume, login, submit, cancel, logout,
    sources, setSources, SAVED, dialogs,
    sync, saved, blob,
    cachedKeys,
    cached: async (key) => !!(await cache.get(key)),
    uncache: (key) => cache.del(key),
    // ключи треков, удалённых из списка вручную, не возвращаются при обновлении
    errText,
  };
})();
