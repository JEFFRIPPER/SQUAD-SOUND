/* SQUAD SOUND — интерфейс плеера */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const native = window.squadNative || null; // есть только в Electron (.exe)
  const decks = [$('audio'), $('audio2')];
  const engine = new AudioEngine(decks[0], decks[1]);
  window.squadEngine = engine; // для отладки из DevTools
  const A = () => engine.audio; // активная дека
  const AUDIO_RE = /\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|webm|mp4)$/i; // WMA Chromium не играет
  const cap = window.Capacitor;
  const isAndroid = !!(cap && cap.getPlatform && cap.getPlatform() === 'android');
  // Интерфейс APK (js/apk.js, css/apk.css): нижняя навигация, главная, полноэкранный плеер. В .exe не включается.
  const apkUI = isAndroid || /[?&]apk=1\b/.test(location.search);
  if (apkUI) document.documentElement.classList.add('apk');
  const appEvents = new EventTarget();
  const emitApp = (type) => appEvents.dispatchEvent(new Event(type));
  // Нативный поиск музыки: в .exe — по дискам, на Android — через MediaStore (android-src/MusicScannerPlugin.java)
  const scanner = isAndroid && cap.nativePromise ? (m, o) => cap.nativePromise('MusicScanner', m, o || {}) : null;
  const canScan = !!((native && native.scanMusic) || scanner);
  const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
  const cmp = (a, b) => collator.compare(a || '', b || '');

  // ---------- Хранилище ----------
  const store = {
    get(key, def) {
      try { const v = localStorage.getItem('squad.' + key); return v == null ? def : JSON.parse(v); }
      catch (_) { return def; }
    },
    set(key, v) { try { localStorage.setItem('squad.' + key, JSON.stringify(v)); } catch (_) {} },
  };

  // Кэш тегов и миниатюр обложек (IndexedDB), чтобы не перечитывать файлы
  const META_VER = 1;
  const metaDb = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('squad', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('meta');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction('meta', mode);
        const req = fn(tx.objectStore('meta'));
        tx.oncomplete = () => res(req && req.result);
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error('IndexedDB: транзакция прервана'));
      });
    };
    return {
      get: (k) => run('readonly', (s) => s.get(k)).catch(() => null),
      put: (k, v) => run('readwrite', (s) => s.put(v, k)).catch(() => {}),
    };
  })();

  const DEFAULT_FX = JSON.parse(JSON.stringify(engine.state));
  const settings = Object.assign({
    theme: 'squad', accent: null, coverAccent: false, shuffle: false, repeat: 'off', eqPreset: 'flat',
    tab: 'library', libTab: 'tracks', sort: 'added', crossfade: 0, autoScan: true, netCovers: true,
  }, store.get('settings', {}));
  engine.load(Object.assign(store.get('fx', {}), { karaoke: 0 })); // караоке не переживает перезапуск — иначе «пропал голос»

  let tracks = [];            // {key, name, title, artist, album, albumArtist, genre, year, no, disc, folder, thumb, accent, file?, path?}
  const byKey = new Map();
  let context = [];           // ключи списка, из которого запущено воспроизведение
  let queue = [];             // очередь воспроизведения (ключи, могут повторяться)
  let qpos = -1;              // позиция текущего трека в очереди
  let playlists = store.get('playlists', []); // [{id, name, keys: []}]
  let view = { tab: settings.libTab, group: null };
  let sleepTimer = null, sleepEnd = 0, sleepFadeT = null, sleepTrack = false; // sleepTrack — «до конца трека»

  const curTrack = () => (qpos >= 0 ? byKey.get(queue[qpos]) : null) || null;

  const saveSettings = () => store.set('settings', settings);
  const savePlaylists = () => store.set('playlists', playlists);
  let fxSaveT = null;
  const saveFx = () => { clearTimeout(fxSaveT); fxSaveT = setTimeout(() => store.set('fx', engine.state), 250); };
  const saveLibrary = () => {
    // В .exe сохраняем пути к файлам; в браузере/Android файлы выбираются заново.
    if (native) store.set('library', tracks.filter((t) => t.path).map((t) => t.path));
  };

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function shuffleArr(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return n + ' ' + (m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many);
  };
  const tracksWord = (n) => plural(n, 'трек', 'трека', 'треков');

  // ---------- Треки ----------
  function parseName(name) {
    const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\d+[\s.\-_]+/, '').trim();
    const m = base.split(/\s+[-–—]\s+/);
    if (m.length >= 2) return { artist: m[0].trim(), title: m.slice(1).join(' - ').trim() };
    return { artist: 'Неизвестный исполнитель', title: base || name };
  }

  function hueOf(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return h;
  }

  function makeTrack(name, extra) {
    const p = parseName(name);
    const t = { name, title: p.title, artist: p.artist, album: '', albumArtist: '', genre: '', year: 0, no: 0, disc: 0 };
    for (const k in extra) if (extra[k] || extra[k] === 0 && !(k in t)) t[k] = extra[k];
    if (t.uri) {
      t.key = t.uri;
    } else if (t.path) {
      t.key = t.path;
      const parts = t.path.split(/[\\/]/);
      t.folder = parts.slice(0, -1).join('/');
    } else {
      t.key = name + ':' + (t.file ? t.file.size : 0);
      const rel = t.file && t.file.webkitRelativePath;
      t.folder = rel && rel.includes('/') ? rel.split('/').slice(0, -1).join('/') : '';
    }
    return t;
  }

  // Когда трек впервые появился в медиатеке — для умных плейлистов «добавлен за N дней».
  // Всё, что было до появления этой функции (первые 2 минуты первого запуска), считаем давним.
  let seen = {}, seenFresh = false, seenT = 0;
  try { const raw = localStorage.getItem('squad.seen'); if (raw) seen = JSON.parse(raw) || {}; else seenFresh = true; } catch (_) {}
  const seenStart = Date.now();
  function markSeen(list) {
    const now = Date.now(), old = seenFresh && now - seenStart < 120000;
    let ch = false;
    for (const t of list) if (seen[t.key] == null) { seen[t.key] = old ? 0 : now; ch = true; }
    if (!ch) return;
    clearTimeout(seenT);
    seenT = setTimeout(() => {
      const ks = Object.keys(seen);
      if (ks.length > 30000) ks.forEach((k) => { if (!byKey.has(k)) delete seen[k]; });
      try { localStorage.setItem('squad.seen', JSON.stringify(seen)); } catch (_) {}
    }, 1500);
  }

  function addTracks(list, quiet) {
    let added = 0;
    const fresh = [];
    for (const t of list) {
      if (byKey.has(t.key)) continue;
      byKey.set(t.key, t);
      tracks.push(t);
      fresh.push(t);
      added++;
    }
    markSeen(fresh);
    if (qpos < 0 && tracks.length) { buildQueue(tracks.map((t) => t.key), 0); showMeta(); }
    renderLib();
    saveLibrary();
    if (added && !quiet) toast('Добавлено: ' + tracksWord(added));
    scanMeta();
    return added;
  }

  function addFiles(fileList) {
    const files = Array.from(fileList).filter((f) => (f.type && f.type.startsWith('audio/')) || AUDIO_RE.test(f.name));
    files.sort((a, b) => cmp(a.webkitRelativePath || a.name, b.webkitRelativePath || b.name));
    addTracks(files.map((f) => makeTrack(f.name, { file: f })));
  }

  function addPaths(paths) {
    addTracks(paths.filter((p) => AUDIO_RE.test(p)).map((p) => makeTrack(p.split(/[\\/]/).pop(), { path: p })));
  }

  // Убранные вручную треки автопоиск больше не возвращает (до ручного «Найти музыку»)
  const hideKeys = (keys) => {
    const h = new Set(store.get('hidden', []));
    keys.forEach((k) => h.add(k));
    store.set('hidden', Array.from(h));
  };

  const removeTrack = (key, gone) => removeTracks([key], gone);

  // Удаление пачкой: один проход по спискам и одна перерисовка, а не по разу на каждый трек.
  // keepCache — не трогать кэш Telegram (при выходе он очищается целиком)
  function removeTracks(keys, gone, keepCache) {
    const del = new Set(keys.filter((k) => byKey.has(k)));
    if (!del.size) return;
    const hide = [];
    let wasCurrent = false;
    for (const key of del) {
      const t = byKey.get(key);
      if (!gone && (t.path || t.uri || t.tg)) hide.push(key);
      if (t.tg && window.SquadTG && !keepCache) SquadTG.uncache(key); // скачанный файл тоже удаляем
      if (t.tg && t.tg.msg && window.SquadTG && SquadTG.forget) SquadTG.forget(key); // найденное в Telegram — из списка тоже
      if (t.web && window.SquadOnline) SquadOnline.remove(key);
      if (curTrack() === t) wasCurrent = true;
      byKey.delete(key);
    }
    if (hide.length) hideKeys(hide);
    tracks = tracks.filter((x) => !del.has(x.key));
    context = context.filter((k) => !del.has(k));
    let before = 0;
    queue.forEach((k, i) => { if (del.has(k) && i < qpos) before++; });
    queue = queue.filter((k) => !del.has(k));
    qpos = Math.min(qpos - before, queue.length - 1);
    if (pre && del.has(pre.key)) pre = null;
    if (wasCurrent) stopAll();
    renderLib();
    saveLibrary();
    showMeta();
  }

  // Удаление самого файла: Windows — в корзину, Android — системный запрос на удаление
  const canDeleteFile = (t) => !!((t.path && native && native.deleteFile) || (t.uri && scanner));

  async function deleteTrackFile(key) {
    const t = byKey.get(key);
    if (!t) return;
    if (t.path && !confirm('Удалить файл «' + t.name + '» с компьютера? Он попадёт в корзину.')) return;
    try {
      let ok;
      if (t.path) ok = await native.deleteFile(t.path);
      else ok = (await scanner('deleteFile', { uri: t.uri })).deleted;
      if (!ok) return; // отменили в системном окне
      removeTrack(key, true);
      toast('Файл удалён');
    } catch (e) {
      toast('Не удалось удалить файл: ' + ((e && e.message) || e));
    }
  }

  // ---------- Теги и обложки ----------
  async function sourceOf(t) {
    if (t.file) return SquadTags.fromBlob(t.file);
    if (t.web) return SquadTags.fromBlob(await SquadOnline.blob(t.key));
    if (t.tg) {
      const b = await tgCachedBlob(t);
      return b ? SquadTags.fromBlob(b) : null;
    }
    if (t.path && native && native.readRange) {
      const first = await native.readRange(t.path, 0, 65536);
      const head = new Uint8Array(first.data);
      return {
        size: first.size,
        read: async (s, l) => {
          if (s + l <= head.length) return head.subarray(s, s + l);
          const r = await native.readRange(t.path, s, l);
          return new Uint8Array(r.data);
        },
      };
    }
    return null;
  }

  function applyMeta(t, m) {
    for (const k of ['title', 'artist', 'album', 'albumArtist', 'genre', 'year', 'no', 'disc', 'thumb', 'accent', 'accent2']) {
      if (m[k]) t[k] = m[k];
    }
    t.metaDone = true;
    if (t === curTrack()) showMeta();
  }

  // Обложка с Android (MediaStore) → байты JPEG
  async function androidArt(t, size) {
    const r = await scanner('artwork', { uri: t.uri, albumId: t.albumId || 0, size });
    if (!r || !r.data) return null;
    const bin = atob(r.data.split(',')[1]);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    return { mime: 'image/jpeg', data, url: r.data };
  }

  // теги файла, поверх — правки пользователя (название, исполнитель, обложка из интернета)
  async function loadMeta(t) {
    await loadTags(t);
    const ed = await metaDb.get('edit:' + t.key);
    if (ed) { t.netArt = !!ed.art; applyMeta(t, ed); }
  }

  async function loadTags(t) {
    const cached = await metaDb.get(t.key);
    if (cached && cached.v === META_VER) { applyMeta(t, cached); return; }
    const m = { v: META_VER };
    let failed = false;
    try {
      if (t.uri && scanner) {
        const ci = await SquadTags.coverInfo(await androidArt(t, 160));
        if (ci) Object.assign(m, ci);
      }
      const src = t.uri ? null : await sourceOf(t);
      if (!src && t.tg) { t.metaDone = true; return; } // теги прочитаем после скачивания
      if (src) {
        const tags = await SquadTags.read(src);
        for (const k of ['title', 'artist', 'album', 'albumArtist', 'genre', 'year', 'no', 'disc']) if (tags[k]) m[k] = tags[k];
        const ci = await SquadTags.coverInfo(tags.picture);
        if (ci) Object.assign(m, ci);
      }
    } catch (e) {
      console.warn('Теги:', t.name, e);
      failed = true;
    }
    if (!failed) metaDb.put(t.key, m); // ошибку чтения не запоминаем навсегда
    applyMeta(t, m);
  }

  let scanning = false;
  async function scanMeta() {
    if (scanning) return;
    scanning = true;
    try {
      do {
        for (let i = 0; i < tracks.length; i++) {
          const t = tracks[i];
          if (t.metaDone) continue;
          await loadMeta(t);
          scheduleRender();
        }
      } while (tracks.some((t) => !t.metaDone));
    } finally {
      scanning = false;
    }
  }

  // Полноразмерная обложка: blob:/data: адрес или null (blob: освобождает вызывающий)
  async function fullArt(t) {
    if (!t.thumb) return null;
    if (t.netArt) {
      const ed = await metaDb.get('edit:' + t.key);
      return ed && ed.art ? URL.createObjectURL(new Blob([ed.art.data], { type: ed.art.mime })) : null;
    }
    if (t.uri && scanner) {
      const art = await androidArt(t, 800);
      return art ? art.url : null;
    }
    const src = await sourceOf(t);
    const tags = src ? await SquadTags.read(src) : {};
    return tags.picture ? URL.createObjectURL(new Blob([tags.picture.data], { type: tags.picture.mime })) : null;
  }

  // Полноразмерная обложка для экрана «Сейчас играет»
  let coverUrl = null, coverFor = null;
  async function loadFullCover(t) {
    if (coverFor === t.key) return;
    coverFor = t.key;
    if (coverUrl) { URL.revokeObjectURL(coverUrl); coverUrl = null; }
    if (!t.thumb) return;
    try {
      const u = await fullArt(t);
      if (!u) return;
      if (coverFor !== t.key) { if (u.startsWith('blob:')) URL.revokeObjectURL(u); return; }
      if (u.startsWith('blob:')) coverUrl = u;
      $('cover-img').src = u;
    } catch (_) {}
  }

  // ---------- Медиатека: вкладки, группы, сортировка ----------
  const GROUP_TABS = {
    artists: { key: (t) => t.artist, none: 'Неизвестный исполнитель' },
    albums: { key: (t) => (t.album ? t.album + '\u0001' + (t.albumArtist || t.artist) : ''), none: 'Без альбома' },
    genres: { key: (t) => t.genre, none: 'Без жанра' },
    folders: { key: (t) => t.folder, none: 'Без папки' },
  };
  const groupLabel = (tab, key) => {
    if (!key) return { name: GROUP_TABS[tab].none, sub: '' };
    if (tab === 'albums') { const [a, b] = key.split('\u0001'); return { name: a, sub: b }; }
    if (tab === 'folders') { const parts = key.split(/[\\/]/); return { name: parts.pop() || key, sub: parts.slice(-2).join('/') }; }
    return { name: key, sub: '' };
  };
  const SORTS = {
    added: ['По добавлению', null],
    title: ['По названию', (a, b) => cmp(a.title, b.title)],
    artist: ['По исполнителю', (a, b) => cmp(a.artist, b.artist) || cmp(a.album, b.album) || (a.disc - b.disc) || (a.no - b.no) || cmp(a.title, b.title)],
    album: ['По альбому', (a, b) => cmp(a.album, b.album) || (a.disc - b.disc) || (a.no - b.no) || cmp(a.title, b.title)],
    year: ['По году', (a, b) => (b.year - a.year) || cmp(a.album, b.album) || (a.no - b.no)],
    name: ['По имени файла', (a, b) => cmp(a.name, b.name)],
  };
  const inGroupSort = { artists: SORTS.album[1], albums: SORTS.album[1], genres: SORTS.artist[1], folders: SORTS.name[1] };

  const matches = (t, q) => !q || (t.title + ' ' + t.artist + ' ' + t.album + ' ' + t.name).toLowerCase().includes(q);

  // Текущий список в медиатеке: [{t, pos}] — pos = позиция в очереди/плейлисте/списке
  let items = [];
  function viewItems(q) {
    const tab = view.tab;
    if (tab === 'queue') {
      return queue.map((k, pos) => ({ t: byKey.get(k), pos })).filter((x) => x.t && matches(x.t, q));
    }
    if (tab === 'playlists') {
      const pl = playlists.find((p) => p.id === view.group);
      if (!pl) return [];
      if (pl.smart) refreshSmart();
      return pl.keys.map((k, pos) => ({ t: byKey.get(k), pos })).filter((x) => x.t && matches(x.t, q));
    }
    let list = tab === 'telegram' ? tracks.filter((t) => t.tg) : tab === 'online' ? tracks.filter((t) => t.web) : tracks;
    if (GROUP_TABS[tab]) {
      list = tracks.filter((t) => (GROUP_TABS[tab].key(t) || '') === view.group).sort(inGroupSort[tab]);
    } else if (SORTS[settings.sort] && SORTS[settings.sort][1]) {
      list = list.slice().sort(SORTS[settings.sort][1]);
    }
    return list.filter((t) => matches(t, q)).map((t, pos) => ({ t, pos }));
  }

  function artHtml(t, letter) {
    if (t.thumb) return '<div class="t-art"><img loading="lazy" decoding="async" alt="" src="' + esc(t.thumb) + '"></div>';
    const h = hueOf(t.artist + t.title);
    return '<div class="t-art" style="background:linear-gradient(135deg,hsl(' + h + ',70%,50%),hsl(' + ((h + 50) % 360) + ',80%,40%))">' + (letter || '') + '</div>';
  }

  function setHead(html) { $('lib-head').innerHTML = html; }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let renderT = null, lastRender = 0;
  function scheduleRender() {
    if (renderT) return;
    const wait = Math.max(0, (tracks.length > 800 ? 2000 : 500) - (Date.now() - lastRender));
    renderT = setTimeout(() => { renderT = null; renderLib(); }, wait);
  }

  // перерисовка того же списка (например, при смене трека) не должна кидать прокрутку наверх:
  // innerHTML = '' на миг обнуляет высоту списка, и браузер сбрасывает scrollTop
  function renderLib() {
    const panel = $('panel-library'), y = panel.scrollTop;
    const same = view.tab + '\u0002' + view.group === renderLib.vkey;
    renderList();
    if (same && panel.scrollTop !== y) panel.scrollTop = y;
  }
  function renderList() {
    if (drag) { renderLib.pending = true; return; } // перерисовка посреди перетаскивания задвоит строки
    renderLib.pending = false;
    lastRender = Date.now();
    emitApp('library');
    renderLib.gen = (renderLib.gen || 0) + 1;
    const q = $('search').value.trim().toLowerCase();
    const tab = view.tab;
    const ol = $('tracklist');
    ol.innerHTML = '';
    // анимация появления строк — только при смене вкладки/группы, а не на каждую перерисовку
    const vkey = tab + '\u0002' + view.group;
    const fresh = vkey !== renderLib.vkey;
    ol.classList.toggle('md-enter', fresh);
    renderLib.vkey = vkey;
    document.querySelectorAll('#lib-tabs .chip').forEach((b) => b.classList.toggle('on', b.dataset.lib === tab));
    $('empty').classList.toggle('hidden', tracks.length > 0 || tab === 'playlists' || tab === 'telegram' || tab === 'online');
    $('search').placeholder = tab === 'online' ? (tgFind() ? 'Найти трек в Telegram и открытых источниках (Enter)' : 'Найти трек в открытых источниках (Enter)') : 'Поиск по трекам';
    const frag = document.createDocumentFragment();
    const cur = curTrack();
    items = [];

    // Список групп (исполнители, альбомы, жанры, папки)
    if (GROUP_TABS[tab] && view.group == null) {
      const groups = new Map();
      for (const t of tracks) {
        const k = GROUP_TABS[tab].key(t) || '';
        let g = groups.get(k);
        if (!g) groups.set(k, (g = { key: k, n: 0, thumb: null, t }));
        g.n++;
        if (!g.thumb && t.thumb) { g.thumb = t.thumb; g.t = t; }
      }
      const list = Array.from(groups.values())
        .map((g) => Object.assign(g, groupLabel(tab, g.key)))
        .filter((g) => !q || (g.name + ' ' + g.sub).toLowerCase().includes(q))
        .sort((a, b) => (!a.key) - (!b.key) || cmp(a.name, b.name));
      setHead(tracks.length ? '<div class="lh-title">' + esc({ artists: 'Исполнители', albums: 'Альбомы', genres: 'Жанры', folders: 'Папки' }[tab]) +
        ' <span class="lh-sub">' + list.length + '</span></div>' : '');
      for (const g of list) {
        const li = document.createElement('li');
        li.className = 'track group-row';
        li.dataset.group = g.key;
        li.innerHTML = artHtml(g.thumb ? g.t : { title: g.name, artist: '' }) +
          '<div class="t-info"><div class="t-title"></div><div class="t-artist"></div></div><span class="chev">›</span>';
        if (!g.thumb) li.querySelector('.t-art').textContent = (g.name[0] || '?').toUpperCase();
        li.querySelector('.t-title').textContent = g.name;
        li.querySelector('.t-artist').textContent = (g.sub ? g.sub + ' · ' : '') + tracksWord(g.n);
        frag.appendChild(li);
      }
      ol.appendChild(frag);
      return;
    }

    // Список плейлистов
    if (tab === 'playlists' && view.group == null) {
      refreshSmart();
      setHead('<div class="lh-title">Плейлисты <span class="lh-sub">' + playlists.length + '</span></div>' +
        '<button class="btn primary" data-act="pl-new">＋ Новый плейлист</button><button class="btn" data-act="pl-smart" title="Плейлист, который собирается сам по правилам">＋ Умный</button>');
      for (const pl of playlists) {
        if (q && !pl.name.toLowerCase().includes(q)) continue;
        const present = pl.keys.map((k) => byKey.get(k)).filter(Boolean);
        const withArt = present.find((t) => t.thumb);
        const li = document.createElement('li');
        li.className = 'track group-row';
        li.dataset.group = pl.id;
        li.innerHTML = artHtml(withArt || { title: pl.name, artist: '' }) +
          '<div class="t-info"><div class="t-title"></div><div class="t-artist"></div></div><span class="chev">›</span>';
        if (!withArt) li.querySelector('.t-art').textContent = '♫';
        li.querySelector('.t-title').textContent = pl.name;
        li.querySelector('.t-artist').textContent = (pl.smart ? 'Умный · ' : '') + tracksWord(present.length) +
          (present.length < pl.keys.length ? ' · ещё ' + (pl.keys.length - present.length) + ' не добавлено' : '');
        frag.appendChild(li);
      }
      if (!playlists.length) {
        const li = document.createElement('li');
        li.className = 'hint pad';
        li.textContent = 'Плейлистов пока нет. Создайте плейлист или добавьте трек через меню ⋮.';
        frag.appendChild(li);
      }
      ol.appendChild(frag);
      return;
    }

    // Telegram: вход, выбор чатов
    if (tab === 'telegram' && renderTg(ol, q)) return;
    if (tab === 'online' && renderWeb(ol)) return;

    // Список треков
    items = viewItems(q);
    const reorder = !q && (tab === 'queue' || (tab === 'playlists' && !((playlists.find((p) => p.id === view.group) || {}).smart)));
    const total = items.length;
    if (tab === 'tracks') {
      setHead('<div class="lh-title">Все треки <span class="lh-sub">' + total + '</span></div>' +
        '<select class="select" id="sort-sel">' + Object.entries(SORTS).map(([k, [n]]) =>
          '<option value="' + k + '"' + (k === settings.sort ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>' +
        (total ? '<button class="btn" data-act="play-all">▶ Все</button><button class="btn" data-act="shuffle-all">⤮</button>' : ''));
    } else if (tab === 'telegram') {
      setHead(tgHead(total));
    } else if (tab === 'online') {
      setHead('<div class="lh-title">Онлайн <span class="lh-sub">' + tracksWord(total) + '</span></div>' +
        (total ? '<button class="btn" data-act="play-all">▶</button><button class="btn" data-act="shuffle-all">⤮</button>' : ''));
    } else if (tab === 'queue') {
      setHead('<div class="lh-title">Очередь <span class="lh-sub">' + (qpos >= 0 ? (qpos + 1) + ' из ' : '') + queue.length + '</span></div>' +
        (queue.length > qpos + 1 ? '<button class="btn ghost" data-act="queue-clear">Очистить дальше</button>' : ''));
    } else {
      let title, sub = '', extra = '';
      if (tab === 'playlists') {
        const pl = playlists.find((p) => p.id === view.group);
        title = pl ? pl.name : '';
        extra = (pl && pl.smart ? '<button class="btn ghost" data-act="pl-rules">Правила</button>' : '<button class="btn ghost" data-act="pl-rename">Переименовать</button>') +
          '<button class="btn ghost" data-act="pl-delete">Удалить</button>';
      } else {
        const l = groupLabel(tab, view.group);
        title = l.name; sub = l.sub;
      }
      setHead('<button class="icon-btn" data-act="back" title="Назад">‹</button>' +
        '<div class="lh-title">' + esc(title) + ' <span class="lh-sub">' + esc(sub ? sub + ' · ' : '') + tracksWord(total) + '</span></div>' +
        (total ? '<button class="btn" data-act="play-all">▶</button><button class="btn" data-act="shuffle-all">⤮</button>' : '') + extra);
    }

    // Строки собираем одной HTML-строкой: на тысячах треков это в разы быстрее, чем createElement на каждую
    const tail = '<div class="eqbars"><i></i><i></i><i></i></div><button class="t-more" title="Ещё">⋮</button>' +
      (reorder ? '<span class="t-handle" title="Перетащить">≡</span>' : '') + '</li>';
    const rows = new Array(items.length);
    items.forEach((it, idx) => {
      const t = it.t;
      const playing = tab === 'queue' ? it.pos === qpos : t === cur;
      rows[idx] = '<li class="track' + (playing ? ' playing' : '') + (tab === 'queue' && it.pos < qpos ? ' done' : '') + '" data-idx="' + idx + '">' +
        artHtml(t, esc((t.title[0] || '?').toUpperCase())) +
        '<div class="t-info"><div class="t-title">' + esc(t.title) + '</div><div class="t-artist">' +
        esc(t.artist + (t.album && tab !== 'albums' ? ' · ' + t.album : '')) + '</div></div>' + tail;
    });
    // первый экран — сразу, остальное следующим кадром, чтобы переключение вкладок не подвисало.
    // Перерисовка того же списка (смена трека) — целиком сразу: иначе список на миг короче и прокрутку кидает наверх
    const gen = renderLib.gen = (renderLib.gen || 0) + 1;
    const FIRST = fresh ? 80 : rows.length;
    ol.insertAdjacentHTML('beforeend', rows.slice(0, FIRST).join(''));
    if (rows.length > FIRST) setTimeout(() => { if (renderLib.gen === gen) ol.insertAdjacentHTML('beforeend', rows.slice(FIRST).join('')); }, 0);
    if (!items.length && (tracks.length || tab === 'telegram' || tab === 'online')) {
      const li = document.createElement('li');
      li.className = 'hint pad';
      li.textContent = tab === 'online' ? (q ? 'Нажмите Enter, чтобы искать «' + $('search').value.trim() + '» в открытых источниках'
        : 'Введите название трека или исполнителя в поиске выше и нажмите Enter. Ищем по открытым источникам с лицензиями Creative Commons: Jamendo, Wikimedia, Freesound, ccMixter.')
        : q ? 'Ничего не найдено' : tab === 'telegram'
        ? (tgBusy ? 'Загружаю музыку из профиля…' : 'В профиле Telegram пока нет музыки. Добавьте песни в свой профиль в Telegram и нажмите ⟳.') : tab === 'playlists' ? ((playlists.find((p) => p.id === view.group) || {}).smart ? 'Под правила пока ничего не подходит. Нажмите «Правила», чтобы их изменить.' : 'Плейлист пуст. Добавляйте треки через меню ⋮.') : 'Пусто';
      frag.appendChild(li);
    }
    ol.appendChild(frag);
    ol.classList.toggle('paused', A().paused);
  }

  function openLib(tab, group) {
    view = { tab, group: group === undefined ? null : group };
    settings.libTab = tab; saveSettings();
    $('search').value = '';
    showTab('library');
    renderLib();
    $('panel-library').scrollTop = 0;
  }

  $('lib-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (b) openLib(b.dataset.lib);
  });

  $('lib-head').addEventListener('change', (e) => {
    if (e.target.id === 'sort-sel') { settings.sort = e.target.value; saveSettings(); renderLib(); }
  });

  $('lib-head').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const pl = playlists.find((p) => p.id === view.group);
    if (act === 'back') { view.group = null; renderLib(); }
    else if (act.startsWith('tg-')) tgAction(act);
    else if (act === 'web-back') { onl.results = null; onl.q = ''; $('search').value = ''; renderLib(); }
    else if (act === 'play-all' || act === 'shuffle-all') {
      if (!items.length) return;
      if (act === 'shuffle-all' && !settings.shuffle) { settings.shuffle = true; syncModes(); saveSettings(); }
      const keys = items.map((x) => x.t.key);
      buildQueue(keys, act === 'shuffle-all' ? Math.floor(Math.random() * keys.length) : 0);
      playAt(qpos);
    } else if (act === 'queue-clear') {
      queue = queue.slice(0, qpos + 1); renderLib(); emitApp('queue'); toast('Очередь очищена');
    } else if (act === 'pl-new') {
      const name = await askText('Новый плейлист', 'Плейлист ' + (playlists.length + 1));
      if (name) { const p = newPlaylist(name); openLib('playlists', p.id); }
    } else if (act === 'pl-smart') {
      smartDialog(null);
    } else if (act === 'pl-rules' && pl) {
      smartDialog(pl);
    } else if (act === 'pl-rename' && pl) {
      const name = await askText('Переименовать плейлист', pl.name);
      if (name) { pl.name = name; savePlaylists(); renderLib(); }
    } else if (act === 'pl-delete' && pl) {
      if (!confirm('Удалить плейлист «' + pl.name + '»? Треки останутся в медиатеке.')) return;
      playlists = playlists.filter((p) => p !== pl); savePlaylists();
      view.group = null; renderLib();
    }
  });

  $('tracklist').addEventListener('click', (e) => {
    const g = e.target.closest('.group-row');
    if (g) { view.group = g.dataset.group; renderLib(); $('panel-library').scrollTop = 0; return; }
    const li = e.target.closest('.track');
    if (!li || li.dataset.idx == null) return;
    const it = items[+li.dataset.idx];
    if (!it) return;
    if (e.target.closest('.t-handle')) return;
    if (e.target.closest('.t-more')) { trackMenu(it, e.target.closest('.t-more')); return; }
    if (view.tab === 'queue') {
      if (it.pos === qpos && A().src) togglePlay(); else playAt(it.pos);
      return;
    }
    if (it.t === curTrack() && A().src) { togglePlay(); return; }
    buildQueue(items.map((x) => x.t.key), +li.dataset.idx);
    playAt(qpos);
  });

  // Перетаскивание в очереди и плейлистах (мышь и палец)
  let drag = null;
  $('tracklist').addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.t-handle');
    if (!h) return;
    e.preventDefault();
    const li = h.closest('.track');
    drag = { li, id: e.pointerId };
    li.classList.add('dragging');
    try { h.setPointerCapture(e.pointerId); } catch (_) {}
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const ol = $('tracklist');
    let before = null;
    for (const it of ol.children) {
      if (it === drag.li) continue;
      const r = it.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { before = it; break; }
    }
    if (before !== drag.li.nextSibling) ol.insertBefore(drag.li, before);
    const panel = $('panel-library').getBoundingClientRect();
    if (e.clientY < panel.top + 60) $('panel-library').scrollTop -= 12;
    else if (e.clientY > panel.bottom - 60) $('panel-library').scrollTop += 12;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.li.classList.remove('dragging');
    const lost = !drag.li.isConnected;
    drag = null;
    if (lost) { renderLib(); return; }
    const order = Array.from($('tracklist').children).map((li) => items[+li.dataset.idx]).filter(Boolean).map((it) => it.pos);
    if (view.tab === 'queue') {
      const cur = qpos;
      const old = queue;
      if (order.length !== old.length) { renderLib(); return; }
      queue = order.map((p) => old[p]);
      qpos = order.indexOf(cur);
      emitApp('queue');
    } else if (view.tab === 'playlists') {
      const pl = playlists.find((p) => p.id === view.group);
      if (pl) {
        const seen = new Set(order);
        pl.keys = order.map((p) => pl.keys[p]).concat(pl.keys.filter((_, i) => !seen.has(i)));
        savePlaylists();
      }
    }
    renderLib();
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // ---------- Меню и диалог ----------
  const menu = $('menu');
  function openMenu(anchor, title, list) {
    menu.innerHTML = '';
    if (title) { const d = document.createElement('div'); d.className = 'm-title'; d.textContent = title; menu.appendChild(d); }
    for (const it of list) {
      if (!it) continue;
      const b = document.createElement('button');
      b.textContent = it.label;
      if (it.danger) b.className = 'danger';
      b.onclick = (e) => { e.stopPropagation(); if (!it.keep) closeMenu(); it.act(); };
      menu.appendChild(b);
    }
    menu.classList.add('show');
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8)) + 'px';
    menu.style.top = (r.bottom + mh + 8 > window.innerHeight ? Math.max(8, r.top - mh - 4) : r.bottom + 4) + 'px';
  }
  function closeMenu() { menu.classList.remove('show'); }
  document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target)) closeMenu(); }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  function askText(title, value) {
    return new Promise((resolve) => {
      const wrap = $('dialog');
      const input = $('dialog-input');
      $('dialog-title').textContent = title;
      input.value = value || '';
      wrap.classList.add('show');
      setTimeout(() => { input.focus(); input.select(); }, 30);
      const done = (v) => {
        wrap.classList.remove('show');
        $('dialog-ok').onclick = $('dialog-cancel').onclick = input.onkeydown = null;
        resolve(v);
      };
      $('dialog-ok').onclick = () => done(input.value.trim() || null);
      $('dialog-cancel').onclick = () => done(null);
      input.onkeydown = (e) => {
        if (e.key === 'Enter') done(input.value.trim() || null);
        else if (e.key === 'Escape') done(null);
      };
    });
  }

  function newPlaylist(name) {
    const p = { id: 'pl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, keys: [] };
    playlists.push(p);
    savePlaylists();
    return p;
  }

  function addToPlaylist(pl, t) {
    if (pl.keys.includes(t.key)) { toast('Уже в «' + pl.name + '»'); return; }
    pl.keys.push(t.key);
    savePlaylists();
    toast('Добавлено в «' + pl.name + '»');
    if (view.tab === 'playlists') renderLib();
  }

  function playlistMenu(anchor, t) {
    openMenu(anchor, 'В плейлист', playlists.filter((pl) => !pl.smart).map((pl) => ({ label: pl.name, act: () => addToPlaylist(pl, t) })).concat([{
      label: '＋ Новый плейлист…',
      act: async () => {
        const name = await askText('Новый плейлист', 'Плейлист ' + (playlists.length + 1));
        if (name) addToPlaylist(newPlaylist(name), t);
      },
    }]));
  }

  function trackMenu(it, anchor) {
    const t = it.t;
    const albumKey = GROUP_TABS.albums.key(t);
    openMenu(anchor, t.title, [
      { label: 'Играть следующим', act: () => playNext(t.key) },
      { label: 'Добавить в очередь', act: () => enqueue(t.key) },
      { label: 'Добавить в плейлист…', keep: true, act: () => playlistMenu(anchor, t) },
      view.tab === 'playlists' && view.group && !(playlists.find((p) => p.id === view.group) || {}).smart ? {
        label: 'Убрать из плейлиста',
        act: () => {
          const pl = playlists.find((p) => p.id === view.group);
          if (pl) { pl.keys.splice(it.pos, 1); savePlaylists(); renderLib(); }
        },
      } : null,
      view.tab === 'queue' && it.pos !== qpos ? { label: 'Убрать из очереди', act: () => removeFromQueue(it.pos) } : null,
      t.artist && !(view.tab === 'artists' && view.group) ? { label: 'Исполнитель: ' + t.artist, act: () => openLib('artists', t.artist) } : null,
      albumKey && !(view.tab === 'albums' && view.group) ? { label: 'Альбом: ' + t.album, act: () => openLib('albums', albumKey) } : null,
      { label: 'Название, исполнитель, обложка…', act: () => editTrack(t) },
      window.SquadShare ? { label: 'Поделиться картинкой…', act: () => SquadShare.open(t) } : null,
      t.tg ? { label: 'Скачать на устройство', act: () => tgDownload(t) } : null,
      canDeleteFile(t) ? { label: 'Удалить с устройства', danger: true, act: () => deleteTrackFile(t.key) } : null,
      { label: 'Убрать из медиатеки', danger: !canDeleteFile(t), act: () => removeTrack(t.key) },
    ]);
  }

  // ---------- Очередь ----------
  function buildQueue(keys, start) {
    context = keys.slice();
    if (settings.shuffle && keys.length > 1) {
      const first = keys[start];
      queue = [first].concat(shuffleArr(keys.filter((_, i) => i !== start)));
      qpos = 0;
    } else {
      queue = keys.slice();
      qpos = Math.max(0, start);
    }
  }

  let userQueued = false;
  function playNext(key) {
    userQueued = true;
    if (qpos < 0) { queue = [key]; qpos = 0; playAt(0); return; }
    queue.splice(qpos + 1, 0, key);
    toast('Будет следующим');
    emitApp('queue');
    if (view.tab === 'queue') renderLib();
  }

  function enqueue(key) {
    userQueued = true;
    if (qpos < 0) { queue = [key]; qpos = 0; playAt(0); return; }
    queue.push(key);
    toast('Добавлено в очередь');
    emitApp('queue');
    if (view.tab === 'queue') renderLib();
  }

  function removeFromQueue(pos) {
    if (pos === qpos || pos < 0 || pos >= queue.length) return;
    queue.splice(pos, 1);
    if (pos < qpos) qpos--;
    renderLib();
    emitApp('queue');
  }

  // перенести трек очереди с позиции from на to (текущий трек не двигаем)
  function moveInQueue(from, to) {
    if (from === to || from === qpos || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;
    const [k] = queue.splice(from, 1);
    queue.splice(to, 0, k);
    if (from < qpos && to >= qpos) qpos--;
    else if (from > qpos && to <= qpos) qpos++;
    emitApp('queue');
    if (view.tab === 'queue') renderLib();
  }

  // auto = переход по окончании трека (учитывает «повтор выкл»)
  function nextPos(auto) {
    if (!queue.length) return -1;
    if (qpos + 1 < queue.length) return qpos + 1;
    return settings.repeat === 'all' || !auto ? 0 : -1;
  }

  // ---------- Воспроизведение (две деки: кроссфейд и без пауз) ----------
  const deckUrls = [null, null];
  let pre = null;       // {pos, key} — что заранее загружено в свободную деку
  let fading = false;
  let fadeUntil = 0;
  let playToken = 0;

  async function srcFor(t) {
    if (t.file) return URL.createObjectURL(t.file);
    if (t.tg) return URL.createObjectURL(await tgBlob(t, t === curTrack()));
    if (t.web) return URL.createObjectURL(await SquadOnline.blob(t.key));
    if (t.uri && cap && cap.convertFileSrc) {
      // content:// отдаём через локальный сервер Capacitor целиком: blob нормально перематывается
      const r = await fetch(cap.convertFileSrc(t.uri));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return URL.createObjectURL(await r.blob());
    }
    if (t.path && native) {
      const data = await native.readFile(t.path);
      return URL.createObjectURL(new Blob([data]));
    }
    throw new Error('Файл недоступен');
  }

  // ---------- Одинаковая громкость треков ----------
  // Меряем громкость самой записи (до эквалайзера и эффектов) за время игры и запоминаем по треку.
  // Трек, который ещё не мерили, начинает со средней громкости уже измеренных и подстраивается за первые секунды.
  const NORM_TARGET = -14; // дБ RMS, к ним подтягиваем
  let loud = {};
  try { loud = JSON.parse(localStorage.getItem('squad.loud') || '{}') || {}; } catch (_) {}
  const meas = decks.map(() => ({ key: '', sum: 0, n: 0 }));
  let loudSaveT = 0;
  function saveLoud() {
    clearTimeout(loudSaveT);
    loudSaveT = setTimeout(() => {
      const ks = Object.keys(loud);
      for (let i = 0; i < ks.length - 5000; i++) delete loud[ks[i]]; // старые замеры вытесняются
      try { localStorage.setItem('squad.loud', JSON.stringify(loud)); } catch (_) {}
    }, 2000);
  }
  function loudAvg() {
    const v = Object.values(loud);
    return v.length >= 3 ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  function normGain(i) {
    const key = decks[i].dataset.key;
    if (!settings.normalize || !key) return 1;
    const m = meas[i];
    const db = loud[key] != null ? loud[key] : m.key === key && m.n >= 20 ? 10 * Math.log10(m.sum / m.n) : loudAvg();
    if (db == null || !isFinite(db)) return 1;
    // только убавляем: подъём громкости упирал пики в лимитер, и звук «резало»
    const g = Math.max(-12, Math.min(0, NORM_TARGET - db));
    return Math.pow(10, g / 20);
  }
  // на деку пришёл другой трек: замер прежнего (если набралось ~10 с звука) запоминаем, счётчик — с нуля
  function flushMeas(i) {
    const m = meas[i];
    if (m.key && m.n >= 50 && loud[m.key] == null) { loud[m.key] = Math.round(10 * Math.log10(m.sum / m.n) * 10) / 10; saveLoud(); }
    m.key = ''; m.sum = 0; m.n = 0;
  }
  const normDeck = (i, sec) => engine.setNorm(i, normGain(i), sec);
  function normAll(sec) { decks.forEach((_, i) => normDeck(i, sec)); }
  setInterval(() => {
    if (!settings.normalize || !engine.nodes) return;
    decks.forEach((d, i) => {
      const key = d.dataset.key;
      const m = meas[i];
      if (d.paused && m.n >= 50) flushMeas(i); // трек остановился или ушёл в соседнюю деку — замер готов
      if (!key || d.paused || loud[key] != null) return;
      if (m.key !== key) { flushMeas(i); m.key = key; }
      const v = engine.level(i);
      if (!(v > 1e-5)) return; // тишину (-50 дБ и ниже) не считаем
      m.sum += v; m.n++;
      if (m.n === 20 || m.n % 50 === 0) normDeck(i, 3); // первые ~4 с, потом уточняем каждые ~10 с
      if (m.n >= 300) { loud[key] = Math.round(10 * Math.log10(m.sum / m.n) * 10) / 10; saveLoud(); } // ~минута — хватит
    });
  }, 200);

  // Поколение загрузки на каждую деку: опоздавшая загрузка (долгое скачивание) не перезапишет то, что уже играет
  const deckGen = [0, 0];
  async function loadDeck(deck, t) {
    const i = decks.indexOf(deck);
    const gen = ++deckGen[i];
    const url = await srcFor(t);
    if (gen !== deckGen[i]) { URL.revokeObjectURL(url); throw new DOMException('Загрузка устарела', 'AbortError'); }
    if (deckUrls[i]) URL.revokeObjectURL(deckUrls[i]);
    deckUrls[i] = url;
    flushMeas(i);
    deck.dataset.key = t.key;
    deck.src = url;
    normDeck(i, 0);
  }

  const preReady = (pos) => pre && pre.pos === pos && pre.key === queue[pos] && engine.idle && engine.idle.dataset.key === pre.key;

  function preload(pos) {
    const t = byKey.get(queue[pos]);
    const idle = engine.idle;
    if (!t || !idle) return;
    pre = { pos, key: t.key, failed: false };
    const mine = pre;
    idle.pause();
    loadDeck(idle, t).catch((e) => { if (pre === mine && !(e && e.name === 'AbortError')) mine.failed = true; });
  }

  function stopAll() {
    playToken++;
    deckGen[0]++; deckGen[1]++;
    decks.forEach((d) => { d.pause(); d.removeAttribute('src'); d.dataset.key = ''; d.load(); });
    deckUrls.forEach((u, i) => { if (u) URL.revokeObjectURL(u); deckUrls[i] = null; }); // отпускаем память под файлы
    pre = null; fading = false;
    setPlayingUI();
  }

  let skipped = 0; // сколько битых треков подряд пропущено при автопереходе
  // mode: 'cut' — сразу, 'gapless' — по окончании, 'fade' — кроссфейд
  async function playAt(pos, mode) {
    if (pos < 0 || pos >= queue.length) return;
    const t = byKey.get(queue[pos]);
    if (!t) return;
    const token = ++playToken;
    qpos = pos;
    showMeta();
    renderLib();
    settings.lastPath = t.path || t.uri || null;
    saveSettings();
    saveQueue();
    await engine.init().catch((e) => console.error(e));
    if (token !== playToken) return;
    if (engine.ctx && engine.ctx.state === 'suspended') engine.ctx.resume().catch(() => {});
    const old = engine.audio;
    const next = engine.nodes ? engine.idle || old : old; // без Web Audio — одна дека
    try {
      if (!(next !== old && preReady(pos))) {
        next.pause();
        await loadDeck(next, t);
        if (token !== playToken) return;
      }
      if (resumeAt) {
        if (resumeAt.key === t.key) try { next.currentTime = resumeAt.time; } catch (_) {}
        resumeAt = null;
      }
      pre = null;
      engine.apply('speed'); // playbackRate сбрасывается при смене src
      const p = next.play();
      if (next !== old) {
        if (mode === 'fade') {
          const len = settings.crossfade;
          engine.crossfade(len);
          fadeUntil = Date.now() + len * 1000;
          setTimeout(() => { if (engine.audio !== old) old.pause(); }, len * 1000 + 150);
        } else {
          engine.swap();
          old.pause();
        }
      }
      fading = false;
      await p;
      skipped = 0;
    } catch (e) {
      if (token !== playToken || (e && e.name === 'AbortError')) return;
      console.error(e);
      fading = false;
      toast('Не удалось открыть: ' + t.name);
      if (mode === 'gapless' || mode === 'fade') {
        skipped = (skipped || 0) + 1;
        const np = nextPos(true);
        if (np >= 0 && skipped < Math.min(queue.length, 20)) { setTimeout(() => playAt(np, 'gapless'), 300); return; }
      }
      skipped = 0;
    }
    setPlayingUI();
  }

  async function togglePlay() {
    if (!tracks.length) { $('btn-add-files').click(); return; }
    if (qpos < 0 || !queue.length) buildQueue(tracks.map((t) => t.key), 0);
    if (!A().src) { playAt(qpos); return; }
    await engine.init();
    if (engine.ctx.state === 'suspended') await engine.ctx.resume();
    if (A().paused) A().play();
    else decks.forEach((d) => d.pause());
  }

  function step(dir) {
    if (!queue.length) return;
    if (dir < 0 && A().currentTime > 3) { A().currentTime = 0; return; }
    let pos = dir > 0 ? nextPos(false) : qpos - 1;
    if (pos < 0) pos = queue.length - 1;
    playAt(pos);
  }

  const isActive = (e) => e.target === engine.audio;
  decks.forEach((d) => {
    d.addEventListener('ended', (e) => {
      if (!isActive(e)) return;
      if (sleepTrack) { sleepStop('Таймер сна: трек доиграл'); return; }
      if (settings.repeat === 'one') { A().currentTime = 0; A().play(); return; }
      const np = nextPos(true);
      if (np < 0) { setPlayingUI(); return; }
      playAt(np, 'gapless');
    });
    d.addEventListener('play', (e) => { if (isActive(e)) setPlayingUI(); });
    d.addEventListener('pause', (e) => { if (isActive(e)) setPlayingUI(); });
    d.addEventListener('error', (e) => {
      if (!isActive(e)) { pre = null; return; }
      if (A().src) toast('Формат не поддерживается');
    });
    d.addEventListener('timeupdate', onTime);
  });

  function setPlayingUI() {
    const playing = !A().paused;
    document.body.classList.toggle('is-playing', playing);
    $('tracklist').classList.toggle('paused', !playing);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    emitApp('play');
  }

  function applyAccent() {
    const t = curTrack();
    if (settings.coverAccent && t && t.accent) applyTheme(settings.theme, t.accent, t.accent2);
    else applyTheme(settings.theme, settings.accent);
  }

  function showMeta() {
    const t = curTrack();
    $('np-title').textContent = t ? t.title : 'Ничего не играет';
    $('np-artist').textContent = t ? t.artist + (t.album ? ' · ' + t.album : '') : 'Добавьте треки';
    $('mini-title').textContent = t ? t.title : '—';
    $('mini-artist').textContent = t ? t.artist : '';
    $('cover-letter').textContent = t ? (t.title[0] || 'S').toUpperCase() : 'S';
    const hasArt = !!(t && t.thumb);
    $('cover').classList.toggle('has-art', hasArt);
    $('mini').classList.toggle('has-art', hasArt);
    if (hasArt) {
      if (coverFor !== t.key) $('cover-img').src = t.thumb;
      $('mini-art').src = t.thumb;
      loadFullCover(t);
    } else {
      coverFor = null;
      if (coverUrl) { URL.revokeObjectURL(coverUrl); coverUrl = null; }
      $('cover-img').src = 'img/squad-logo.jpg';
      $('mini-art').removeAttribute('src');
    }
    document.title = t ? t.title + ' — SQUAD SOUND' : 'SQUAD SOUND';
    if (t && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.artist, album: t.album || 'SQUAD SOUND',
        artwork: [{ src: t.thumb || 'img/squad-logo.jpg', sizes: t.thumb ? '160x160' : '512x512', type: 'image/jpeg' }],
      });
    }
    applyAccent();
    updateMini();
    emitApp('track');
  }

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const h = (a, f) => { try { ms.setActionHandler(a, f); } catch (_) {} };
    h('play', () => { if (!A().src || A().paused) togglePlay(); });
    h('pause', () => decks.forEach((d) => d.pause()));
    h('previoustrack', () => step(-1)); h('nexttrack', () => step(1));
    h('seekto', (d) => { A().currentTime = d.seekTime; });
  }

  // ---------- Прогресс ----------
  const fmt = (s) => {
    if (!isFinite(s)) return '0:00';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec;
  };
  let seeking = false;
  function onTime(e) {
    if (!isActive(e)) return;
    const a = A();
    const d = a.duration || 0;
    if (!seeking) setRange($('seek'), d ? (a.currentTime / d) * 1000 : 0);
    $('t-cur').textContent = fmt(a.currentTime);
    $('t-dur').textContent = fmt(d);
    $('mini-progress').style.width = (d ? (a.currentTime / d) * 100 : 0) + '%';
    if (apkUI && !a.paused && Date.now() - (onTime.saved || 0) > 15000) { onTime.saved = Date.now(); saveQueueTime(); }
    if ('mediaSession' in navigator && d && navigator.mediaSession.setPositionState) {
      try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(a.currentTime, d), playbackRate: a.playbackRate }); } catch (_) {}
    }
    // Заранее грузим следующий трек и запускаем кроссфейд
    if (!isFinite(d) || !d || a.paused || settings.repeat === 'one' || sleepTrack || !engine.nodes) return;
    const np = nextPos(true);
    if (np < 0) return;
    const cf = settings.crossfade;
    const rem = (d - a.currentTime) / (a.playbackRate || 1);
    const started = pre && pre.pos === np && pre.key === queue[np]; // уже грузится, готово или не открылось
    if (rem < cf + 10 && !started && Date.now() > fadeUntil) preload(np);
    if (cf > 0 && !fading && !(started && pre.failed) && rem <= cf && d > cf * 2 + 1) { fading = true; playAt(np, 'fade'); }
  }
  $('seek').addEventListener('input', (e) => {
    seeking = true;
    paintRange(e.target);
    $('t-cur').textContent = fmt((e.target.value / 1000) * (A().duration || 0));
  });
  $('seek').addEventListener('change', (e) => {
    if (A().duration) A().currentTime = (e.target.value / 1000) * A().duration;
    seeking = false;
  });

  // ---------- Слайдеры ----------
  function paintRange(el) {
    const min = +el.min || 0, max = +el.max || 100;
    el.style.setProperty('--p', ((el.value - min) / (max - min)) * 100 + '%');
  }
  function setRange(el, v) { el.value = v; paintRange(el); }

  // ---------- Кнопки ----------
  $('btn-play').onclick = togglePlay;
  $('mini-play').onclick = togglePlay;
  $('btn-next').onclick = () => step(1);
  $('mini-next').onclick = () => step(1);
  $('btn-prev').onclick = () => step(-1);
  $('btn-shuffle').onclick = () => {
    settings.shuffle = !settings.shuffle;
    if (qpos >= 0) {
      if (settings.shuffle) {
        queue = queue.slice(0, qpos + 1).concat(shuffleArr(queue.slice(qpos + 1)));
      } else {
        const i = context.indexOf(queue[qpos]);
        if (i >= 0) { queue = context.slice(); qpos = i; }
      }
      pre = null;
    }
    syncModes(); saveSettings();
    if (view.tab === 'queue') renderLib();
    toast(settings.shuffle ? 'Перемешивание включено' : 'Перемешивание выключено');
  };
  $('btn-repeat').onclick = () => {
    settings.repeat = { off: 'all', all: 'one', one: 'off' }[settings.repeat];
    syncModes(); saveSettings();
    toast({ off: 'Повтор выключен', all: 'Повтор списка', one: 'Повтор трека' }[settings.repeat]);
  };
  function syncModes() {
    $('btn-shuffle').classList.toggle('on', settings.shuffle);
    $('btn-repeat').classList.toggle('on', settings.repeat !== 'off');
    $('repeat-one').classList.toggle('show', settings.repeat === 'one');
    emitApp('queue');
  }

  $('volume').addEventListener('input', (e) => { paintRange(e.target); engine.set('volume', +e.target.value); saveFx(); });
  $('np-queue').onclick = () => openLib('queue');
  $('np-playlist').onclick = (e) => { const t = curTrack(); if (t) playlistMenu(e.currentTarget, t); };

  $('btn-add-files').onclick = async () => {
    if (native) { addPaths(await native.pickFiles()); return; }
    $('file-input').click();
  };
  $('btn-add-folder').onclick = async () => {
    if (native) { addPaths(await native.pickFolder()); return; }
    $('folder-input').click();
  };
  $('file-input').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
  $('folder-input').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
  $('btn-clear').onclick = () => {
    if (!tracks.length || !confirm('Очистить медиатеку? Плейлисты сохранятся.' +
      (canScan ? ' Чтобы вернуть найденные треки, нажмите «Найти музыку».' : ''))) return;
    hideKeys(tracks.filter((t) => t.path || t.uri).map((t) => t.key));
    stopAll();
    tracks = []; byKey.clear(); queue = []; context = []; qpos = -1;
    renderLib(); saveLibrary(); showMeta();
  };
  let searchT = null;
  $('search').addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(renderLib, tracks.length > 500 ? 180 : 60); });

  // drag & drop
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; $('drop').classList.add('show'); });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('drop').classList.remove('show'); } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; $('drop').classList.remove('show');
    const files = Array.from(e.dataTransfer.files || []);
    if (native && native.pathForFile) {
      const paths = files.map((f) => native.pathForFile(f)).filter(Boolean);
      if (paths.length && native.expandPaths) { // папки раскрываем в треки
        native.expandPaths(paths).then((list) => (list.length ? addPaths(list) : toast('Здесь нет музыки'))).catch(() => addPaths(paths));
        return;
      }
      if (paths.length) { addPaths(paths); return; }
    }
    addFiles(files);
  });

  // клавиатура
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable]') || $('dialog').classList.contains('show')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowRight') { e.ctrlKey ? step(1) : (A().currentTime += 5); }
    else if (e.code === 'ArrowLeft') { e.ctrlKey ? step(-1) : (A().currentTime -= 5); }
  });

  // ---------- Вкладки ----------
  const isMobile = () => apkUI || window.matchMedia('(max-width: 820px)').matches;
  function showTab(tab) {
    if (tab === 'player' && !isMobile()) tab = 'library';
    if (!$('panel-' + tab) && tab !== 'player') tab = 'library';
    settings.tab = tab;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    ['home', 'library', 'eq', 'fx', 'themes', 'profile'].forEach((p) => {
      if ($('panel-' + p)) $('panel-' + p).classList.toggle('hidden', tab !== p);
    });
    $('panel-player').classList.toggle('hidden-mobile', tab !== 'player');
    updateMini();
    emitApp('tab');
  }
  function updateMini() {
    $('mini').classList.toggle('hide', settings.tab === 'player' || !curTrack());
  }
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (b) { showTab(b.dataset.tab); saveSettings(); }
  });
  $('mini').addEventListener('click', (e) => { if (!e.target.closest('button')) showTab('player'); });
  window.addEventListener('resize', () => showTab(settings.tab));

  // ---------- Переходы между треками ----------
  $('crossfade').addEventListener('input', (e) => {
    settings.crossfade = +e.target.value;
    syncCrossfade(); saveSettings();
  });
  function syncCrossfade() {
    setRange($('crossfade'), settings.crossfade);
    $('crossfade-val').textContent = settings.crossfade ? settings.crossfade + ' с' : 'выкл';
    engine.setOverlap(settings.crossfade > 0);
  }

  // ---------- Эквалайзер ----------
  const EQ_PRESETS = {
    flat: ['Плоский', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    bass: ['Бас', [7, 6, 5, 3, 1, 0, 0, 0, 0, 0]],
    superbass: ['Супербас', [10, 9, 7, 4, 1, -1, -1, 0, 0, 0]],
    rock: ['Рок', [5, 4, 3, 1, -1, -1, 1, 3, 4, 5]],
    pop: ['Поп', [-1, 1, 3, 4, 4, 2, 0, -1, -1, -1]],
    rap: ['Рэп', [6, 5, 2, 1, -1, -1, 1, 1, 2, 3]],
    edm: ['Электроника', [6, 5, 1, 0, -2, 1, 1, 2, 5, 6]],
    vocal: ['Вокал', [-2, -2, -1, 1, 4, 5, 4, 2, 0, -1]],
    jazz: ['Джаз', [4, 3, 1, 2, -2, -2, 0, 2, 3, 4]],
    classic: ['Классика', [4, 3, 2, 1, -1, -1, 0, 2, 3, 4]],
    loud: ['Громкость', [6, 4, 0, -2, -1, 0, 1, 3, 5, 6]],
    treble: ['Высокие', [0, 0, 0, 0, 0, 1, 3, 5, 7, 8]],
    custom: ['Свой', null],
  };
  const eqSel = $('eq-preset');
  for (const [k, [name]] of Object.entries(EQ_PRESETS)) {
    const o = document.createElement('option'); o.value = k; o.textContent = name; eqSel.appendChild(o);
  }
  const bandsEl = $('eq-bands');
  const fLabel = (f) => (f >= 1000 ? f / 1000 + 'k' : String(f));
  const bandInputs = AudioEngine.EQ_FREQS.map((f, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'eq-band';
    wrap.innerHTML = '<span class="eq-val"></span><input type="range" class="vslider" min="-12" max="12" step="0.5"><span class="eq-freq">' + fLabel(f) + '</span>';
    const input = wrap.querySelector('input');
    input.addEventListener('input', () => {
      engine.setEqBand(i, +input.value);
      settings.eqPreset = 'custom';
      syncEq(); saveFx(); saveSettings();
    });
    bandsEl.appendChild(wrap);
    return input;
  });
  eqSel.onchange = () => {
    const p = EQ_PRESETS[eqSel.value];
    settings.eqPreset = eqSel.value;
    if (p[1]) { p[1].forEach((v, i) => engine.setEqBand(i, v)); }
    syncEq(); saveFx(); saveSettings();
  };
  $('eq-on').onchange = (e) => { engine.set('eqOn', e.target.checked); saveFx(); };
  $('preamp').addEventListener('input', (e) => { engine.set('preamp', +e.target.value); syncEq(); saveFx(); });
  $('eq-reset').onclick = () => { eqSel.value = 'flat'; engine.set('preamp', 0); eqSel.onchange(); };
  function syncEq() {
    const s = engine.state;
    $('eq-on').checked = s.eqOn;
    eqSel.value = settings.eqPreset in EQ_PRESETS ? settings.eqPreset : 'custom';
    setRange($('preamp'), s.preamp);
    $('preamp-val').textContent = (s.preamp > 0 ? '+' : '') + s.preamp;
    bandInputs.forEach((inp, i) => {
      setRange(inp, s.eq[i]);
      inp.parentElement.querySelector('.eq-val').textContent = (s.eq[i] > 0 ? '+' : '') + s.eq[i];
    });
  }

  // ---------- Эффекты ----------
  const FX_FMT = {
    speed: (v) => '×' + (+v).toFixed(2),
    pitch: (v) => (v > 0 ? '+' : '') + (+v).toFixed(1) + ' пт',
    reverbMix: (v) => Math.round(v * 100) + '%',
    reverbSize: (v) => (+v).toFixed(1) + ' с',
    echoMix: (v) => Math.round(v * 100) + '%',
    echoTime: (v) => Math.round(v * 1000) + ' мс',
    echoFeedback: (v) => Math.round(v * 100) + '%',
    bass: (v) => '+' + v + ' дБ',
    width: (v) => Math.round(v * 100) + '%',
    balance: (v) => (Math.abs(v) < 0.01 ? 'центр' : (v < 0 ? 'Л ' : 'П ') + Math.round(Math.abs(v) * 100) + '%'),
    eightDSpeed: (v) => (+v).toFixed(2) + ' Гц',
    karaoke: (v) => (v > 0.01 ? Math.round(v * 100) + '%' : 'выкл'),
  };
  for (const key of Object.keys(FX_FMT)) {
    $(key).addEventListener('input', (e) => {
      engine.set(key, +e.target.value);
      syncFx(); saveFx();
    });
  }
  ['vinyl', 'eightD', 'limiter'].forEach((key) => {
    $(key).onchange = (e) => { engine.set(key, e.target.checked); syncFx(); saveFx(); if (key === 'limiter') normAll(0.5); };
  });
  $('normalize').checked = !!settings.normalize;
  $('normalize').onchange = (e) => { settings.normalize = e.target.checked; saveSettings(); normAll(1); };

  const FX_PRESETS = [
    ['Обычный', {}],
    ['Nightcore', { speed: 1.25, vinyl: true }],
    ['Slowed + Reverb', { speed: 0.85, vinyl: true, reverbMix: 0.45, reverbSize: 4 }],
    ['8D', { eightD: true, eightDSpeed: 0.12, reverbMix: 0.2, reverbSize: 2.5 }],
    ['Концерт', { reverbMix: 0.35, reverbSize: 3.5, width: 1.3 }],
    ['Бас-буст', { bass: 9 }],
    ['Пещера', { echoMix: 0.35, echoTime: 0.45, echoFeedback: 0.45, reverbMix: 0.3, reverbSize: 6 }],
    ['Радио', { width: 0, bass: 0 }],
  ];
  const FX_KEYS = ['speed', 'pitch', 'vinyl', 'reverbMix', 'reverbSize', 'echoMix', 'echoTime', 'echoFeedback',
    'bass', 'width', 'balance', 'eightD', 'eightDSpeed', 'karaoke'];
  FX_PRESETS.forEach(([name, vals]) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = name;
    b.onclick = () => {
      FX_KEYS.forEach((k) => engine.set(k, k in vals ? vals[k] : DEFAULT_FX[k]));
      syncFx(); saveFx(); toast('Пресет: ' + name);
    };
    $('fx-presets').appendChild(b);
  });
  $('fx-reset').onclick = () => {
    FX_KEYS.concat(['limiter']).forEach((k) => engine.set(k, DEFAULT_FX[k]));
    syncFx(); saveFx(); toast('Эффекты сброшены');
  };

  function syncFx() {
    const s = engine.state;
    for (const [key, f] of Object.entries(FX_FMT)) {
      setRange($(key), s[key]);
      $(key + '-val').textContent = f(s[key]);
    }
    $('vinyl').checked = s.vinyl;
    $('eightD').checked = s.eightD;
    $('limiter').checked = s.limiter;
    $('pitch').disabled = s.vinyl;
    $('pitch-hint').textContent = s.vinyl
      ? 'Режим винила: скорость и тон меняются вместе, как у пластинки (Nightcore / Slowed).'
      : 'Скорость меняет темп без изменения тона, тон — отдельно.';
    setRange($('volume'), s.volume);
    $('q-speed').textContent = Math.abs(s.speed - 1) > 0.001 ? FX_FMT.speed(s.speed) : '';
    $('q-pitch').textContent = !s.vinyl && Math.abs(s.pitch) > 0.01 ? FX_FMT.pitch(s.pitch) : '';
    const fx = [];
    if (s.reverbMix > 0.01) fx.push('Реверб');
    if (s.echoMix > 0.01) fx.push('Эхо');
    if (s.eightD) fx.push('8D');
    if (s.bass > 0) fx.push('Бас');
    if (s.karaoke > 0.01) fx.push('Караоке');
    $('q-fx').textContent = fx.join(' · ');
  }

  // ---------- Таймер сна ----------
  $('sleep-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const min = +b.dataset.min;
    sleepOff();
    if (min === -1) {
      sleepTrack = true;
      toast('Остановлю, когда трек доиграет');
    } else if (min) {
      sleepEnd = Date.now() + min * 60000;
      // последние 20 секунд музыка плавно затихает
      sleepFadeT = setTimeout(() => engine.fadeTo(0, Math.min(20, min * 60)), Math.max(0, min * 60000 - 20000));
      sleepTimer = setTimeout(() => sleepStop('Таймер сна: пауза'), min * 60000);
      toast('Остановлю через ' + min + ' мин');
    }
    document.querySelectorAll('#sleep-chips .chip').forEach((c) => c.classList.toggle('on', c === b && !!min));
    syncSleep();
  });
  function sleepOff() {
    clearTimeout(sleepTimer); clearTimeout(sleepFadeT);
    sleepTimer = sleepFadeT = null; sleepEnd = 0; sleepTrack = false;
    if (engine.fadeMul !== 1) engine.fadeTo(1, 0.4);
  }
  function sleepStop(msg) {
    decks.forEach((d) => d.pause());
    sleepOff();
    syncSleep(); toast(msg);
  }
  function syncSleep() {
    if (sleepTrack) { $('sleep-hint').textContent = 'Пауза, когда доиграет текущий трек'; return; }
    if (!sleepEnd) { $('sleep-hint').textContent = ''; document.querySelectorAll('#sleep-chips .chip').forEach((c) => c.classList.remove('on')); return; }
    $('sleep-hint').textContent = 'Пауза через ' + fmt((sleepEnd - Date.now()) / 1000);
  }
  setInterval(() => { if (sleepEnd) syncSleep(); }, 1000);

  // ---------- Темы ----------
  function renderThemes() {
    const box = $('themes');
    box.innerHTML = '';
    for (const t of window.SQUAD_THEMES) {
      const b = document.createElement('button');
      b.className = 'theme' + (t.id === settings.theme ? ' on' : '');
      b.style.background = t.vars.bg2;
      b.style.color = t.vars.text;
      b.innerHTML = '<div class="sw"></div><div class="nm"></div>';
      b.querySelector('.sw').style.background = 'linear-gradient(135deg,' + t.vars.bg + ',' + t.vars.card + ')';
      b.querySelector('.sw').style.setProperty('--sw-acc', 'linear-gradient(135deg,' + t.vars.accent + ',' + t.vars.accent2 + ')');
      b.querySelector('.nm').textContent = t.name + (t.id === 'squad' ? ' ★' : '');
      b.onclick = () => { settings.theme = t.id; settings.accent = null; setTheme(); saveSettings(); };
      box.appendChild(b);
    }
  }
  function setTheme() {
    const t = applyTheme(settings.theme, settings.accent);
    $('accent-color').value = settings.accent || t.vars.accent;
    $('cover-accent').checked = settings.coverAccent;
    applyAccent();
    renderThemes();
  }
  $('accent-color').addEventListener('input', (e) => { settings.accent = e.target.value; applyAccent(); saveSettings(); });
  $('cover-accent').onchange = (e) => { settings.coverAccent = e.target.checked; applyAccent(); saveSettings(); };
  $('accent-reset').onclick = () => { settings.accent = null; setTheme(); saveSettings(); };

  // ---------- Визуализатор ----------
  const canvas = $('viz');
  const c2d = canvas.getContext('2d');
  let freq = null;
  function draw() {
    requestAnimationFrame(draw);
    const an = engine.analyser;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    c2d.clearRect(0, 0, w, h);
    if (!an || A().paused) return;
    if (!freq) freq = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(freq);
    const bars = 48;
    const bw = w / bars;
    c2d.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < bars; i++) {
      // логарифмическая шкала частот
      const idx = Math.floor(Math.pow(i / bars, 2) * (freq.length * 0.7));
      const v = freq[idx] / 255;
      const bh = Math.max(2, v * h * 0.45);
      c2d.fillRect(i * bw + 1.5, h - bh, bw - 3, bh);
    }
  }
  requestAnimationFrame(draw);

  // ---------- Автопоиск музыки на устройстве ----------
  function restoreLast() {
    if (A().src || playToken > 0 || userQueued) return; // пользователь уже что-то включил или собрал очередь
    if (apkUI && restoreQueue()) return;
    const last = tracks.findIndex((t) => t.key === settings.lastPath);
    if (last >= 0) { buildQueue(tracks.map((t) => t.key), last); showMeta(); renderLib(); }
  }

  // APK: очередь и место в треке переживают перезапуск
  let resumeAt = null; // {key, time} — куда перемотать при первом запуске восстановленного трека
  function saveQueue() {
    if (!apkUI || qpos < 0) return;
    const from = Math.max(0, qpos - 200);
    store.set('queue', { keys: queue.slice(from, qpos + 1500), pos: qpos - from });
  }
  function saveQueueTime() {
    if (!apkUI || qpos < 0 || !A().src) return;
    store.set('queueTime', { key: queue[qpos], time: A().currentTime || 0 });
  }
  function restoreQueue() {
    const q = store.get('queue', null);
    if (!q || !Array.isArray(q.keys) || !byKey.has(q.keys[q.pos])) return false;
    const cur = q.keys[q.pos];
    queue = q.keys.filter((k) => byKey.has(k));
    qpos = q.keys.slice(0, q.pos).filter((k) => byKey.has(k)).length;
    const tm = store.get('queueTime', null);
    resumeAt = tm && tm.key === cur && tm.time > 5 ? tm : null;
    showMeta(); renderLib();
    return true;
  }

  let scanBusy = false;
  function setScanUI(state) {
    $('btn-scan').disabled = state === 'busy';
    $('btn-scan').textContent = state === 'busy' ? 'Ищу музыку…' : '⟳ Найти музыку';
    $('empty-text').innerHTML = state === 'busy'
      ? 'Ищу музыку на ' + (isAndroid ? 'телефоне' : 'компьютере') + '…'
      : state === 'denied'
        ? 'Разрешите доступ к музыке, чтобы плеер сам нашёл треки на телефоне.<br>Кнопка «Найти музыку» выше.'
        : 'Добавьте музыку кнопками выше<br>или перетащите файлы в окно.';
  }

  async function scanDevice(manual) {
    if (scanBusy || !canScan) return;
    scanBusy = true;
    setScanUI('busy');
    let state = '';
    try {
      if (manual) store.set('hidden', []);
      const hidden = new Set(store.get('hidden', []));
      let found = [];
      if (native) {
        const paths = await native.scanMusic();
        found = paths.map((p) => makeTrack(p.split(/[\\/]/).pop(), { path: p }));
      } else {
        let st = await scanner('checkAudio');
        if (st.audio !== 'granted') st = await scanner('requestAudio');
        if (st.audio !== 'granted') { state = 'denied'; if (manual) toast('Нет доступа к музыке'); return; }
        const r = await scanner('scan');
        const list = (r && r.tracks) || [];
        const alive = new Set(list.map((x) => x.uri));
        // треки, которых больше нет на телефоне
        removeTracks(tracks.filter((t) => t.uri && !alive.has(t.uri)).map((t) => t.key), true);
        found = list.map((x) => makeTrack(x.name || x.title || 'Трек', {
          uri: x.uri, albumId: x.albumId, title: x.title, artist: x.artist, album: x.album, genre: x.genre,
          year: x.year, no: x.no, disc: x.disc, folder: x.folder,
        }));
      }
      const added = addTracks(found.filter((t) => !hidden.has(t.key)), true);
      restoreLast();
      if (manual || added) toast(added ? 'Найдено: ' + tracksWord(added) : 'Новых треков нет');
    } catch (e) {
      console.error(e);
      if (manual) toast('Не удалось найти музыку');
    } finally {
      scanBusy = false;
      setScanUI(state);
    }
  }
  $('btn-scan').onclick = () => scanDevice(true);
  $('auto-scan').onchange = (e) => { settings.autoScan = e.target.checked; saveSettings(); };

  // ---------- Онлайн: поиск в открытых источниках (js/online.js) ----------
  const WEB = window.SquadOnline || null;
  // q — запрос, results — найденное (null — показываем добавленные), page/more — подгрузка, busy/error
  const onl = { q: '', results: null, page: 1, more: false, busy: false, error: '', adding: new Set(), webMore: false, tgNext: null };
  // В APK онлайн-поиск идёт и по всему Telegram (каналы с музыкой), если вход выполнен. В .exe — как раньше.
  function tgFind() { const tg = window.SquadTG; return !!(apkUI && tg && tg.search && tg.state.phase === 'ready'); }

  function webTrack(d) {
    const t = makeTrack(d.title || 'Трек', {});
    t.title = d.title || t.title;
    t.artist = d.artist || 'Неизвестный исполнитель';
    return Object.assign(t, { key: d.key, folder: 'Онлайн/' + (d.source || 'Open'), web: { license: d.license, source: d.source } });
  }

  // новый запрос заменяет идущий: ответ старого просто выбрасываем (раньше новый поиск игнорировался, пока шёл старый)
  let webTok = 0;
  async function webSearch(q, more) {
    q = q.trim();
    if (!WEB || !q || (more && onl.busy)) return;
    const tok = ++webTok;
    if (!more) Object.assign(onl, { q, results: [], page: 1, more: false, webMore: true, tgNext: null });
    onl.busy = true; onl.error = '';
    renderLib();
    try {
      // Telegram и открытые источники — параллельно; упал один — показываем другой
      const useTg = tgFind() && (!more || onl.tgNext);
      const useWeb = !more || onl.webMore;
      const [tg, web] = await Promise.all([
        useTg ? TG.search(q, more ? onl.tgNext : null).then((r) => r, (e) => ({ err: e })) : null,
        useWeb ? WEB.search(q, more ? onl.page + 1 : 1).then((r) => r, (e) => ({ err: e })) : null,
      ]);
      if (tok !== webTok) return;
      const seen = new Set(onl.results.map((x) => x.key));
      const take = (list) => { onl.results = onl.results.concat(list.filter((x) => !seen.has(x.key) && seen.add(x.key))); };
      if (tg && !tg.err) { take(tg.results); onl.tgNext = tg.next; } else if (tg) { console.warn('Поиск в Telegram:', tg.err); onl.tgNext = null; }
      if (web && !web.err) { take(web.results); if (more) onl.page++; onl.webMore = web.more; } else if (web) { console.warn('Поиск онлайн:', web.err); onl.webMore = false; }
      onl.more = !!onl.tgNext || onl.webMore;
      const errs = [tg && tg.err, web && web.err].filter(Boolean);
      if (errs.length && !onl.results.length) {
        const m = String(errs[errs.length - 1].message || errs[errs.length - 1]);
        onl.error = /HTTP 429/.test(m) ? 'Слишком много запросов, попробуйте через минуту' : 'Нет связи с сервисом поиска' + (/HTTP \d+/.test(m) ? ' (' + m.match(/HTTP \d+/)[0] + ')' : '');
      }
    } catch (e) {
      console.warn('Поиск онлайн:', e);
      if (tok === webTok) onl.error = 'Нет связи с сервисом поиска';
    } finally {
      if (tok === webTok) {
        onl.busy = false;
        if (view.tab === 'online') renderLib();
      }
    }
  }

  // Добавить найденное в медиатеку; play — сразу включить
  // найденный в Telegram трек → скачать и добавить в медиатеку. partKb — см. TG.blob
  async function tgAdd(res, onProgress, partKb) {
    const d = await TG.add(res, onProgress, partKb);
    if (byKey.has(d.key)) return d;
    const t = tgTrack(d);
    const h = store.get('hidden', []);
    if (h.includes(d.key)) store.set('hidden', h.filter((k) => k !== d.key)); // удаляли раньше — теперь добавили снова
    addTracks([t], true);
    t.metaDone = false; loadMeta(t).then(() => scheduleRender()).catch(() => {}); // теги и обложка из файла
    return d;
  }

  async function webAdd(res, play) {
    const group = (t) => (res.tg ? t.tg && t.tg.msg : t.web); // очередь — из таких же найденных треков
    if (byKey.has(res.key)) {
      if (play) { const keys = tracks.filter(group).map((t) => t.key); buildQueue(keys, keys.indexOf(res.key)); playAt(qpos); }
      return;
    }
    if (onl.adding.has(res.key)) return;
    onl.adding.add(res.key);
    renderLib();
    toast('Скачиваю «' + res.title + '»…');
    try {
      let d;
      if (res.tg) {
        let last = -1;
        d = await tgAdd(res, (p) => { const pct = Math.floor(p * 100); if (pct - last >= 20) { last = pct; toast('Скачиваю «' + res.title + '»: ' + pct + '%'); } });
      } else {
        d = await WEB.add(res);
        addTracks([webTrack(d)], true);
      }
      toast('Добавлено: ' + res.title);
      if (play) { const keys = tracks.filter(group).map((t) => t.key); buildQueue(keys, keys.indexOf(d.key)); playAt(qpos); }
    } catch (e) {
      console.warn('Скачивание:', e);
      toast('Не скачалось: ' + res.title + (res.tg && TG ? ' (' + TG.errText(e) + ')' : ''));
    } finally {
      onl.adding.delete(res.key);
      if (view.tab === 'online') renderLib();
    }
  }

  // Экран результатов поиска. true — отрисован
  function renderWeb(ol) {
    if (onl.results == null) return false;
    setHead('<button class="icon-btn" data-act="web-back" title="Назад">‹</button>' +
      '<div class="lh-title">«' + esc(onl.q) + '» <span class="lh-sub">' + (onl.busy && !onl.results.length ? 'ищу…' : 'найдено ' + onl.results.length) + '</span></div>');
    const frag = document.createDocumentFragment();
    onl.results.forEach((r, i) => {
      const added = byKey.has(r.key), adding = onl.adding.has(r.key);
      const li = document.createElement('li');
      li.className = 'track web-res' + (added ? ' added' : '');
      li.dataset.res = i;
      li.innerHTML = '<div class="t-art"></div><div class="t-info"><div class="t-title"></div><div class="t-artist"></div></div>' +
        '<button class="t-more web-add" title="' + (added ? 'Уже в медиатеке' : 'Добавить') + '">' + (adding ? '…' : added ? '✓' : '＋') + '</button>';
      const art = li.querySelector('.t-art');
      if (r.thumb) art.innerHTML = '<img loading="lazy" alt="" referrerpolicy="no-referrer">', art.firstChild.src = r.thumb;
      else { const h = hueOf(r.artist + r.title); art.style.background = 'linear-gradient(135deg,hsl(' + h + ',70%,50%),hsl(' + ((h + 50) % 360) + ',80%,40%))'; art.textContent = (r.title[0] || '?').toUpperCase(); }
      if (art.firstChild && art.firstChild.tagName === 'IMG') art.firstChild.onerror = () => { art.textContent = (r.title[0] || '?').toUpperCase(); };
      li.querySelector('.t-title').textContent = r.title;
      li.querySelector('.t-artist').textContent = [r.artist, r.duration ? fmt(r.duration) : '', r.quality, r.source, r.license].filter(Boolean).join(' · ');
      frag.appendChild(li);
    });
    const tail = document.createElement('li');
    tail.className = 'hint pad';
    if (onl.busy) tail.innerHTML = '<div class="tg-spin web-spin"></div>';
    else if (onl.error) tail.textContent = onl.error;
    else if (!onl.results.length) tail.textContent = tgFind() ? 'Ничего не нашлось ни в Telegram, ни в открытых источниках. Попробуйте написать иначе: только исполнителя или только название.'
      : 'Ничего не нашлось. В открытых источниках в основном независимые исполнители, известных релизов из стримингов там нет.' + (apkUI && TG && TG.configured ? ' Войдите в Telegram в медиатеке — тогда поиск пойдёт и по музыкальным каналам.' : '');
    else if (onl.more) tail.innerHTML = '<button class="btn" data-act="web-more">Показать ещё</button>';
    else tail.textContent = 'Это всё, что нашлось';
    frag.appendChild(tail);
    ol.appendChild(frag);
    return true;
  }

  $('search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || view.tab !== 'online') return;
    e.preventDefault();
    webSearch($('search').value);
    $('search').blur();
  });
  $('tracklist').addEventListener('click', (e) => {
    const more = e.target.closest('[data-act="web-more"]');
    if (more) { webSearch(onl.q, true); return; }
    const row = e.target.closest('.web-res');
    if (!row || !onl.results) return;
    const r = onl.results[+row.dataset.res];
    if (r) webAdd(r, !e.target.closest('.web-add'));
  });

  function webBoot() {
    if (WEB) addTracks(WEB.saved().map(webTrack), true);
  }

  // ---------- Telegram (js/telegram.js) ----------
  const TG = window.SquadTG || null;
  let tgBusy = false;       // идёт обновление списка
  let tgCard = null;        // {sig, el} — карточка входа (переиспользуем, чтобы не терять ввод)

  function tgTrack(d) {
    const t = makeTrack(d.name, {});
    if (d.title) t.title = d.title;
    if (d.artist) t.artist = d.artist;
    return Object.assign(t, { key: d.key, folder: d.folder, tg: d.tg, mime: d.mime, size: d.size });
  }

  async function tgCachedBlob(t) {
    return TG && (await TG.cached(t.key)) ? TG.blob(t) : null;
  }

  // Скачать трек из Telegram (из кэша — сразу). show — показывать прогресс
  async function tgBlob(t, show) {
    let last = -1;
    const fresh = !(await TG.cached(t.key));
    const b = await TG.blob(t, (p) => {
      const pct = Math.floor(p * 100);
      if (show && pct !== last && (pct - last >= 5 || pct === 100)) { last = pct; toast('Загрузка из Telegram: ' + pct + '%'); }
    });
    if (fresh) { t.metaDone = false; loadMeta(t).then(() => scheduleRender()); } // теги и обложка из файла
    return b;
  }

  async function tgDownload(t) {
    if (await TG.cached(t.key)) { toast('Уже скачан'); return; }
    try { await tgBlob(t, true); toast('Скачано: ' + t.title); }
    catch (e) { toast('Не скачалось: ' + TG.errText(e)); }
  }

  async function tgSync(quiet) {
    if (!TG || tgBusy || TG.state.phase !== 'ready') return;
    tgBusy = true;
    if (view.tab === 'telegram') renderLib();
    try {
      const list = await TG.sync();
      const hidden = new Set(store.get('hidden', []));
      const alive = new Set(list.map((d) => d.key));
      removeTracks(tracks.filter((t) => t.tg && !t.tg.msg && !alive.has(t.key)).map((t) => t.key), true); // найденное поиском не трогаем
      const added = addTracks(list.filter((d) => !hidden.has(d.key)).map(tgTrack), true);
      if (!quiet || added) toast(added ? 'Из профиля Telegram: ' + tracksWord(added) : 'Новых треков в профиле нет');
    } catch (e) {
      console.warn('Telegram:', e);
      if (!quiet) toast('Telegram: ' + TG.errText(e));
    } finally {
      tgBusy = false;
      if (view.tab === 'telegram') renderLib();
    }
    tgPrefetch();
  }

  // Все треки профиля скачиваются сами в фоне, чтобы играли сразу и без сети
  async function tgPrefetch() {
    if (!TG || !TG.prefetch || TG.prefetching || TG.state.phase !== 'ready') return;
    const list = tracks.filter((t) => t.tg);
    if (!list.length) return;
    let lastHead = 0;
    try {
      const r = await TG.prefetch(list, (done, total, t) => {
        const tr = byKey.get(t.key);
        if (tr) { tr.metaDone = false; loadMeta(tr).then(() => scheduleRender()).catch(() => {}); } // теги и обложка из файла
        if (view.tab === 'telegram' && Date.now() - lastHead > 700) { lastHead = Date.now(); renderLib(); }
      }, () => !A().paused); // пока играет музыка — тихий режим загрузки
      if (r && r.total) toast('Telegram: скачано ' + tracksWord(r.done) + (r.failed ? ', не скачалось ' + r.failed : ''));
    } catch (e) {
      console.warn('Telegram, фоновая загрузка:', e);
    }
    if (view.tab === 'telegram') renderLib();
  }

  function tgHead(total) {
    const me = TG.state.me;
    return '<div class="lh-title">Telegram <span class="lh-sub">' +
      esc(tgBusy ? 'обновляю…' : (me ? me.name + ' · ' : '') + tracksWord(total) +
        (TG.prefetching ? ' · скачиваю ' + TG.prefetching.done + '/' + TG.prefetching.total : '')) + '</span></div>' +
      '<button class="icon-btn" data-act="tg-sync" title="Обновить"' + (tgBusy ? ' disabled' : '') + '>⟳</button>' +
      (total ? '<button class="btn" data-act="play-all">▶</button><button class="btn" data-act="shuffle-all">⤮</button>' : '') +
      '<button class="btn ghost" data-act="tg-logout">Выйти</button>';
  }

  async function tgAction(act) {
    if (act === 'tg-sync') tgSync(false);
    else if (act === 'tg-login') TG.login();
    else if (act === 'tg-cancel') TG.cancel();
    else if (act === 'tg-logout') {
      if (!confirm('Выйти из Telegram? Треки из Telegram и скачанные файлы удалятся с устройства.')) return;
      removeTracks(tracks.filter((t) => t.tg).map((t) => t.key), true, true); // кэш TG.logout очистит целиком
      await TG.logout();
    }
  }

  // Экраны вкладки Telegram, кроме списка треков. true — экран отрисован
  function renderTg(ol, q) {
    const s = TG ? TG.state : { phase: 'off' };
    if (s.phase === 'ready') return false;

    setHead('<div class="lh-title">Telegram</div>');
    const canStop = s.phase === 'connecting' && !!(TG && TG.loggingIn);
    const sig = s.phase + '\u0001' + s.error + '\u0001' + s.hint + '\u0001' + canStop;
    if (tgCard && tgCard.sig === sig) { ol.appendChild(tgCard.el); return true; }
    const li = document.createElement('li');
    li.className = 'tg-card';
    const steps = {
      off: ['Telegram недоступен', 'В этой сборке нет ключей Telegram. Обновите приложение.', ''],
      idle: ['Музыка из Telegram', 'Войдите, чтобы слушать песни из своего профиля Telegram прямо в плеере, с эквалайзером и эффектами.',
        '<button class="btn primary" type="button" data-act="tg-login">Войти через Telegram</button>'],
      connecting: ['Подключаюсь к Telegram…', '', '<div class="tg-spin"></div>'],
      phone: ['Вход в Telegram', 'Номер телефона в международном формате.',
        '<input class="search" name="v" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 900 000-00-00" required>'],
      code: ['Код подтверждения', s.viaApp ? 'Код пришёл в Telegram на другом устройстве (чат «Telegram»).' : 'Код отправлен по SMS.',
        '<input class="search" name="v" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="Код" required>'],
      password: ['Облачный пароль', 'На аккаунте включена двухэтапная проверка.' + (s.hint ? ' Подсказка: ' + esc(s.hint) : ''),
        '<input class="search" name="v" type="password" autocomplete="current-password" placeholder="Пароль" required>'],
    };
    const [title, text, body] = steps[s.phase] || steps.idle;
    const isForm = ['phone', 'code', 'password'].includes(s.phase);
    li.innerHTML = '<form class="tg-form" novalidate><div class="tg-logo">' + $('btn-tg').innerHTML + '</div><h3></h3><p class="hint tg-text"></p>' +
      (s.error ? '<p class="tg-err"></p>' : '') + body +
      (isForm ? '<div class="row"><button class="btn primary" type="submit">Далее</button>' +
        '<button class="btn ghost" type="button" data-act="tg-cancel">Отмена</button></div>' : '') +
      (canStop ? '<div class="row"><button class="btn ghost" type="button" data-act="tg-cancel">Отмена</button></div>' : '') +
      (s.phase === 'idle' ? '<p class="hint">Вход идёт напрямую в Telegram, номер и код никуда больше не передаются.</p>' : '') +
      '</form>';
    li.querySelector('h3').textContent = title;
    li.querySelector('.tg-text').innerHTML = text;
    if (s.error) li.querySelector('.tg-err').textContent = s.error;
    tgCard = { sig, el: li };
    ol.appendChild(li);
    const input = li.querySelector('input');
    if (input) setTimeout(() => input.focus(), 50);
    return true;
  }

  function tgBoot() {
    if (!TG) return;
    if (TG.configured) {
      const hidden = new Set(store.get('hidden', []));
      addTracks(TG.saved().filter((d) => !hidden.has(d.key)).map(tgTrack), true);
    }
    let was = TG.state.phase;
    TG.on((s) => {
      if (s.phase === 'ready' && was !== 'ready') tgSync(true);
      was = s.phase;
      if (view.tab === 'telegram') renderLib();
    });
    TG.resume();
  }

  $('tracklist').addEventListener('submit', (e) => {
    if (!e.target.closest('.tg-form')) return;
    e.preventDefault();
    const v = e.target.elements.v;
    if (v && v.value.trim()) TG.submit(v.value);
    else if (v) v.focus();
  });
  $('tracklist').addEventListener('click', (e) => {
    const b = e.target.closest('.tg-card [data-act]');
    if (b) { tgAction(b.dataset.act); return; }
  });

  // ---------- Старт ----------
  async function boot() {
    setTheme();
    syncModes();
    syncFx();
    syncEq();
    syncCrossfade();
    showTab(settings.tab);
    if (native) {
      $('app-version').textContent = 'v' + (await native.version());
      const saved = store.get('library', []);
      if (saved.length) {
        const existing = await native.filterExisting(saved);
        addTracks(existing.map((p) => makeTrack(p.split(/[\\/]/).pop(), { path: p })), true);
        restoreLast();
      }
    } else {
      // На Android выбор папки в WebView не работает — оставляем выбор файлов
      if (isAndroid) $('btn-add-folder').classList.add('hidden');
      $('app-version').textContent = 'v' + (window.SQUAD_VERSION || '1.0.0');
    }
    $('btn-scan').classList.toggle('hidden', !canScan);
    $('auto-scan-row').classList.toggle('hidden', !canScan);
    $('auto-scan').checked = settings.autoScan;
    if (canScan && settings.autoScan) scanDevice(false);
    tgBoot();
    webBoot();
    $('btn-check-update').onclick = () => window.squadCheckUpdates && window.squadCheckUpdates(true);
    renderLib();
    showMeta();
    document.addEventListener('visibilitychange', () => { if (document.hidden) { saveQueue(); saveQueueTime(); } });
    window.addEventListener('pagehide', () => { saveQueue(); saveQueueTime(); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && engine.ctx && engine.ctx.state === 'suspended' && !A().paused) engine.ctx.resume();
    });
  }
  // ---------- Мост для интерфейса APK (js/apk.js) ----------
  // ---------- .exe: своя шапка окна ----------
  if (native && native.win) {
    document.documentElement.classList.add('desk');
    $('winctl').addEventListener('click', (e) => { const b = e.target.closest('[data-win]'); if (b) native.win(b.dataset.win); });
    native.onWinState((st) => {
      document.documentElement.classList.toggle('win-max', !!(st.max || st.full));
      $('winctl').querySelector('[data-win="max"]').title = st.max || st.full ? 'Свернуть в окно' : 'Развернуть';
    });
  }

  // ---------- Название, исполнитель и обложка: правка вручную и поиск в интернете ----------
  // Каталоги: Deezer (основной) и iTunes Search — без ключей. Правки лежат в IndexedDB «edit:<ключ>» поверх тегов файла.
  const netAndroid = isAndroid && cap && cap.nativePromise;
  async function netText(url) {
    if (native) return native.httpGet(url);
    if (netAndroid) {
      const r = await cap.nativePromise('SquadMedia', 'get', { url });
      if (!r || r.status >= 400) throw new Error('HTTP ' + (r ? r.status : '?'));
      return r.body;
    }
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }
  async function netImage(url) {
    let data;
    if (native) data = new Uint8Array(await native.httpGet(url, true));
    else if (netAndroid) {
      const r = await cap.nativePromise('SquadMedia', 'image', { url });
      if (!r || r.status >= 400 || !r.body) throw new Error('HTTP ' + (r ? r.status : '?'));
      const bin = atob(r.body);
      data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    } else data = new Uint8Array(await (await fetch(url)).arrayBuffer());
    return { mime: data[0] === 0x89 ? 'image/png' : 'image/jpeg', data };
  }
  const mNorm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/\s*[([{][^)\]}]*[)\]}]/g, ' ').replace(/\s+(feat|ft)\.?\s.*$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const realArtist = (a) => (a && a !== 'Неизвестный исполнитель' ? a : '');
  // → [{title, artist, album, art, small}]
  async function lookupMeta(q) {
    const out = [];
    const dz = netText('https://api.deezer.com/search?limit=10&q=' + encodeURIComponent(q)).then((x) => {
      (JSON.parse(x).data || []).forEach((r) => r.album && out.push({ title: r.title, artist: r.artist && r.artist.name, album: r.album.title,
        art: r.album.cover_xl || r.album.cover_big, small: r.album.cover_medium || r.album.cover, src: 'Deezer' }));
    });
    const it = netText('https://itunes.apple.com/search?media=music&entity=song&limit=8&term=' + encodeURIComponent(q)).then((x) => {
      (JSON.parse(x).results || []).forEach((r) => r.artworkUrl100 && out.push({ title: r.trackName, artist: r.artistName, album: r.collectionName,
        art: r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.'), small: r.artworkUrl100, src: 'iTunes' }));
    });
    const res = await Promise.allSettled([dz, it]);
    if (!out.length && res.every((r) => r.status === 'rejected')) throw res[0].reason;
    const seen = new Set();
    return out.filter((r) => { const k = mNorm(r.artist) + '|' + mNorm(r.title) + '|' + mNorm(r.album); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  // насколько найденное похоже на трек (для автоматических обложек: только уверенные совпадения)
  function metaScore(r, title, artist) {
    const tt = mNorm(r.title), want = mNorm(title);
    let s = tt === want ? 2 : want && tt && (tt.includes(want) || want.includes(tt)) ? 1 : 0;
    if (!s) return 0;
    const aw = mNorm(artist).split(' ').filter((w) => w.length > 1), have = new Set(mNorm(r.artist).split(' '));
    const hit = aw.filter((w) => have.has(w)).length;
    return aw.length ? (hit ? s + hit / aw.length : 0) : s;
  }
  async function saveEdit(t, patch) {
    const ed = Object.assign((await metaDb.get('edit:' + t.key)) || {}, patch);
    await metaDb.put('edit:' + t.key, ed);
    t.netArt = !!ed.art;
    if (t === curTrack()) coverFor = null; // перерисовать полную обложку
    applyMeta(t, ed);
    scheduleRender();
    return ed;
  }
  async function artPatch(url) {
    const img = await netImage(url);
    const ci = await SquadTags.coverInfo(img);
    if (!ci) throw new Error('Не удалось открыть картинку');
    return Object.assign(ci, { art: img, netMiss: 0 });
  }
  // .exe: файл переименован → новый путь = новый ключ; переносим его везде, где хранятся ключи
  async function rekey(t, to) {
    const old = t.key;
    if (to === old) return;
    const m = await metaDb.get(old);
    if (m) await metaDb.put(to, m);
    const ed = await metaDb.get('edit:' + old);
    if (ed) await metaDb.put('edit:' + to, ed);
    byKey.delete(old);
    Object.assign(t, { key: to, path: to, name: to.split(/[\\/]/).pop() });
    byKey.set(to, t);
    const fix = (a) => a.forEach((k, i) => { if (k === old) a[i] = to; });
    fix(queue); fix(context);
    playlists.forEach((p) => fix(p.keys));
    savePlaylists(); saveLibrary();
    if (settings.lastPath === old) { settings.lastPath = to; saveSettings(); }
    if (pre && pre.key === old) pre = null;
    decks.forEach((d) => { if (d.dataset.key === old) d.dataset.key = to; });
  }

  let editWrap = null;
  function editTrack(t) {
    if (!editWrap) {
      editWrap = document.createElement('div');
      editWrap.className = 'dialog-wrap';
      document.body.appendChild(editWrap);
    }
    const canRename = !!(native && native.renameFile && t.path);
    editWrap.innerHTML = '<div class="dialog ed-dlg"><h3>Название и исполнитель</h3>' +
      '<label class="ed-f"><span>Название</span><input class="search" id="ed-title" maxlength="200"></label>' +
      '<label class="ed-f"><span>Исполнитель</span><input class="search" id="ed-artist" maxlength="200"></label>' +
      '<label class="ed-f"><span>Альбом</span><input class="search" id="ed-album" maxlength="200"></label>' +
      '<button class="btn" id="ed-find">Найти в интернете</button><p class="hint ed-msg"></p><div class="ed-res"></div>' +
      (canRename ? '<label class="switch"><input type="checkbox" id="ed-ren" checked><span></span>Переименовать файл: «Исполнитель - Название»</label>' : '') +
      '<div class="row"><button class="btn ghost" id="ed-cancel">Отмена</button><button class="btn primary" id="ed-ok">Сохранить</button></div></div>';
    const q = (id) => editWrap.querySelector('#' + id);
    q('ed-title').value = t.title || '';
    q('ed-artist').value = realArtist(t.artist);
    q('ed-album').value = t.album || '';
    let pick = null, busy = false;
    const msg = editWrap.querySelector('.ed-msg'), list = editWrap.querySelector('.ed-res');
    const close = () => editWrap.classList.remove('show');
    editWrap.onclick = (e) => { if (e.target === editWrap) close(); };
    q('ed-cancel').onclick = close;
    q('ed-find').onclick = async () => {
      const qs = (q('ed-artist').value + ' ' + q('ed-title').value).trim() || t.name.replace(/\.[^.]+$/, '');
      msg.textContent = 'Ищу…'; list.innerHTML = '';
      try {
        const res = await lookupMeta(qs);
        msg.textContent = res.length ? 'Выберите подходящий вариант — подставятся название, исполнитель, альбом и обложка' : 'Ничего не нашлось. Поправьте название и поищите ещё раз.';
        res.slice(0, 12).forEach((r) => {
          const b = document.createElement('button');
          b.className = 'ed-item';
          b.innerHTML = '<img alt="" referrerpolicy="no-referrer"><span><b></b><small></small></span>';
          b.querySelector('img').src = r.small;
          b.querySelector('b').textContent = r.title;
          b.querySelector('small').textContent = r.artist + (r.album ? ' · ' + r.album : '') + ' · ' + r.src;
          b.onclick = () => {
            pick = r;
            list.querySelectorAll('.ed-item').forEach((x) => x.classList.toggle('on', x === b));
            q('ed-title').value = r.title || ''; q('ed-artist').value = r.artist || ''; q('ed-album').value = r.album || '';
          };
          list.appendChild(b);
        });
      } catch (e) { msg.textContent = 'Сервисы недоступны: ' + (e.message || e); }
    };
    q('ed-ok').onclick = async () => {
      if (busy) return;
      const title = q('ed-title').value.trim(), artist = q('ed-artist').value.trim(), album = q('ed-album').value.trim();
      if (!title) { msg.textContent = 'Название не может быть пустым'; return; }
      busy = true; msg.textContent = 'Сохраняю…';
      try {
        const patch = { title, artist: artist || 'Неизвестный исполнитель', album };
        if (pick && pick.art) Object.assign(patch, await artPatch(pick.art).catch(() => ({})));
        if (canRename && q('ed-ren').checked) {
          const to = await native.renameFile(t.path, (artist ? artist + ' - ' : '') + title);
          await rekey(t, to);
        }
        await saveEdit(t, patch);
        close(); renderLib(); toast('Сохранено');
      } catch (e) { msg.textContent = 'Не получилось: ' + (e.message || e); } finally { busy = false; }
    };
    editWrap.classList.add('show');
    setTimeout(() => q('ed-title').focus(), 30);
  }

  // Обложка из интернета для трека без обложки: только уверенное совпадение, неудачу помним 14 дней
  const NET_MISS_TTL = 14 * 864e5;
  async function autoCover(t, force) {
    if (!t || t.web || (!settings.netCovers && !force)) return false;
    if (!t.metaDone) await loadMeta(t);
    if (t.thumb || !realArtist(t.artist) || !t.title) return false;
    const ed = await metaDb.get('edit:' + t.key);
    if (ed && ed.netMiss && Date.now() - ed.netMiss < NET_MISS_TTL) return false;
    let best = null, bs = 0;
    try {
      for (const r of await lookupMeta(t.artist + ' ' + t.title)) { const sc = metaScore(r, t.title, t.artist); if (sc > bs) { bs = sc; best = r; } }
    } catch (_) { return false; } // нет сети — попробуем в другой раз
    if (!best || bs < 2 || !best.art) { await saveEdit(t, { netMiss: Date.now() }); return false; }
    try { await saveEdit(t, await artPatch(best.art)); return true; } catch (_) { return false; }
  }
  appEvents.addEventListener('track', () => { const t = curTrack(); if (t) setTimeout(() => { if (curTrack() === t) autoCover(t); }, 1500); });
  let coversRun = false;
  async function findAllCovers() {
    if (coversRun) { coversRun = false; return; } // повторное нажатие — стоп
    const list = tracks.filter((t) => !t.thumb && !t.web);
    if (!list.length) { toast('У всех треков уже есть обложки'); return; }
    coversRun = true;
    let ok = 0, i = 0;
    $('btn-net-covers').textContent = 'Остановить поиск';
    for (const t of list) {
      if (!coversRun) break;
      i++;
      if (await autoCover(t, true)) ok++;
      if (i % 5 === 0) $('net-covers-st').textContent = 'Проверено ' + i + ' из ' + list.length + ', найдено ' + ok;
      await new Promise((r) => setTimeout(r, 350));
    }
    coversRun = false;
    $('btn-net-covers').textContent = 'Найти обложки для всей медиатеки';
    $('net-covers-st').textContent = 'Готово: найдено ' + ok + ' из ' + list.length;
  }
  $('net-covers').checked = settings.netCovers;
  $('net-covers').onchange = (e) => { settings.netCovers = e.target.checked; saveSettings(); };
  $('btn-net-covers').onclick = findAllCovers;

  // ---------- Умные плейлисты: собираются сами по правилам ----------
  // pl.smart = {genre, artist, minPlays, staleDays, addedDays, yearFrom, yearTo, liked, sort, limit}. Ключи пересчитываются
  // при открытии, при изменении медиатеки и смене трека, поэтому остальной код (главная, телефон) видит обычный список.
  const SMART_SORTS = { plays: 'Чаще слушаю', recent: 'Недавно слушал', added: 'Новые сверху', title: 'По названию' };
  function smartKeys(r) {
    const st = (window.SquadStats && SquadStats.data.t) || {};
    const likedPl = playlists.find((p) => p.id === 'liked');
    const liked = r.liked ? new Set(likedPl ? likedPl.keys : []) : null;
    const now = Date.now(), DAY = 864e5;
    const g = String(r.genre || '').toLowerCase().trim(), ar = String(r.artist || '').toLowerCase().trim();
    const list = tracks.filter((t) => {
      const e = st[t.key];
      if (g && !String(t.genre || '').toLowerCase().includes(g)) return false;
      if (ar && !String(t.artist || '').toLowerCase().includes(ar)) return false;
      if (r.minPlays > 0 && !(e && e.n >= r.minPlays)) return false;
      if (r.staleDays > 0 && e && e.last > now - r.staleDays * DAY) return false;
      if (r.addedDays > 0 && !(seen[t.key] > now - r.addedDays * DAY)) return false;
      if (r.yearFrom > 0 && !(t.year >= r.yearFrom)) return false;
      if (r.yearTo > 0 && !(t.year && t.year <= r.yearTo)) return false;
      if (liked && !liked.has(t.key)) return false;
      return true;
    });
    const n = (k) => (st[k] && st[k].n) || 0, last = (k) => (st[k] && st[k].last) || 0;
    const idx = new Map(tracks.map((t, i) => [t.key, i]));
    if (r.sort === 'plays') list.sort((x, y) => n(y.key) - n(x.key) || last(y.key) - last(x.key));
    else if (r.sort === 'recent') list.sort((x, y) => last(y.key) - last(x.key));
    else if (r.sort === 'added') list.sort((x, y) => (seen[y.key] || 0) - (seen[x.key] || 0) || idx.get(y.key) - idx.get(x.key));
    else list.sort((x, y) => cmp(x.title, y.title));
    return list.slice(0, r.limit > 0 ? Math.min(r.limit, 1000) : 100).map((t) => t.key);
  }
  function refreshSmart() {
    let ch = false;
    for (const pl of playlists) {
      if (!pl.smart) continue;
      const k = smartKeys(pl.smart);
      if (k.length !== pl.keys.length || k.some((x, i) => x !== pl.keys[i])) { pl.keys = k; ch = true; }
    }
    if (ch) savePlaylists();
    return ch;
  }
  let smartT = 0;
  const smartSoon = () => { clearTimeout(smartT); smartT = setTimeout(refreshSmart, 800); };
  appEvents.addEventListener('library', smartSoon);
  appEvents.addEventListener('track', smartSoon);

  const SMART_PRE = {
    top: { name: 'Часто слушаю', minPlays: 3, sort: 'plays', limit: 50 },
    stale: { name: 'Давно не слушал', minPlays: 1, staleDays: 30, sort: 'plays', limit: 100 },
    fresh: { name: 'Новое в медиатеке', addedDays: 30, sort: 'added', limit: 100 },
    liked: { name: 'Любимое на повторе', liked: true, sort: 'plays', limit: 50 },
  };
  const SMART_NUM = ['minPlays', 'staleDays', 'addedDays', 'yearFrom', 'yearTo', 'limit'];
  const smartWrap = document.createElement('div');
  smartWrap.className = 'dialog-wrap smart-wrap';
  smartWrap.innerHTML = '<form class="dialog smart-dlg" novalidate><h3>Умный плейлист</h3>' +
    '<div class="chips smart-pre">' + Object.entries(SMART_PRE).map(([k, v]) => '<button type="button" class="chip" data-pre="' + k + '">' + v.name + '</button>').join('') + '</div>' +
    '<label class="sf sf-wide"><span>Название</span><input class="search" name="name" maxlength="80" required></label>' +
    '<div class="sf-grid">' +
    [['genre', 'Жанр содержит', 'text'], ['artist', 'Исполнитель содержит', 'text'], ['minPlays', 'Слушал не меньше, раз', 'number'],
      ['staleDays', 'Не слушал дольше, дней', 'number'], ['addedDays', 'Добавлен за последние, дней', 'number'], ['limit', 'Не больше треков', 'number'],
      ['yearFrom', 'Год от', 'number'], ['yearTo', 'Год до', 'number']]
      .map(([n, l, ty]) => '<label class="sf"><span>' + l + '</span><input class="search" name="' + n + '" type="' + ty + '"' + (ty === 'number' ? ' min="0" inputmode="numeric"' : '') + '></label>').join('') +
    '<label class="sf"><span>Порядок</span><select class="select" name="sort">' + Object.entries(SMART_SORTS).map(([k, v]) => '<option value="' + k + '">' + v + '</option>').join('') + '</select></label>' +
    '</div><label class="switch"><input type="checkbox" name="liked"><span></span>Только из «Любимых»</label>' +
    '<p class="hint smart-count"></p><div class="row"><button type="button" class="btn ghost" data-x>Отмена</button><button class="btn primary">Сохранить</button></div></form>';
  document.body.appendChild(smartWrap);
  const smartForm = smartWrap.querySelector('form');
  let smartEdit = null;
  function smartRead() {
    const f = smartForm.elements, r = { genre: f.genre.value.trim(), artist: f.artist.value.trim(), sort: f.sort.value, liked: f.liked.checked };
    SMART_NUM.forEach((k) => { r[k] = Math.max(0, parseInt(f[k].value, 10) || 0); });
    if (!r.limit) r.limit = 100;
    return r;
  }
  function smartFill(name, r) {
    const f = smartForm.elements;
    f.name.value = name || '';
    f.genre.value = r.genre || ''; f.artist.value = r.artist || '';
    SMART_NUM.forEach((k) => { f[k].value = r[k] ? r[k] : ''; });
    if (!r.limit) f.limit.value = 100;
    f.sort.value = SMART_SORTS[r.sort] ? r.sort : 'plays';
    f.liked.checked = !!r.liked;
    smartCount();
  }
  function smartCount() {
    const n = smartKeys(smartRead()).length;
    smartWrap.querySelector('.smart-count').textContent = 'Подходит сейчас: ' + tracksWord(n);
  }
  function smartDialog(pl) {
    smartEdit = pl;
    smartFill(pl ? pl.name : 'Умный плейлист ' + (playlists.filter((p) => p.smart).length + 1), pl ? pl.smart : { sort: 'plays', limit: 100 });
    smartWrap.classList.add('show');
    setTimeout(() => smartForm.elements.name.focus(), 50);
  }
  const smartClose = () => { smartWrap.classList.remove('show'); smartEdit = null; };
  smartForm.addEventListener('input', smartCount);
  smartWrap.addEventListener('click', (e) => {
    if (e.target === smartWrap || e.target.closest('[data-x]')) { smartClose(); return; }
    const b = e.target.closest('[data-pre]');
    if (b) { const v = SMART_PRE[b.dataset.pre]; smartFill(v.name, v); }
  });
  smartWrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); smartClose(); } });
  smartForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = smartForm.elements.name.value.trim();
    if (!name) { smartForm.elements.name.focus(); return; }
    const r = smartRead();
    let pl = smartEdit;
    if (pl && !playlists.includes(pl)) pl = null; // плейлист успели удалить
    if (pl) { pl.name = name; pl.smart = r; } else { pl = newPlaylist(name); pl.smart = r; }
    pl.keys = smartKeys(r);
    savePlaylists();
    smartClose();
    openLib('playlists', pl.id);
    toast('Умный плейлист: ' + tracksWord(pl.keys.length));
  });

  // ---------- Дубликаты: тот же исполнитель и то же название ----------
  const dupNorm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е')
    .replace(/[([](?:official[^)\]]*|audio|lyrics?|lyric video|текст|клип|hd|hq|4k)[)\]]/gi, ' ')
    .replace(/\s(?:feat|ft|featuring)\.?\s.*$/i, ' ')
    .replace(/[^\p{L}\p{N}()[\]]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const dupWhere = (t) => (t.tg ? 'Telegram · ' : t.web ? 'Онлайн · ' : '') + (t.path || t.name);
  let dupGroups = [];
  function findDups() {
    const by = new Map();
    for (const t of tracks) {
      const title = dupNorm(t.title);
      if (!title) continue;
      const k = dupNorm(t.artist) + '\u0001' + title;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(t);
    }
    const inPl = new Set();
    playlists.forEach((p) => p.keys.forEach((k) => inPl.add(k)));
    // какой оставить по умолчанию: тот, что в плейлистах, потом свой файл, потом с обложкой, потом добавленный раньше
    const score = (t, i) => (inPl.has(t.key) ? 8 : 0) + (t.path || t.uri || t.file ? 4 : 0) + (t.thumb ? 2 : 0) - i / 1e6;
    dupGroups = Array.from(by.values()).filter((g) => g.length > 1).map((g) => {
      const best = g.map((t) => [t, score(t, tracks.indexOf(t))]).sort((a, b) => b[1] - a[1])[0][0];
      return { list: g, keep: best.key };
    });
    renderDups();
  }
  function renderDups() {
    const box = $('dups');
    if (!dupGroups.length) { box.innerHTML = '<p class="hint">Дубликатов нет.</p>'; return; }
    const extra = dupGroups.reduce((n, g) => n + g.list.length - 1, 0);
    box.innerHTML = '<p class="hint">Нашлось групп: ' + dupGroups.length + '. Отметьте, какую копию оставить.</p>' +
      dupGroups.slice(0, 300).map((g, gi) => '<div class="dup-g"><b>' + esc(g.list[0].artist ? g.list[0].artist + ' — ' : '') + esc(g.list[0].title) + '</b>' +
        g.list.map((t) => '<label class="dup-t"><input type="radio" name="dup' + gi + '" data-g="' + gi + '" value="' + esc(t.key) + '"' + (t.key === g.keep ? ' checked' : '') + '><span>' + esc(dupWhere(t)) + '</span></label>').join('') + '</div>').join('') +
      (dupGroups.length > 300 ? '<p class="hint">Показаны первые 300 групп — после уборки поиск можно повторить.</p>' : '') +
      '<div class="row wrap"><button class="btn primary" id="dups-go">Убрать лишние копии: ' + Math.min(extra, dupGroups.slice(0, 300).reduce((n, g) => n + g.list.length - 1, 0)) + '</button><button class="btn" id="dups-no">Отмена</button></div>';
  }
  function dropDups(groups) {
    const map = new Map();
    for (const g of groups) for (const t of g.list) if (t.key !== g.keep && byKey.has(g.keep)) map.set(t.key, g.keep);
    if (!map.size) return 0;
    // плейлисты переходят на оставшуюся копию; если она там уже есть — лишнюю просто убираем
    for (const pl of playlists) {
      const added = new Set();
      const before = pl.keys;
      pl.keys = before.flatMap((k) => {
        const m = map.get(k);
        if (!m) return [k];
        if (before.includes(m) || added.has(m)) return [];
        added.add(m); return [m];
      });
    }
    savePlaylists();
    removeTracks(Array.from(map.keys()));
    return map.size;
  }
  $('btn-dups').onclick = findDups;
  $('dups').addEventListener('change', (e) => { const r = e.target.closest('input[data-g]'); if (r) dupGroups[+r.dataset.g].keep = r.value; });
  $('dups').addEventListener('click', (e) => {
    if (e.target.id === 'dups-no') { dupGroups = []; $('dups').innerHTML = ''; return; }
    if (e.target.id !== 'dups-go') return;
    const n = dropDups(dupGroups.slice(0, 300));
    dupGroups = []; $('dups').innerHTML = '';
    toast(n ? 'Убрано копий: ' + n : 'Нечего убирать');
  });

  window.SquadApp = {
    get tracks() { return tracks; },
    get playlists() { return playlists; },
    get queueInfo() { return { pos: qpos, len: queue.length }; },
    get view() { return view; },
    settings, saveSettings, isAndroid, canScan,
    cur: curTrack,
    byKey: (k) => byKey.get(k),
    playing: () => !A().paused,
    time: () => ({ cur: A().currentTime || 0, dur: A().duration || 0 }),
    seek: (s) => { if (A().src) A().currentTime = s; },
    rate: () => A().playbackRate || 1,
    item: (i) => items[i] || null,
    sound: () => JSON.parse(JSON.stringify(engine.state)),
    // большая обложка трека: { url, own } — own: blob, который вызывающий освобождает сам
    async art(t) {
      if (coverFor === t.key && t === curTrack()) { const u = $('cover-img').src; if (u && !/squad-logo/.test(u)) return { url: u, own: false }; }
      try { const u = await fullArt(t); if (u) return { url: u, own: u.startsWith('blob:') }; } catch (_) {}
      return t.thumb ? { url: t.thumb, own: false } : null;
    },
    // Текст песни из тегов файла. heavy — разрешить читать файл Android целиком (только для одного трека)
    async embeddedLyrics(t, heavy) {
      let src = null;
      if (t.web && !heavy) return null;
      if (t.uri) {
        if (!heavy || !cap || !cap.convertFileSrc) return null;
        const r = await fetch(cap.convertFileSrc(t.uri));
        if (!r.ok) return null;
        src = SquadTags.fromBlob(await r.blob());
      } else src = await sourceOf(t);
      if (!src) return null;
      const tags = await SquadTags.read(src);
      return tags.syncedLyrics || tags.lyrics ? { synced: tags.syncedLyrics || '', plain: tags.lyrics || '' } : null;
    },
    setSound(st) {
      const v = Object.assign({}, st);
      delete v.volume; // громкость пресетом не трогаем
      engine.load(v);
      settings.eqPreset = 'custom'; saveSettings();
      syncEq(); syncFx(); saveFx();
    },
    setFx(k, v) { engine.set(k, v); syncFx(); saveFx(); },
    pause: () => decks.forEach((d) => d.pause()),
    // включить список ключей с позиции i; shuffle — перемешать
    play(keys, i, shuffle) {
      if (!keys.length) return;
      userQueued = true;
      const was = settings.shuffle;
      if (shuffle != null) settings.shuffle = !!shuffle;
      buildQueue(keys, Math.max(0, i || 0));
      if (shuffle != null) settings.shuffle = was;
      playAt(qpos);
    },
    append(keys) { queue.push(...keys); emitApp('queue'); if (view.tab === 'queue') renderLib(); },
    queueList: () => ({ keys: queue.slice(), pos: qpos }),
    playPos(i) { if (i === qpos && A().src) togglePlay(); else if (i >= 0 && i < queue.length) { userQueued = true; playAt(i); } },
    moveQueue: moveInQueue,
    removeQueue: removeFromQueue,
    clearQueue() { if (qpos >= 0 && queue.length > qpos + 1) { queue = queue.slice(0, qpos + 1); emitApp('queue'); if (view.tab === 'queue') renderLib(); } },
    // что заиграет после текущего (при «повтор выкл» в конце очереди — ничего)
    upNext() { const p = nextPos(true); return p >= 0 && p !== qpos ? byKey.get(queue[p]) || null : null; },
    togglePlay, step, showTab, openLib, toast, fmt, esc, renderLib, savePlaylists, enqueue, playNext,
    webSearch: (q) => webSearch(q),
    editTrack: (key) => { const t = byKey.get(key); if (t) editTrack(t); },
    addTg: async (res, partKb) => (await tgAdd(res, null, partKb)).key,
    on: (type, cb) => appEvents.addEventListener(type, cb),
  };

  boot();
})();
