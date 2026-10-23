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
        tx.onabort = () => rej(tx.error || new Error('IndexedDB: транзакция прервана'));
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

  // connect() в GramJS при неудаче не бросает ошибку, а молча остаётся отключённым
  async function connectOrThrow(c) {
    await c.connect();
    if (!c.connected) throw new Error('network: нет соединения с Telegram');
  }
  // destroy() гасит и переподключение, и фоновые соединения; disconnect() оставлял их жить
  async function closeClient(c) {
    if (!c) return;
    try { await (c.destroy ? c.destroy() : c.disconnect()); } catch (_) {}
  }
  // Сессию выбрасываем только когда Telegram прямо сказал, что она мертва. Сеть пропала — сессия остаётся
  const DEAD = /AUTH_KEY_UNREGISTERED|AUTH_KEY_INVALID|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED/;
  async function authorized(c) {
    try { await c.invoke(new G.Api.updates.GetState()); return true; } catch (e) {
      if (DEAD.test((e && (e.errorMessage || e.message)) || '')) return false;
      throw e;
    }
  }

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
      await connectOrThrow(client);
      if (!(await authorized(client))) { await dropSession(); set({ phase: 'idle', error: 'Сессия завершена, войдите заново' }); return; }
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
    await connectOrThrow(client);
    if (st.error) set({ error: '' });
    return client;
  }

  // ---------- Вход ----------
  function waitInput(phase, extra) {
    if (!run) return Promise.reject(new Error('cancel')); // вход уже отменили, пока шло подключение
    return new Promise((resolve, reject) => {
      ask = { resolve, reject };
      set(Object.assign({ phase }, extra || {}));
    });
  }

  let run = null; // текущая попытка входа: { cancelled } — «Отмена» работает и пока идёт подключение
  async function login() {
    if (!configured || ['phone', 'code', 'password', 'connecting'].includes(st.phase)) return;
    const me = run = { cancelled: false };
    let stopErr = '';
    set({ phase: 'connecting', error: '' });
    const c = client = makeClient('');
    try {
      await c.start({
        phoneNumber: () => waitInput('phone'),
        phoneCode: (viaApp) => waitInput('code', { viaApp: !!viaApp }),
        password: (hint) => waitInput('password', { hint: hint || '' }),
        // номера нет в Telegram: без этого GramJS сам зарегистрировал бы новый аккаунт с именем «first name»
        firstAndLastNames: async () => { throw new Error('PHONE_NUMBER_UNOCCUPIED'); },
        onError: async (e) => {
          if (me.cancelled || (e && e.message === 'cancel')) { me.cancelled = true; return true; }
          const m = (e && (e.errorMessage || e.message)) || '';
          set({ error: errText(e) });
          // ошибки, после которых повторять ввод бессмысленно
          if (/API_ID|BANNED|UNOCCUPIED|First name/i.test(m)) { stopErr = errText(e); return true; }
          return false;
        },
      });
      if (me.cancelled) throw new Error('cancel');
      saveSession();
      set({ phase: 'ready', error: '', me: await loadMe() });
    } catch (e) {
      if (run === me) {
        ask = null;
        if (client === c) client = null;
        set({ phase: 'idle', error: me.cancelled ? '' : stopErr || errText(e) });
      }
      await closeClient(c);
    } finally {
      if (run === me) run = null;
    }
  }

  function submit(value) {
    if (!ask) return;
    const a = ask; ask = null;
    set({ phase: 'connecting', error: '' });
    a.resolve(String(value || '').trim());
  }

  function cancel() {
    if (ask) { const a = ask; ask = null; a.reject(new Error('cancel')); return; }
    // подключение ещё идёт — бросаем эту попытку, клиент закрываем в фоне
    if (run && st.phase === 'connecting') {
      const r = run; r.cancelled = true; run = null;
      const c = client; client = null;
      set({ phase: 'idle', error: '' });
      closeClient(c);
    }
  }

  async function dropSession() {
    ls.set('session', null); ls.set('me', null);
    const c = client; client = null;
    docsCache = null;
    await closeClient(c);
  }

  async function logout() {
    pf.stop = true;
    cancel();
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

  // Список документов профиля помним 10 минут: раньше его заново тянули из сети перед каждым скачиванием трека.
  // Устарел file_reference или трека нет в списке — перезапрашиваем один раз
  let docsCache = null; // { at, p }
  function profileDocsCached(fresh) {
    if (fresh || !docsCache || Date.now() - docsCache.at > 600000) {
      const p = profileDocs();
      docsCache = { at: Date.now(), p };
      p.catch(() => { if (docsCache && docsCache.p === p) docsCache = null; });
    }
    return docsCache.p;
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
    const docs = await profileDocsCached(true);
    for (const d of docs) { const t = trackOf(d); if (t) out.push(t); }
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

  // Найденное сообщение → трек для списка результатов (или null, если в нём не музыка)
  function resOf(m, pe) {
    if (!(m instanceof G.Api.Message) || !pe) return null;
    const t = m.media && m.media instanceof G.Api.MessageMediaDocument ? trackOf(m.media.document) : null;
    if (!t) return null;
    return Object.assign(t, {
      key: 'tg:doc:' + t.tg.doc, folder: 'Telegram/Поиск', source: 'Telegram', license: pe.name || 'Telegram',
      tg: { doc: t.tg.doc, msg: m.id, peer: { t: pe.t, id: pe.id, h: pe.h } },
    });
  }

  // Поиск по своим чатам и каналам (messages.searchGlobal). cur — курсор {rate, peer, id}
  async function globalPage(q, cur) {
    const r = await client.invoke(new G.Api.messages.SearchGlobal({
      q, filter: new G.Api.InputMessagesFilterMusic(), minDate: 0, maxDate: 0,
      offsetRate: (cur && cur.rate) || 0,
      offsetPeer: cur && cur.peer ? inputPeer(cur.peer) : new G.Api.InputPeerEmpty(),
      offsetId: (cur && cur.id) || 0,
      limit: 40,
    }));
    const msgs = (r && r.messages) || [], chats = (r && r.chats) || [], users = (r && r.users) || [];
    const results = [];
    let last = null;
    for (const m of msgs) {
      const pe = m instanceof G.Api.Message ? peerOf(m, chats, users) : null;
      if (pe) last = { rate: r.nextRate || m.date, peer: pe, id: m.id };
      const t = resOf(m, pe);
      if (t) results.push(t);
    }
    const more = msgs.length >= 40 || (r instanceof G.Api.messages.MessagesSlice && r.count > msgs.length);
    return { results, next: more && last ? last : null };
  }

  // ---------- Открытые музыкальные каналы: ищем в них без подписки ----------
  // searchGlobal видит только чаты, где пользователь состоит, поэтому популярное часто «не находилось».
  // В открытом канале messages.search работает и без подписки. Каналы берём двумя путями:
  // по самому запросу (канал исполнителя или фанатов) и из списка музыкальных каналов, который копится сам:
  // ищем их по словам «музыка», «phonk»… (contacts.search), а те, где уже что-то нашлось, поднимаем выше.
  const SRC_WORDS = ['музыка', 'music', 'mp3', 'новинки музыки', 'phonk', 'треки', 'рэп', 'remix'];
  const SRC_TTL = 3 * 864e5, SRC_MAX = 40, CH_LIMIT = 20;
  const chanOf = (c) => (c instanceof G.Api.Channel && c.broadcast && !c.min && c.username && c.accessHash != null)
    ? { t: 'c', id: c.id.toString(), h: c.accessHash.toString(), name: c.title || '', n: Number(c.participantsCount || 0) } : null;
  async function findChannels(q, limit) {
    const r = await client.invoke(new G.Api.contacts.Search({ q: String(q).slice(0, 64), limit }));
    return ((r && r.chats) || []).map(chanOf).filter(Boolean);
  }
  const srcSort = (a, b) => ((b.hits || 0) - (a.hits || 0)) || ((b.n || 0) - (a.n || 0));
  function srcMerge(add, hits) {
    const m = new Map(ls.get('srcCh', []).map((c) => [c.id, c]));
    for (const c of add) {
      const o = m.get(c.id);
      m.set(c.id, Object.assign(o || { hits: 0 }, { t: 'c', id: c.id, h: c.h, name: c.name, n: c.n || (o && o.n) || 0 }));
    }
    for (const [id, k] of hits || []) { const o = m.get(id); if (o) o.hits = k <= -3 ? -3 : Math.max(-2, (o.hits || 0) + k); } // промахи не выкидывают канал, выкидывает только ошибка доступа
    const list = [...m.values()].filter((c) => c.hits > -3).sort(srcSort).slice(0, SRC_MAX);
    ls.set('srcCh', list);
    return list;
  }
  let srcRun = null;
  function sources() {
    const list = ls.get('srcCh', []), age = Date.now() - ls.get('srcChAt', 0);
    // мало каналов — обновляем чаще, но не чаще раза в 10 минут: contacts.search Telegram ограничивает
    if ((list.length >= 6 && age < SRC_TTL) || age < 6e5) return Promise.resolve(list);
    if (!srcRun) {
      srcRun = Promise.all(SRC_WORDS.map((w) => findChannels(w, 10).catch(() => [])))
        .then((r) => { ls.set('srcChAt', Date.now()); return srcMerge(r.flat()); })
        .finally(() => { srcRun = null; });
    }
    return srcRun;
  }
  // Какие каналы спросить: найденные по запросу, лучшие из списка и пара случайных — чтобы список не застаивался
  function pickChannels(byQ, src) {
    const out = [], seen = new Set();
    const put = (c) => { if (c && !seen.has(c.id)) { seen.add(c.id); out.push({ t: 'c', id: c.id, h: c.h, name: c.name }); } };
    byQ.slice().sort(srcSort).slice(0, 3).forEach(put);
    const ranked = src.slice().sort(srcSort);
    ranked.slice(0, 4).forEach(put);
    const rest = ranked.slice(4);
    for (let i = 0; i < 2 && rest.length; i++) put(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    return out;
  }
  async function channelPage(pe, q, offsetId) {
    const r = await client.invoke(new G.Api.messages.Search({
      peer: inputPeer(pe), q, filter: new G.Api.InputMessagesFilterMusic(),
      minDate: 0, maxDate: 0, offsetId: offsetId || 0, addOffset: 0, limit: CH_LIMIT, maxId: 0, minId: 0, hash: G.bigInt(0),
    }));
    const msgs = ((r && r.messages) || []).filter((m) => m instanceof G.Api.Message);
    return { results: msgs.map((m) => resOf(m, pe)).filter(Boolean), next: msgs.length >= CH_LIMIT ? msgs[msgs.length - 1].id : 0 };
  }
  // по 4 запроса одновременно: так быстрее, а Telegram не ругается на частоту
  async function pool(items, n, fn) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
    return out;
  }
  // сначала то, где в названии и исполнителе есть все слова запроса
  const words = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').split(/[^0-9a-zа-я]+/i).filter((w) => w.length > 1);
  function rank(list, q) {
    const qw = words(q);
    if (!qw.length) return list;
    const score = (t) => { const hay = words(t.artist + ' ' + t.title + ' ' + t.name).join(' '); return qw.filter((w) => hay.includes(w)).length; };
    return list.map((t, i) => ({ t, i, s: score(t) })).sort((a, b) => (b.s - a.s) || (a.i - b.i)).map((x) => x.t);
  }

  // Поиск музыки: свои чаты + открытые каналы, параллельно. next — курсор из прошлого ответа; вернёт {results, next|null}
  async function search(q, next) {
    await ensure();
    q = String(q || '').replace(/[«»"“”()[\]{}|_~*#]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!q) return { results: [], next: null };
    const first = !next;
    let chans, byQ = [];
    const gJob = first || next.g ? globalPage(q, first ? null : next.g).catch((e) => ({ err: e })) : null;
    if (first) {
      let src;
      [byQ, src] = await Promise.all([findChannels(q, 10).catch(() => []), sources().catch(() => [])]);
      chans = pickChannels(byQ, src).map((pe) => ({ pe, off: 0 }));
    } else chans = next.ch || [];
    const cRes = await pool(chans, 4, (c) => channelPage(c.pe, q, c.off).catch((e) => ({ err: e })));
    const g = gJob ? await gJob : null;
    if (g && g.err && cRes.every((r) => r.err)) throw g.err; // всё упало — пусть покажут ошибку
    const results = [], seenDoc = new Set();
    const take = (list) => list.forEach((t) => { if (!seenDoc.has(t.tg.doc)) { seenDoc.add(t.tg.doc); results.push(t); } }); // один файл часто пересылают по разным каналам
    if (g && !g.err) take(g.results);
    // каналы, где нашлось, поднимаем в списке; найденные по запросу и давшие треки — запоминаем как новые источники
    const nextCh = [], hits = [], good = new Set();
    cRes.forEach((r, i) => {
      const pe = chans[i].pe;
      if (r.err) { if (/CHANNEL_PRIVATE|CHANNEL_INVALID|USERNAME/.test(r.err.errorMessage || r.err.message || '')) hits.push([pe.id, -3]); return; }
      take(r.results);
      if (r.results.length) good.add(pe.id);
      if (first) hits.push([pe.id, r.results.length ? 1 : -1]);
      if (r.next) nextCh.push({ pe, off: r.next });
    });
    if (hits.length) srcMerge(byQ.filter((c) => good.has(c.id)), hits);
    const gNext = g && !g.err ? g.next : null;
    return { results: rank(results, q), next: gNext || nextCh.length ? { g: gNext, ch: nextCh } : null };
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
      const find = (list) => list.find((d) => d.id.toString() === t.tg.doc);
      let doc = t.tg.msg ? await msgDoc(t.tg) : find(docs || await profileDocsCached());
      if (!doc && !t.tg.msg && !docs) doc = find(await profileDocsCached(true)); // трек могли добавить только что
      if (!doc) throw new Error('Трека больше нет в профиле');
      const get = (d) => client.downloadMedia(d, {
        partSizeKb: partKb || 512, // по умолчанию в GramJS 128 КБ за запрос — в 4 раза больше пауз между кусками
        progressCallback: (got, total) => { if (onProgress) onProgress(Number(total) ? Number(got) / Number(total) : 0); },
      });
      let buf;
      try { buf = await get(doc); } catch (e) {
        // file_reference из запомненного списка устарел — свежий список и ещё одна попытка
        if (t.tg.msg || docs || !/FILE_REFERENCE/.test((e && (e.errorMessage || e.message)) || '')) throw e;
        doc = find(await profileDocsCached(true));
        if (!doc) throw new Error('Трека больше нет в профиле');
        buf = await get(doc);
      }
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
    get loggingIn() { return !!run; }, // идёт вход по номеру (а не подключение сохранённой сессии)
    get prefetching() { return pf.run ? { done: pf.done, total: pf.total } : null; },
    cachedKeys,
    cached: async (key) => !!(await cache.get(key)),
    uncache: (key) => cache.del(key),
    // ключи треков, удалённых из списка вручную, не возвращаются при обновлении
    errText,
  };
})();
