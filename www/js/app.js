/* SQUAD SOUND — интерфейс плеера */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const native = window.squadNative || null; // есть только в Electron (.exe)
  const decks = [$('audio'), $('audio2')];
  const engine = new AudioEngine(decks[0], decks[1]);
  window.squadEngine = engine; // для отладки из DevTools
  const A = () => engine.audio; // активная дека
  const AUDIO_RE = /\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|wma|webm|mp4)$/i;
  const cap = window.Capacitor;
  const isAndroid = !!(cap && cap.getPlatform && cap.getPlatform() === 'android');
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
    tab: 'library', libTab: 'tracks', sort: 'added', crossfade: 0, autoScan: true,
  }, store.get('settings', {}));
  engine.load(store.get('fx', {}));

  let tracks = [];            // {key, name, title, artist, album, albumArtist, genre, year, no, disc, folder, thumb, accent, file?, path?}
  const byKey = new Map();
  let context = [];           // ключи списка, из которого запущено воспроизведение
  let queue = [];             // очередь воспроизведения (ключи, могут повторяться)
  let qpos = -1;              // позиция текущего трека в очереди
  let playlists = store.get('playlists', []); // [{id, name, keys: []}]
  let view = { tab: settings.libTab, group: null };
  let sleepTimer = null, sleepEnd = 0;

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

  function addTracks(list, quiet) {
    let added = 0;
    for (const t of list) {
      if (byKey.has(t.key)) continue;
      byKey.set(t.key, t);
      tracks.push(t);
      added++;
    }
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

  function removeTrack(key, gone) {
    const t = byKey.get(key);
    if (!t) return;
    if (!gone && (t.path || t.uri || t.tg)) hideKeys([key]);
    if (t.tg && window.SquadTG) SquadTG.uncache(key); // скачанный файл тоже удаляем
    if (t.web && window.SquadOnline) SquadOnline.remove(key);
    const wasCurrent = curTrack() === t;
    tracks = tracks.filter((x) => x !== t);
    byKey.delete(key);
    context = context.filter((k) => k !== key);
    let before = 0;
    queue.forEach((k, i) => { if (k === key && i < qpos) before++; });
    queue = queue.filter((k) => k !== key);
    qpos = Math.min(qpos - before, queue.length - 1);
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

  async function loadMeta(t) {
    const cached = await metaDb.get(t.key);
    if (cached && cached.v === META_VER) { applyMeta(t, cached); return; }
    const m = { v: META_VER };
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
    }
    metaDb.put(t.key, m);
    applyMeta(t, m);
  }

  let scanning = false;
  async function scanMeta() {
    if (scanning) return;
    scanning = true;
    try {
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (t.metaDone) continue;
        await loadMeta(t);
        scheduleRender();
      }
      if (tracks.some((t) => !t.metaDone)) { scanning = false; return scanMeta(); }
    } finally {
      scanning = false;
    }
  }

  // Полноразмерная обложка для экрана «Сейчас играет»
  let coverUrl = null, coverFor = null;
  async function loadFullCover(t) {
    if (coverFor === t.key) return;
    coverFor = t.key;
    if (coverUrl) { URL.revokeObjectURL(coverUrl); coverUrl = null; }
    if (!t.thumb) return;
    try {
      if (t.uri && scanner) {
        const art = await androidArt(t, 800);
        if (coverFor === t.key && art) $('cover-img').src = art.url;
        return;
      }
      const src = await sourceOf(t);
      const tags = src ? await SquadTags.read(src) : {};
      if (coverFor !== t.key || !tags.picture) return;
      coverUrl = URL.createObjectURL(new Blob([tags.picture.data], { type: tags.picture.mime }));
      $('cover-img').src = coverUrl;
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

  function renderLib() {
    lastRender = Date.now();
    renderLib.gen = (renderLib.gen || 0) + 1;
    const q = $('search').value.trim().toLowerCase();
    const tab = view.tab;
    const ol = $('tracklist');
    ol.innerHTML = '';
    // анимация появления строк — только при смене вкладки/группы, а не на каждую перерисовку
    const vkey = tab + '\u0002' + view.group;
    ol.classList.toggle('md-enter', vkey !== renderLib.vkey);
    renderLib.vkey = vkey;
    document.querySelectorAll('#lib-tabs .chip').forEach((b) => b.classList.toggle('on', b.dataset.lib === tab));
    $('empty').classList.toggle('hidden', tracks.length > 0 || tab === 'playlists' || tab === 'telegram' || tab === 'online');
    $('search').placeholder = tab === 'online' ? 'Найти трек в открытых источниках (Enter)' : 'Поиск по трекам';
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
      setHead('<div class="lh-title">Плейлисты <span class="lh-sub">' + playlists.length + '</span></div>' +
        '<button class="btn primary" data-act="pl-new">＋ Новый плейлист</button>');
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
        li.querySelector('.t-artist').textContent = tracksWord(present.length) +
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
    const reorder = !q && (tab === 'queue' || tab === 'playlists');
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
        extra = '<button class="btn ghost" data-act="pl-rename">Переименовать</button><button class="btn ghost" data-act="pl-delete">Удалить</button>';
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
    // первый экран — сразу, остальное следующим кадром, чтобы переключение вкладок не подвисало
    const gen = renderLib.gen = (renderLib.gen || 0) + 1;
    const FIRST = 80;
    ol.insertAdjacentHTML('beforeend', rows.slice(0, FIRST).join(''));
    if (rows.length > FIRST) setTimeout(() => { if (renderLib.gen === gen) ol.insertAdjacentHTML('beforeend', rows.slice(FIRST).join('')); }, 0);
    if (!items.length && (tracks.length || tab === 'telegram' || tab === 'online')) {
      const li = document.createElement('li');
      li.className = 'hint pad';
      li.textContent = tab === 'online' ? (q ? 'Нажмите Enter, чтобы искать «' + $('search').value.trim() + '» в открытых источниках'
        : 'Введите название трека или исполнителя в поиске выше и нажмите Enter. Ищем по открытым источникам с лицензиями Creative Commons: Jamendo, Wikimedia, Freesound, ccMixter.')
        : q ? 'Ничего не найдено' : tab === 'telegram'
        ? (tgBusy ? 'Загружаю музыку из профиля…' : 'В профиле Telegram пока нет музыки. Добавьте песни в свой профиль в Telegram и нажмите ⟳.') : tab === 'playlists' ? 'Плейлист пуст. Добавляйте треки через меню ⋮.' : 'Пусто';
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
      queue = queue.slice(0, qpos + 1); renderLib(); toast('Очередь очищена');
    } else if (act === 'pl-new') {
      const name = await askText('Новый плейлист', 'Плейлист ' + (playlists.length + 1));
      if (name) { const p = newPlaylist(name); openLib('playlists', p.id); }
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
    drag = null;
    const order = Array.from($('tracklist').children).map((li) => items[+li.dataset.idx]).filter(Boolean).map((it) => it.pos);
    if (view.tab === 'queue') {
      const cur = qpos;
      const old = queue;
      if (order.length !== old.length) { renderLib(); return; }
      queue = order.map((p) => old[p]);
      qpos = order.indexOf(cur);
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
    openMenu(anchor, 'В плейлист', playlists.map((pl) => ({ label: pl.name, act: () => addToPlaylist(pl, t) })).concat([{
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
      view.tab === 'playlists' && view.group ? {
        label: 'Убрать из плейлиста',
        act: () => {
          const pl = playlists.find((p) => p.id === view.group);
          if (pl) { pl.keys.splice(it.pos, 1); savePlaylists(); renderLib(); }
        },
      } : null,
      view.tab === 'queue' && it.pos !== qpos ? { label: 'Убрать из очереди', act: () => removeFromQueue(it.pos) } : null,
      t.artist && !(view.tab === 'artists' && view.group) ? { label: 'Исполнитель: ' + t.artist, act: () => openLib('artists', t.artist) } : null,
      albumKey && !(view.tab === 'albums' && view.group) ? { label: 'Альбом: ' + t.album, act: () => openLib('albums', albumKey) } : null,
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

  function playNext(key) {
    if (qpos < 0) { queue = [key]; qpos = 0; playAt(0); return; }
    queue.splice(qpos + 1, 0, key);
    toast('Будет следующим');
    if (view.tab === 'queue') renderLib();
  }

  function enqueue(key) {
    if (qpos < 0) { queue = [key]; qpos = 0; playAt(0); return; }
    queue.push(key);
    toast('Добавлено в очередь');
    if (view.tab === 'queue') renderLib();
  }

  function removeFromQueue(pos) {
    if (pos === qpos) return;
    queue.splice(pos, 1);
    if (pos < qpos) qpos--;
    renderLib();
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

  async function loadDeck(deck, t) {
    const i = decks.indexOf(deck);
    const url = await srcFor(t);
    if (deckUrls[i]) URL.revokeObjectURL(deckUrls[i]);
    deckUrls[i] = url;
    deck.dataset.key = t.key;
    deck.src = url;
  }

  const preReady = (pos) => pre && pre.pos === pos && pre.key === queue[pos] && engine.idle && engine.idle.dataset.key === pre.key;

  function preload(pos) {
    const t = byKey.get(queue[pos]);
    const idle = engine.idle;
    if (!t || !idle) return;
    pre = { pos, key: t.key };
    idle.pause();
    loadDeck(idle, t).catch(() => { pre = null; });
  }

  function stopAll() {
    playToken++;
    decks.forEach((d) => { d.pause(); d.removeAttribute('src'); d.dataset.key = ''; d.load(); });
    pre = null; fading = false;
    setPlayingUI();
  }

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
    } catch (e) {
      if (token !== playToken || (e && e.name === 'AbortError')) return;
      console.error(e);
      fading = false;
      toast('Не удалось открыть: ' + t.name);
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
  }

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const h = (a, f) => { try { ms.setActionHandler(a, f); } catch (_) {} };
    h('play', togglePlay); h('pause', togglePlay);
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
    if ('mediaSession' in navigator && d && navigator.mediaSession.setPositionState) {
      try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(a.currentTime, d), playbackRate: a.playbackRate }); } catch (_) {}
    }
    // Заранее грузим следующий трек и запускаем кроссфейд
    if (!isFinite(d) || !d || a.paused || settings.repeat === 'one' || !engine.nodes) return;
    const np = nextPos(true);
    if (np < 0) return;
    const cf = settings.crossfade;
    const rem = (d - a.currentTime) / (a.playbackRate || 1);
    if (rem < cf + 10 && !preReady(np) && Date.now() > fadeUntil) preload(np);
    if (cf > 0 && !fading && rem <= cf && d > cf * 2 + 1) { fading = true; playAt(np, 'fade'); }
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
      if (paths.length) { addPaths(paths); return; }
    }
    addFiles(files);
  });

  // клавиатура
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input[type=search], input[type=text], select') || $('dialog').classList.contains('show')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowRight') { e.ctrlKey ? step(1) : (A().currentTime += 5); }
    else if (e.code === 'ArrowLeft') { e.ctrlKey ? step(-1) : (A().currentTime -= 5); }
  });

  // ---------- Вкладки ----------
  const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
  function showTab(tab) {
    if (tab === 'player' && !isMobile()) tab = 'library';
    settings.tab = tab;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    ['library', 'eq', 'fx', 'themes'].forEach((p) => {
      $('panel-' + p).classList.toggle('hidden', tab !== p);
    });
    $('panel-player').classList.toggle('hidden-mobile', tab !== 'player');
    updateMini();
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
  };
  for (const key of Object.keys(FX_FMT)) {
    $(key).addEventListener('input', (e) => {
      engine.set(key, +e.target.value);
      syncFx(); saveFx();
    });
  }
  ['vinyl', 'eightD', 'limiter'].forEach((key) => {
    $(key).onchange = (e) => { engine.set(key, e.target.checked); syncFx(); saveFx(); };
  });

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
    'bass', 'width', 'balance', 'eightD', 'eightDSpeed'];
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
    $('q-fx').textContent = fx.join(' · ');
  }

  // ---------- Таймер сна ----------
  $('sleep-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const min = +b.dataset.min;
    clearTimeout(sleepTimer); sleepTimer = null; sleepEnd = 0;
    if (min) {
      sleepEnd = Date.now() + min * 60000;
      sleepTimer = setTimeout(() => { decks.forEach((d) => d.pause()); sleepTimer = null; sleepEnd = 0; syncSleep(); toast('Таймер сна: пауза'); }, min * 60000);
      toast('Остановлю через ' + min + ' мин');
    }
    document.querySelectorAll('#sleep-chips .chip').forEach((c) => c.classList.toggle('on', c === b && !!min));
    syncSleep();
  });
  function syncSleep() {
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
    if (A().src) return;
    const last = tracks.findIndex((t) => t.key === settings.lastPath);
    if (last >= 0) { buildQueue(tracks.map((t) => t.key), last); showMeta(); renderLib(); }
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
        tracks.filter((t) => t.uri && !alive.has(t.uri)).forEach((t) => removeTrack(t.key, true));
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
  const onl = { q: '', results: null, page: 1, more: false, busy: false, error: '', adding: new Set() };

  function webTrack(d) {
    const t = makeTrack(d.title || 'Трек', {});
    t.title = d.title || t.title;
    t.artist = d.artist || 'Неизвестный исполнитель';
    return Object.assign(t, { key: d.key, folder: 'Онлайн/' + (d.source || 'Open'), web: { license: d.license, source: d.source } });
  }

  async function webSearch(q, more) {
    q = q.trim();
    if (!WEB || !q || onl.busy) return;
    if (!more) Object.assign(onl, { q, results: [], page: 1, more: false });
    onl.busy = true; onl.error = '';
    renderLib();
    try {
      const r = await WEB.search(q, more ? onl.page + 1 : 1);
      if (q !== onl.q) return;
      if (more) onl.page++;
      const seen = new Set(onl.results.map((x) => x.key));
      onl.results = onl.results.concat(r.results.filter((x) => !seen.has(x.key)));
      onl.more = r.more;
    } catch (e) {
      console.warn('Поиск онлайн:', e);
      onl.error = /HTTP 429/.test(e.message) ? 'Слишком много запросов, попробуйте через минуту' : 'Нет связи с сервисом поиска';
    } finally {
      onl.busy = false;
      if (view.tab === 'online') renderLib();
    }
  }

  // Добавить найденное в медиатеку; play — сразу включить
  async function webAdd(res, play) {
    if (byKey.has(res.key)) {
      if (play) { const keys = tracks.filter((t) => t.web).map((t) => t.key); buildQueue(keys, keys.indexOf(res.key)); playAt(qpos); }
      return;
    }
    if (onl.adding.has(res.key)) return;
    onl.adding.add(res.key);
    renderLib();
    toast('Скачиваю «' + res.title + '»…');
    try {
      const d = await WEB.add(res);
      addTracks([webTrack(d)], true);
      toast('Добавлено: ' + res.title);
      if (play) { const keys = tracks.filter((t) => t.web).map((t) => t.key); buildQueue(keys, keys.indexOf(d.key)); playAt(qpos); }
    } catch (e) {
      console.warn('Скачивание:', e);
      toast('Не скачалось: ' + res.title);
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
      li.querySelector('.t-artist').textContent = [r.artist, r.duration ? fmt(r.duration) : '', r.source, r.license].filter(Boolean).join(' · ');
      frag.appendChild(li);
    });
    const tail = document.createElement('li');
    tail.className = 'hint pad';
    if (onl.busy) tail.innerHTML = '<div class="tg-spin web-spin"></div>';
    else if (onl.error) tail.textContent = onl.error;
    else if (!onl.results.length) tail.textContent = 'Ничего не нашлось. В открытых источниках в основном независимые исполнители, известных релизов из стримингов там нет.';
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
      tracks.filter((t) => t.tg && !alive.has(t.key)).forEach((t) => removeTrack(t.key, true));
      const added = addTracks(list.filter((d) => !hidden.has(d.key)).map(tgTrack), true);
      if (!quiet || added) toast(added ? 'Из профиля Telegram: ' + tracksWord(added) : 'Новых треков в профиле нет');
    } catch (e) {
      console.warn('Telegram:', e);
      if (!quiet) toast('Telegram: ' + TG.errText(e));
    } finally {
      tgBusy = false;
      if (view.tab === 'telegram') renderLib();
    }
  }

  function tgHead(total) {
    const me = TG.state.me;
    return '<div class="lh-title">Telegram <span class="lh-sub">' +
      esc(tgBusy ? 'обновляю…' : (me ? me.name + ' · ' : '') + tracksWord(total)) + '</span></div>' +
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
      tracks.filter((t) => t.tg).forEach((t) => removeTrack(t.key, true));
      await TG.logout();
    }
  }

  // Экраны вкладки Telegram, кроме списка треков. true — экран отрисован
  function renderTg(ol, q) {
    const s = TG ? TG.state : { phase: 'off' };
    if (s.phase === 'ready') return false;

    setHead('<div class="lh-title">Telegram</div>');
    const sig = s.phase + '\u0001' + s.error + '\u0001' + s.hint;
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
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && engine.ctx && engine.ctx.state === 'suspended' && !A().paused) engine.ctx.resume();
    });
  }
  boot();
})();
