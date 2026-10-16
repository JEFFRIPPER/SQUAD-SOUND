/* SQUAD SOUND — интерфейс плеера */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const native = window.squadNative || null; // есть только в Electron (.exe)
  const audio = $('audio');
  const engine = new AudioEngine(audio);
  window.squadEngine = engine; // для отладки из DevTools
  const AUDIO_RE = /\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|wma|webm|mp4)$/i;

  // ---------- Хранилище ----------
  const store = {
    get(key, def) {
      try { const v = localStorage.getItem('squad.' + key); return v == null ? def : JSON.parse(v); }
      catch (_) { return def; }
    },
    set(key, v) { try { localStorage.setItem('squad.' + key, JSON.stringify(v)); } catch (_) {} },
  };

  const DEFAULT_FX = JSON.parse(JSON.stringify(engine.state));
  const settings = Object.assign({
    theme: 'squad', accent: null, shuffle: false, repeat: 'off', eqPreset: 'flat', tab: 'library',
  }, store.get('settings', {}));
  engine.load(store.get('fx', {}));

  let tracks = [];      // {id, name, title, artist, file?, path?}
  let order = [];       // порядок воспроизведения (индексы tracks)
  let current = -1;     // индекс в tracks
  let currentUrl = null;
  let sleepTimer = null, sleepEnd = 0;

  const saveSettings = () => store.set('settings', settings);
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

  // ---------- Трек-лист ----------
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

  let uid = 0;
  function makeTrack(name, extra) {
    const p = parseName(name);
    return Object.assign({ id: ++uid, name, title: p.title, artist: p.artist }, extra);
  }

  function addTracks(list) {
    const known = new Set(tracks.map((t) => t.path || t.name + ':' + (t.file && t.file.size)));
    let added = 0;
    for (const t of list) {
      const key = t.path || t.name + ':' + (t.file && t.file.size);
      if (known.has(key)) continue;
      known.add(key);
      tracks.push(t);
      added++;
    }
    rebuildOrder();
    renderList();
    saveLibrary();
    if (added) toast('Добавлено треков: ' + added);
    if (current < 0 && tracks.length) { current = order[0]; showMeta(); }
  }

  function addFiles(fileList) {
    const files = Array.from(fileList).filter((f) => (f.type && f.type.startsWith('audio/')) || AUDIO_RE.test(f.name));
    files.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, 'ru'));
    addTracks(files.map((f) => makeTrack(f.name, { file: f })));
  }

  function addPaths(paths) {
    addTracks(paths.filter((p) => AUDIO_RE.test(p)).map((p) => makeTrack(p.split(/[\\/]/).pop(), { path: p })));
  }

  function rebuildOrder() {
    order = tracks.map((_, i) => i);
    if (settings.shuffle) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      if (current >= 0) { order.splice(order.indexOf(current), 1); order.unshift(current); }
    }
  }

  function renderList() {
    const q = $('search').value.trim().toLowerCase();
    const ol = $('tracklist');
    ol.innerHTML = '';
    $('empty').classList.toggle('hidden', tracks.length > 0);
    const frag = document.createDocumentFragment();
    tracks.forEach((t, i) => {
      if (q && !(t.title + ' ' + t.artist).toLowerCase().includes(q)) return;
      const li = document.createElement('li');
      li.className = 'track' + (i === current ? ' playing' : '');
      li.dataset.i = i;
      const h = hueOf(t.artist + t.title);
      li.innerHTML =
        '<div class="t-art" style="background:linear-gradient(135deg,hsl(' + h + ',70%,50%),hsl(' + ((h + 50) % 360) + ',80%,40%))"></div>' +
        '<div class="t-info"><div class="t-title"></div><div class="t-artist"></div></div>' +
        '<div class="eqbars"><i></i><i></i><i></i></div>' +
        '<button class="t-del" title="Убрать">✕</button>';
      li.querySelector('.t-art').textContent = (t.title[0] || '?').toUpperCase();
      li.querySelector('.t-title').textContent = t.title;
      li.querySelector('.t-artist').textContent = t.artist;
      frag.appendChild(li);
    });
    ol.appendChild(frag);
    ol.classList.toggle('paused', audio.paused);
  }

  $('tracklist').addEventListener('click', (e) => {
    const li = e.target.closest('.track');
    if (!li) return;
    const i = +li.dataset.i;
    if (e.target.closest('.t-del')) { removeTrack(i); return; }
    if (i === current && audio.src) togglePlay();
    else playIndex(i);
  });

  function removeTrack(i) {
    const wasCurrent = i === current;
    tracks.splice(i, 1);
    if (wasCurrent) { audio.pause(); audio.removeAttribute('src'); current = -1; }
    else if (i < current) current--;
    rebuildOrder();
    renderList();
    saveLibrary();
    showMeta();
  }

  // ---------- Воспроизведение ----------
  async function srcFor(t) {
    if (t.file) return URL.createObjectURL(t.file);
    if (t.path && native) {
      const data = await native.readFile(t.path);
      return URL.createObjectURL(new Blob([data]));
    }
    throw new Error('Файл недоступен');
  }

  async function playIndex(i) {
    if (i < 0 || i >= tracks.length) return;
    await engine.init().catch((e) => console.error(e));
    if (engine.ctx && engine.ctx.state === 'suspended') engine.ctx.resume();
    current = i;
    const t = tracks[i];
    try {
      const url = await srcFor(t);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = url;
      audio.src = url;
      engine.apply('speed'); // playbackRate сбрасывается при смене src
      await audio.play();
    } catch (e) {
      console.error(e);
      toast('Не удалось открыть: ' + t.name);
    }
    showMeta();
    renderList();
    settings.lastPath = t.path || null;
    saveSettings();
  }

  async function togglePlay() {
    if (!tracks.length) { $('btn-add-files').click(); return; }
    if (!audio.src) { playIndex(current >= 0 ? current : order[0]); return; }
    await engine.init();
    if (engine.ctx.state === 'suspended') await engine.ctx.resume();
    if (audio.paused) audio.play(); else audio.pause();
  }

  function step(dir) {
    if (!tracks.length) return;
    if (dir < 0 && audio.currentTime > 3) { audio.currentTime = 0; return; }
    let pos = order.indexOf(current) + dir;
    if (pos >= order.length) pos = 0;
    if (pos < 0) pos = order.length - 1;
    playIndex(order[pos]);
  }

  audio.addEventListener('ended', () => {
    if (settings.repeat === 'one') { audio.currentTime = 0; audio.play(); return; }
    const pos = order.indexOf(current);
    if (pos === order.length - 1 && settings.repeat === 'off') { setPlayingUI(); return; }
    step(1);
  });
  audio.addEventListener('play', setPlayingUI);
  audio.addEventListener('pause', setPlayingUI);
  audio.addEventListener('error', () => { if (audio.src) toast('Формат не поддерживается'); });

  function setPlayingUI() {
    const playing = !audio.paused;
    document.body.classList.toggle('is-playing', playing);
    $('tracklist').classList.toggle('paused', !playing);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }

  function showMeta() {
    const t = tracks[current];
    $('np-title').textContent = t ? t.title : 'Ничего не играет';
    $('np-artist').textContent = t ? t.artist : 'Добавьте треки';
    $('mini-title').textContent = t ? t.title : '—';
    $('mini-artist').textContent = t ? t.artist : '';
    $('cover-letter').textContent = t ? (t.title[0] || 'S').toUpperCase() : 'S';
    document.title = t ? t.title + ' — SQUAD SOUND' : 'SQUAD SOUND';
    if (t && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: 'SQUAD SOUND' });
    }
    updateMini();
  }

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const h = (a, f) => { try { ms.setActionHandler(a, f); } catch (_) {} };
    h('play', togglePlay); h('pause', togglePlay);
    h('previoustrack', () => step(-1)); h('nexttrack', () => step(1));
    h('seekto', (d) => { audio.currentTime = d.seekTime; });
  }

  // ---------- Прогресс ----------
  const fmt = (s) => {
    if (!isFinite(s)) return '0:00';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec;
  };
  let seeking = false;
  audio.addEventListener('timeupdate', () => {
    const d = audio.duration || 0;
    if (!seeking) setRange($('seek'), d ? (audio.currentTime / d) * 1000 : 0);
    $('t-cur').textContent = fmt(audio.currentTime);
    $('t-dur').textContent = fmt(d);
    $('mini-progress').style.width = (d ? (audio.currentTime / d) * 100 : 0) + '%';
    if ('mediaSession' in navigator && d && navigator.mediaSession.setPositionState) {
      try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(audio.currentTime, d), playbackRate: audio.playbackRate }); } catch (_) {}
    }
  });
  $('seek').addEventListener('input', (e) => {
    seeking = true;
    paintRange(e.target);
    $('t-cur').textContent = fmt((e.target.value / 1000) * (audio.duration || 0));
  });
  $('seek').addEventListener('change', (e) => {
    if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration;
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
    rebuildOrder(); syncModes(); saveSettings();
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
    if (!tracks.length || !confirm('Очистить список треков?')) return;
    audio.pause(); audio.removeAttribute('src');
    tracks = []; current = -1; rebuildOrder(); renderList(); saveLibrary(); showMeta();
  };
  $('search').addEventListener('input', renderList);

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
    if (e.target.matches('input[type=search], input[type=text], select')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowRight') { e.ctrlKey ? step(1) : (audio.currentTime += 5); }
    else if (e.code === 'ArrowLeft') { e.ctrlKey ? step(-1) : (audio.currentTime -= 5); }
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
    $('mini').classList.toggle('hide', settings.tab === 'player' || current < 0);
  }
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (b) { showTab(b.dataset.tab); saveSettings(); }
  });
  $('mini').addEventListener('click', (e) => { if (!e.target.closest('button')) showTab('player'); });
  window.addEventListener('resize', () => showTab(settings.tab));

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
      sleepTimer = setTimeout(() => { audio.pause(); sleepTimer = null; sleepEnd = 0; syncSleep(); toast('Таймер сна: пауза'); }, min * 60000);
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
    renderThemes();
  }
  $('accent-color').addEventListener('input', (e) => { settings.accent = e.target.value; applyTheme(settings.theme, settings.accent); saveSettings(); });
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
    if (!an || audio.paused) return;
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

  // ---------- Старт ----------
  async function boot() {
    setTheme();
    syncModes();
    syncFx();
    syncEq();
    showTab(settings.tab);
    if (native) {
      $('app-version').textContent = 'v' + (await native.version());
      const saved = store.get('library', []);
      if (saved.length) {
        const existing = await native.filterExisting(saved);
        addTracks(existing.map((p) => makeTrack(p.split(/[\\/]/).pop(), { path: p })));
        const last = tracks.findIndex((t) => t.path === settings.lastPath);
        if (last >= 0) { current = last; showMeta(); renderList(); }
      }
    } else {
      const cap = window.Capacitor;
      // На Android выбор папки в WebView не работает — оставляем выбор файлов
      if (cap && cap.getPlatform && cap.getPlatform() === 'android') $('btn-add-folder').classList.add('hidden');
      $('app-version').textContent = 'v' + (window.SQUAD_VERSION || '1.0.0');
    }
    renderList();
    showMeta();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && engine.ctx && engine.ctx.state === 'suspended' && !audio.paused) engine.ctx.resume();
    });
  }
  boot();
})();
