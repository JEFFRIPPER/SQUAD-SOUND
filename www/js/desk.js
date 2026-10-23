/* ПК: кнопки «Текст»/«Караоке», плеер на всё окно с текстом и подсветкой строки, главная.
 * Только для .exe/браузера (html без .apk). Поиск текстов — общий модуль js/lyrics.js.
 */
(function () {
  'use strict';
  const root = document.documentElement;
  const S = window.SquadApp, L = window.SquadLyrics;
  if (!S || !L) return;
  const APK = root.classList.contains('apk'); // на телефоне отсюда нужен только плеер на весь экран с текстом

  const $ = (id) => document.getElementById(id);
  const esc = S.esc;
  const svg = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  const IC = {
    lyrics: 'M4 5h16M4 10h16M4 15h10M4 20h7',
    mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
    close: 'M6 6l12 12M18 6 6 18',
    eq: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    fx: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
    look: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.1-4-7.5-9-7.5z',
    keys: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8',
    pc: 'M3 4h18v12H3zM8 20h8M12 16v4',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  };

  // ---------- Кнопки в панели плеера ----------
  const acts = document.querySelector('.np-actions');
  const bLyr = document.createElement('button');
  bLyr.className = 'chip dk-chip';
  bLyr.innerHTML = svg(IC.lyrics) + 'Текст';
  const bKara = document.createElement('button');
  bKara.className = 'chip dk-chip';
  bKara.innerHTML = svg(IC.mic) + 'Караоке';
  if (!APK) acts.append(bLyr, bKara);

  // ---------- Плеер на всё окно: обложка и кнопки слева, текст справа ----------
  const ov = document.createElement('div');
  ov.className = 'dl';
  ov.innerHTML = '<div class="dl-bg"></div><div class="dl-glow" aria-hidden="true"><i></i><i></i><i></i></div><i class="dl-tint"></i><header class="dl-head"><img class="dl-art" alt=""><div class="dl-meta"><b></b><span></span></div>' +
    '<div class="dl-tools"><div class="dl-off" title="Сдвиг текста для этого трека"><button data-off="-1" title="Текст позже">−0,1</button><span>0,0 с</span><button data-off="1" title="Текст раньше">+0,1</button></div>' +
    '<div class="dl-lang"><button data-ln="tr" title="Перевод на русский под строками">Перевод</button><button data-ln="rm" title="Текст латиницей под строками">Латиницей</button></div>' +
    '<button class="chip dl-kara">' + svg(IC.mic) + '<span>Караоке</span></button></div>' +
    '<button class="icon-btn dl-close" title="Закрыть (Esc)">' + svg(IC.close) + '</button></header>' +
    '<div class="dl-main"><i class="dl-halo" aria-hidden="true"></i><aside class="dl-side"><div class="dl-cover"><img alt=""></div><div class="dl-np"><b></b><span></span></div>' +
    '<div class="dl-seek"><input type="range" min="0" max="1000" value="0"><div><span>0:00</span><span>0:00</span></div></div>' +
    '<div class="dl-ctl"></div></aside><div class="dl-body"><div class="dl-lines"></div></div></div>';
  document.body.appendChild(ov);
  const body = ov.querySelector('.dl-body'), box = ov.querySelector('.dl-lines'), kb = ov.querySelector('.dl-kara');
  const sk = ov.querySelector('.dl-seek input'), [tc, td] = ov.querySelectorAll('.dl-seek span');
  const st = { open: false, kara: false, key: null, lines: null, cur: -1, raf: 0, drag: false, pv: -1, ct: '', dt: '' };

  // кнопки управления — копии кнопок нижнего плеера, нажатие уходит в оригинал
  const ctl = ov.querySelector('.dl-ctl');
  ['btn-shuffle', 'btn-prev', 'btn-play', 'btn-next', 'btn-repeat'].forEach((id) => {
    const o = $(id), c = o.cloneNode(true);
    c.removeAttribute('id');
    c.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
    c.onclick = () => o.click();
    ctl.appendChild(c);
    const sync = () => {
      c.className = o.className;
      const b1 = o.querySelector('.badge'), b2 = c.querySelector('.badge');
      if (b1 && b2) b2.className = b1.className;
    };
    new MutationObserver(sync).observe(o, { attributes: true, subtree: true, attributeFilter: ['class'] });
  });

  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  sk.addEventListener('input', () => { st.drag = true; const d = S.time().dur; tc.textContent = fmt(d * sk.value / 1000); sk.style.setProperty('--p', sk.value / 10 + '%'); });
  sk.addEventListener('change', () => { S.seek(S.time().dur * sk.value / 1000); st.drag = false; });

  // сдвиг синхронизации текста: свой для каждого трека, шаг 0,1 с
  const OFF = 'squad.lyr.off';
  let offs = {};
  try { offs = JSON.parse(localStorage.getItem(OFF)) || {}; } catch (_) {}
  const offOf = () => offs[st.key] || 0;
  const offTxt = ov.querySelector('.dl-off span');
  const showOff = () => { const v = offOf(); offTxt.textContent = (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + ' с'; };
  ov.querySelector('.dl-off').addEventListener('click', (e) => {
    const b = e.target.closest('[data-off]');
    if (!b || !st.key) return;
    const v = Math.round((offOf() + b.dataset.off * 0.1) * 10) / 10;
    if (v) offs[st.key] = v; else delete offs[st.key];
    try { localStorage.setItem(OFF, JSON.stringify(offs)); } catch (_) {}
    showOff(); st.cur = -2;
  });

  function setKara(on) {
    st.kara = on;
    S.setFx('karaoke', on ? 1 : 0);
    ov.classList.toggle('kara', on);
    kb.classList.toggle('on', on);
    bKara.classList.toggle('on', on && st.open);
    kb.lastChild.textContent = on ? 'Голос убран' : 'Караоке';
    st.cur = -1;
  }
  // ПК: визуализатор переезжает на большую обложку, пока открыт плеер на всё окно (в нижней панели его не видно)
  const viz = $('viz'), vizHome = viz && viz.parentNode, vizNext = viz && viz.nextSibling;
  const halo = ov.querySelector('.dl-halo'), glow = ov.querySelector('.dl-glow'), dcov = ov.querySelector('.dl-cover');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function placeHalo() {
    if (!st.open || !dcov.offsetWidth) return;
    const m = ov.querySelector('.dl-main').getBoundingClientRect(), r = dcov.getBoundingClientRect();
    halo.style.left = r.left - m.left + 'px'; halo.style.top = r.top - m.top + 'px';
    halo.style.width = r.width + 'px'; halo.style.height = r.height + 'px';
  }
  if (window.ResizeObserver) new ResizeObserver(placeHalo).observe(dcov);
  function open(kara) {
    st.open = true;
    ov.classList.add('show');
    if (!APK && viz) dcov.appendChild(viz);
    requestAnimationFrame(placeHalo);
    bLyr.classList.add('on');
    if (kara !== st.kara) setKara(!!kara);
    load();
  }
  function close() {
    if (!st.open) return;
    st.open = false;
    ov.classList.remove('show');
    bLyr.classList.remove('on');
    cancelAnimationFrame(st.raf);
    if (!APK && viz && vizHome) vizHome.insertBefore(viz, vizNext);
    if (window.SquadBeat) window.SquadBeat.want = false;
    st.bv = -1; halo.style.opacity = glow.style.opacity = halo.style.transform = '';
    if (st.kara) setKara(false); // закрыли — голос возвращается
    bKara.classList.remove('on');
  }
  bLyr.onclick = () => (st.open ? close() : open(false));
  bKara.onclick = () => (st.open && st.kara ? close() : open(true));
  kb.onclick = () => setKara(!st.kara);

  // перевод или латиница под каждой строкой; выбор запоминается
  let lang = '';
  try { lang = localStorage.getItem('squad.lyr.lang') || ''; } catch (_) {}
  const syncLang = () => ov.querySelectorAll('[data-ln]').forEach((b) => b.classList.toggle('on', b.dataset.ln === lang));
  syncLang();
  ov.querySelector('.dl-lang').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ln]');
    if (!b) return;
    lang = lang === b.dataset.ln ? '' : b.dataset.ln;
    try { localStorage.setItem('squad.lyr.lang', lang); } catch (_) {}
    syncLang();
    applyLang();
  });
  async function applyLang() {
    box.querySelectorAll('.dl-sub, .dl-note').forEach((el) => el.remove());
    const r = st.r, t = S.cur();
    const plainBox = box.querySelector('.dl-plain');
    const plain = r && !st.lines ? String(r.plain || '').split('\n') : null;
    if (plainBox && plain) plainBox.innerHTML = plain.map(esc).join('<br>');
    const job = st.job = {};
    if (!lang || !r || !t || st.key !== t.key) return;
    const texts = st.lines ? st.lines.map((l) => l.text) : plain;
    const was = lang;
    ov.querySelector('[data-ln="' + was + '"]').classList.add('busy');
    let res;
    try { res = await L.extra(t.key, texts, was); }
    catch (_) { if (st.job === job) S.toast(was === 'tr' ? 'Перевод не загрузился. Проверьте интернет.' : 'Латиницу не удалось получить. Проверьте интернет.'); return; }
    finally { ov.querySelector('[data-ln="' + was + '"]').classList.remove('busy'); }
    if (st.job !== job || st.key !== t.key || !st.open) return;
    if (res.note) { box.insertAdjacentHTML('afterbegin', '<p class="dl-note">' + esc(res.note) + '</p>'); return; }
    if (st.lines) {
      box.querySelectorAll('p[data-i]').forEach((p) => { const x = res.subs[+p.dataset.i]; if (x) p.insertAdjacentHTML('beforeend', '<small class="dl-sub">' + esc(x) + '</small>'); });
    } else if (plainBox) {
      plainBox.innerHTML = plain.map((x, i) => esc(x) + (res.subs[i] ? '<small class="dl-sub">' + esc(res.subs[i]) + '</small>' : '')).join('<br>');
    }
  }
  ov.querySelector('.dl-close').onclick = close;
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.open) close(); });
  body.addEventListener('click', (e) => {
    if (e.target.closest('[data-dl="retry"]')) { const t = S.cur(); if (t) { L.forget(t.key); load(); } return; }
    const l = e.target.closest('[data-t]');
    if (l) S.seek(Math.max(0, +l.dataset.t - offOf()));
  });

  // цвет для фона: насыщенность не ниже 55 %, яркость 35–60 % — серые и почти чёрные обложки тоже дают цвет
  function vivid(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn;
    let h = 0, sat = 0;
    if (dd) {
      sat = dd / (1 - Math.abs(2 * l - 1));
      h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return 'hsl(' + Math.round(h) + ' ' + Math.round(Math.max(sat, dd ? 0.55 : 0) * 100) + '% ' + Math.round(Math.min(0.6, Math.max(0.35, l)) * 100) + '%)';
  }
  // средний цвет обложки — им подкрашен фон
  const cv = document.createElement('canvas');
  cv.width = cv.height = 12;
  function tint(img) {
    try {
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 12, 12);
      const d = g.getImageData(0, 0, 12, 12).data;
      let r = 0, gr = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++; }
      ov.style.setProperty('--dl-tint', Math.round(r / n) + ',' + Math.round(gr / n) + ',' + Math.round(b / n));
      // три цвета для переливающегося фона: верх, середина и низ обложки, чуть ярче и насыщеннее
      for (let band = 0; band < 3; band++) {
        let R = 0, G = 0, B = 0, k = 0;
        for (let i = band * 4 * 12 * 4; i < (band + 1) * 4 * 12 * 4; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; k++; }
        ov.style.setProperty('--dl-c' + (band + 1), vivid(R / k, G / k, B / k));
      }
    } catch (_) { ['--dl-tint', '--dl-c1', '--dl-c2', '--dl-c3'].forEach((v) => ov.style.removeProperty(v)); } // чужая картинка без CORS — цвета темы
  }
  const big = ov.querySelector('.dl-cover img');
  big.addEventListener('load', () => tint(big));
  function head(t) {
    const title = t ? t.title : 'Ничего не играет', artist = t ? t.artist || '' : '';
    ov.querySelector('.dl-meta b').textContent = ov.querySelector('.dl-np b').textContent = title;
    ov.querySelector('.dl-meta span').textContent = ov.querySelector('.dl-np span').textContent = artist;
    const src = $('cover-img').getAttribute('src') || '';
    ov.querySelector('.dl-art').src = src;
    if (big.getAttribute('src') !== src) big.src = src;
    ov.querySelector('.dl-bg').style.backgroundImage = src ? 'url("' + src.replace(/"/g, '%22') + '")' : '';
  }
  new MutationObserver(() => { if (st.open) head(S.cur()); }).observe($('cover-img'), { attributes: true, attributeFilter: ['src'] });
  async function load() {
    const t = S.cur();
    head(t);
    st.key = t ? t.key : null; st.lines = null; st.cur = -1; st.r = null;
    showOff();
    cancelAnimationFrame(st.raf);
    loop();
    if (!t) { box.innerHTML = '<p class="dl-hint">Включите трек — здесь появится его текст.</p>'; return; }
    box.innerHTML = '<p class="dl-hint">Ищем текст…</p>';
    try {
      const r = await L.get(t);
      if (st.key !== t.key || !st.open) return;
      if (r.none) { box.innerHTML = '<p class="dl-hint">Текст не нашёлся ни в файле, ни в LRCLIB, ни в lyrics.ovh.</p><button class="chip" data-dl="retry">Искать снова</button>'; return; }
      if (r.instrumental && !r.synced && !r.plain) { box.innerHTML = '<p class="dl-hint">Это инструментальный трек.</p>'; return; }
      const lines = L.parse(r.synced);
      if (lines.length) {
        st.lines = lines;
        box.innerHTML = lines.map((l, i) => '<p data-i="' + i + '" data-t="' + l.t + '"><span class="lt">' + (esc(l.text) || '♪') + '</span></p>').join('');
      } else box.innerHTML = '<div class="dl-plain">' + esc(r.plain).replace(/\n/g, '<br>') + '</div>';
      if (r.src) box.insertAdjacentHTML('beforeend', '<p class="dl-src">Текст: ' + esc(r.src) + '</p>');
      st.r = r;
      applyLang();
    } catch (_) {
      if (st.key === t.key) box.innerHTML = '<p class="dl-hint">Не удалось загрузить текст. Проверьте интернет.</p><button class="chip" data-dl="retry">Ещё раз</button>';
    }
  }
  function loop() {
    if (!st.open) return;
    const tm = S.time();
    // в DOM пишем только то, что изменилось: каждый кадр трогать ползунок и текст — лишняя перерисовка
    const pv = tm.dur ? Math.round(tm.cur / tm.dur * 1000) : 0;
    if (!st.drag && pv !== st.pv) { st.pv = pv; sk.value = pv; sk.style.setProperty('--p', pv / 10 + '%'); }
    const ct = fmt(tm.cur), dt = fmt(tm.dur);
    if (!st.drag && ct !== st.ct) { st.ct = ct; tc.textContent = ct; }
    if (dt !== st.dt) { st.dt = dt; td.textContent = dt; }
    if (st.lines) {
      const now = tm.cur + 0.25 + offOf();
      let i = -1;
      for (let k = 0; k < st.lines.length && st.lines[k].t <= now; k++) i = k;
      if (i !== st.cur) {
        const prev = box.querySelector('.on');
        if (prev) prev.classList.remove('on');
        const el = box.querySelector('[data-i="' + i + '"]');
        if (el) {
          el.classList.add('on');
          body.scrollTo({ top: el.offsetTop - body.clientHeight / 2 + el.offsetHeight / 2, behavior: st.cur === -1 ? 'auto' : 'smooth' });
        } else if (i < 0) body.scrollTo({ top: 0 });
        st.cur = i; st.sw = -1;
      }
      // подсветка по словам: заливка бежит по строке, как в караоке
      const lt = i >= 0 && box.querySelector('p.on .lt');
      if (lt) {
        const pct = Math.round(L.sung(st.lines, i, now) * 1000) / 10;
        if (pct !== st.sw) { st.sw = pct; lt.style.setProperty('--p', pct + '%'); }
      }
    }
    // свечение вокруг обложки и пятна фона дышат в ритм баса (только opacity/transform)
    const bt = window.SquadBeat;
    if (bt && !reduced.matches) {
      const on = S.playing() && !document.hidden;
      bt.want = on;
      const v = on ? Math.round(Math.min(1, bt.level) * 40) / 40 : 0;
      if (v !== st.bv) {
        st.bv = v;
        glow.style.opacity = (0.45 + v * 0.35).toFixed(3);
        halo.style.opacity = (0.25 + v * v * 0.75).toFixed(3);
        halo.style.transform = 'scale(' + (1 + v * 0.05).toFixed(3) + ')';
      }
    }
    st.raf = requestAnimationFrame(loop);
  }
  S.on('track', () => { if (st.open && (S.cur() || {}).key !== st.key) load(); });

  // в узком окне и на телефоне сдвиг и «Караоке» уходят вниз, к кнопкам
  const tools = ov.querySelector('.dl-tools'), mqWide = matchMedia('(min-width: 1000px)');
  const placeTools = () => { if (mqWide.matches) ov.querySelector('.dl-close').before(tools); else ov.querySelector('.dl-seek').before(tools); };
  placeTools();
  mqWide.addEventListener('change', placeTools);

  window.SquadFull = { open, close, isOpen: () => st.open };
  if (APK) return;

  // клик по обложке или названию в нижнем плеере — текст на всё окно
  document.querySelector('.now .cover').addEventListener('click', () => { if (matchMedia('(min-width: 821px)').matches) open(false); });
  document.querySelector('.now .meta').addEventListener('click', () => { if (matchMedia('(min-width: 821px)').matches) open(false); });

  // ---------- Главная на ПК: приветствие, «Моя волна», плитки и ряды из своей медиатеки ----------
  const home = $('panel-home');
  const ST = window.SquadStats;
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const art = (t, cls) => t && t.thumb
    ? '<span class="' + cls + '"><img loading="lazy" alt="" src="' + esc(t.thumb) + '"></span>'
    : '<span class="' + cls + '" style="background:linear-gradient(135deg,hsl(' + hue(t ? t.artist + t.title : 'S') + ',70%,45%),hsl(' + ((hue(t ? t.title : 'S') + 50) % 360) + ',80%,30%))"><b>' + esc(((t && t.title) || 'S')[0].toUpperCase()) + '</b></span>';
  const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 17 ? 'Добрый день' : h < 23 ? 'Добрый вечер' : 'Доброй ночи'; };
  const MOODS = [['all', 'Вся музыка'], ['liked', 'Любимое'], ['top', 'Чаще всего'], ['fresh', 'Ещё не слушал']];
  let mood = 'all';
  try { mood = localStorage.getItem('squad.desk.mood') || 'all'; } catch (_) {}
  const stat = () => (ST ? ST.data.t : {});
  const liked = () => (S.playlists.find((p) => p.id === 'liked') || { keys: [] }).keys.filter((k) => S.byKey(k));
  function waveKeys(m) {
    const all = S.tracks.map((t) => t.key), st = stat();
    if (m === 'liked') return liked();
    if (m === 'top') return all.filter((k) => st[k] && st[k].n).sort((a, b) => st[b].n - st[a].n).slice(0, 100);
    if (m === 'fresh') return all.filter((k) => !st[k] || !st[k].n);
    return all;
  }
  function wave() {
    const keys = waveKeys(mood);
    if (!keys.length) { S.toast(mood === 'all' ? 'Добавьте музыку в медиатеку' : 'Для этого настроения пока нет треков'); return; }
    S.play(keys, Math.floor(Math.random() * keys.length), true);
  }
  // треки из статистики: по ключу, только те, что ещё есть в медиатеке
  const fromStats = (sort, n, filter) => Object.entries(stat()).filter(([k, e]) => S.byKey(k) && (!filter || filter(e))).sort(sort).slice(0, n).map(([k]) => k);
  const row = (title, keys, from) => keys.length ? '<section class="dh-sec"><h2>' + title + '</h2><div class="dh-row">' + keys.map((k) => {
    const t = S.byKey(k), cur = S.cur() === t;
    return '<button class="dh-card' + (cur ? ' on' : '') + '" data-k="' + esc(k) + '" data-from="' + from + '">' + art(t, 'dh-art') +
      '<b>' + esc(t.title) + '</b><small>' + esc(t.artist || '') + '</small></button>';
  }).join('') + '</div></section>' : '';
  const lists = {};
  // итоги месяца и года (js/wrapped.js) — плитками на главной
  function wrapRow() {
    const W = window.SquadWrapped;
    if (!W) return '';
    const { months, years } = W.list();
    const ks = months.slice(0, 2).concat(years.slice(0, 1));
    return ks.length ? '<section class="dh-sec"><h2>Итоги</h2><div class="dh-wraps">' + ks.map((k) => '<button class="dh-wrap" data-wrap="' + esc(k) + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>' +
      '<b>' + esc(W.monthName(k)) + '</b><small>' + (k.length === 4 ? 'Итоги года' : 'Итоги месяца') + '</small></button>').join('') + '</div></section>' : '';
  }
  function render() {
    if (S.settings.tab !== 'home' || root.classList.contains('apk')) return;
    const P = window.SquadProfile, cur = S.cur();
    const recent = fromStats((a, b) => b[1].last - a[1].last, 24);
    const top = fromStats((a, b) => b[1].n - a[1].n || b[1].sec - a[1].sec, 16, (e) => e.n > 0);
    const old = fromStats((a, b) => a[1].last - b[1].last, 16, (e) => e.n >= 2 && Date.now() - e.last > 7 * 864e5);
    const fresh = S.tracks.slice(-16).reverse().map((t) => t.key);
    Object.assign(lists, { recent, top, old, fresh });
    const lk = liked();
    const tiles = [['liked', null]].concat(recent.slice(0, 5).map((k) => ['t', k]));
    home.innerHTML =
      '<div class="dh">' +
      '<header class="dh-head">' + (P ? '<button class="dh-me" data-act="profile" title="Профиль">' + P.avatarHtml() + '</button>' : '') +
        '<h1>' + greet() + (P ? ', <span>' + esc(P.name()) + '</span>' : '') + '</h1></header>' +
      '<section class="dh-wave">' + (cur && cur.thumb ? '<i class="dh-wave-bg" style="background-image:url(&quot;' + esc(cur.thumb) + '&quot;)"></i>' : '') +
        '<div class="dh-wave-txt"><h2>Моя волна</h2><p>Бесконечный поток из вашей медиатеки под настроение</p>' +
        '<div class="dh-moods">' + MOODS.map(([id, l]) => '<button class="chip' + (mood === id ? ' on' : '') + '" data-mood="' + id + '">' + l + '</button>').join('') + '</div></div>' +
        '<button class="dh-play" data-act="wave" aria-label="Запустить волну"><svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg></button></section>' +
      (S.tracks.length ? '<div class="dh-tiles">' + tiles.map(([type, k]) => {
        if (type === 'liked') return '<button class="dh-tile" data-act="liked"><span class="dh-tart liked"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9.2-8.6C1.2 8.2 3 4.5 6.6 4.5c2.1 0 3.4 1.2 4.4 2.6 1-1.4 2.3-2.6 4.4-2.6 3.6 0 5.4 3.7 3.8 6.9C19 15.6 12 20 12 20z"/></svg></span><span><b>Любимые</b><small>' + lk.length + ' ' + (lk.length % 10 === 1 && lk.length % 100 !== 11 ? 'трек' : lk.length % 10 >= 2 && lk.length % 10 <= 4 && (lk.length % 100 < 10 || lk.length % 100 >= 20) ? 'трека' : 'треков') + '</small></span></button>';
        const t = S.byKey(k);
        return '<button class="dh-tile" data-k="' + esc(k) + '" data-from="recent">' + art(t, 'dh-tart') + '<span><b>' + esc(t.title) + '</b><small>' + esc(t.artist || '') + '</small></span></button>';
      }).join('') + '</div>' : '<div class="dh-empty"><p>Медиатека пуста. Добавьте музыку во вкладке «Треки».</p><button class="btn primary" data-act="lib">Открыть треки</button></div>') +
      wrapRow() + row('Сейчас слушаешь', recent.slice(5), 'recent') + row('Чаще всего', top, 'top') + row('Вернуться к', old, 'old') + row('Новое в медиатеке', fresh, 'fresh') +
      (S.playlists.filter((p) => p.id !== 'liked' && p.keys.length).length ? '<section class="dh-sec"><h2>Плейлисты</h2><div class="dh-row">' +
        S.playlists.filter((p) => p.id !== 'liked' && p.keys.length).map((p) => '<button class="dh-card" data-pl="' + esc(p.id) + '">' + art(S.byKey(p.keys.find((k) => S.byKey(k))), 'dh-art') +
          '<b>' + esc(p.name) + '</b><small>' + p.keys.length + ' тр.</small></button>').join('') + '</div></section>' : '') +
      '</div>';
  }
  home.addEventListener('click', (e) => {
    const el = e.target.closest('[data-k],[data-mood],[data-act],[data-pl],[data-wrap]');
    if (!el) return;
    if (el.dataset.wrap) { window.SquadWrapped.open(el.dataset.wrap); return; }
    if (el.dataset.mood) { mood = el.dataset.mood; try { localStorage.setItem('squad.desk.mood', mood); } catch (_) {} render(); return; }
    if (el.dataset.pl) { S.openLib('playlists', el.dataset.pl); return; }
    const act = el.dataset.act;
    if (act === 'wave') { wave(); return; }
    if (act === 'profile') { S.showTab('profile'); return; }
    if (act === 'lib') { S.showTab('library'); return; }
    if (act === 'liked') { const k = liked(); if (k.length) S.play(k, 0, false); else S.openLib('playlists', 'liked'); return; }
    const list = lists[el.dataset.from] || [el.dataset.k];
    if (S.cur() && S.cur().key === el.dataset.k) { S.togglePlay(); return; }
    S.play(list, Math.max(0, list.indexOf(el.dataset.k)), false);
  });
  let homeT = 0;
  const soon = () => { clearTimeout(homeT); homeT = setTimeout(render, 300); };
  S.on('tab', render);
  S.on('library', soon);
  // смена трека: на главной только переносим подсветку, без полной перерисовки с картинками
  S.on('track', () => {
    if (S.settings.tab !== 'home') return;
    const k = (S.cur() || {}).key;
    home.querySelectorAll('.dh-card.on').forEach((c) => c.classList.remove('on'));
    if (k) home.querySelectorAll('.dh-card[data-k="' + CSS.escape(k) + '"]').forEach((c) => c.classList.add('on'));
  });
  render();

  // ---------- Очередь колонкой справа (широкое окно) ----------
  // Кнопка «Очередь» в нижнем плеере открывает колонку; в узком окне — как раньше, вкладку очереди.
  const QW = () => matchMedia('(min-width: 1100px)').matches;
  const dq = document.createElement('aside');
  dq.className = 'dq';
  dq.innerHTML = '<header class="dq-head"><h2>Очередь</h2><button class="chip dq-clear" title="Убрать всё, что дальше">Очистить</button>' +
    '<button class="icon-btn dq-x" title="Скрыть очередь">' + svg(IC.close) + '</button></header><div class="dq-body"></div>';
  document.querySelector('.layout').appendChild(dq);
  const dqBody = dq.querySelector('.dq-body');
  const qBtn = $('np-queue');
  let qOn = false;
  try { qOn = localStorage.getItem('squad.desk.queue') === '1'; } catch (_) {}
  const DQ_MAX = 200; // дальше 200 треков список не рисуем — колонка остаётся лёгкой
  const qRow = (t, pos, cur) => '<div class="dq-row' + (cur ? ' on' : '') + '" data-pos="' + pos + '">' + art(t, 'dq-art') +
    '<div class="dq-meta"><b>' + esc(t.title) + '</b><span>' + esc(t.artist || '') + '</span></div>' +
    (cur ? '' : '<button class="dq-del" title="Убрать из очереди">' + svg(IC.close) + '</button><i class="dq-grip" title="Перетащить"></i>') + '</div>';
  function renderQ() {
    if (!root.classList.contains('dq-on')) return;
    const { keys, pos } = S.queueList();
    const cur = pos >= 0 ? S.byKey(keys[pos]) : null;
    const next = [];
    for (let i = pos + 1; i < keys.length && next.length < DQ_MAX; i++) { const t = S.byKey(keys[i]); if (t) next.push(qRow(t, i, false)); }
    const more = keys.length - pos - 1 - next.length;
    dqBody.innerHTML = (cur ? '<h3>Сейчас играет</h3>' + qRow(cur, pos, true) : '<p class="dq-empty">Очередь пуста. Включите трек или добавьте его через меню «В очередь».</p>') +
      (next.length ? '<h3>Далее</h3><div class="dq-list">' + next.join('') + '</div>' : cur ? '<p class="dq-empty">Дальше ничего нет. Добавьте треки через меню трека → «В очередь».</p>' : '') +
      (more > 0 ? '<p class="dq-empty">И ещё ' + more + ' тр.</p>' : '');
    dq.querySelector('.dq-clear').hidden = !next.length;
  }
  let qT = 0;
  const qSoon = () => { if (!qT && !qDrag) qT = requestAnimationFrame(() => { qT = 0; renderQ(); }); };
  function setQ(on) {
    qOn = on;
    try { localStorage.setItem('squad.desk.queue', on ? '1' : '0'); } catch (_) {}
    syncQ();
  }
  function syncQ() {
    const show = qOn && QW() && !APK;
    root.classList.toggle('dq-on', show);
    qBtn.classList.toggle('on', show);
    if (show) renderQ();
  }
  qBtn.onclick = () => { if (QW()) setQ(!qOn); else S.openLib('queue'); };
  dq.querySelector('.dq-x').onclick = () => setQ(false);
  dq.querySelector('.dq-clear').onclick = () => S.clearQueue();
  ['queue', 'track', 'library'].forEach((ev) => S.on(ev, qSoon));
  window.addEventListener('resize', syncQ);
  dqBody.addEventListener('click', (e) => {
    const row = e.target.closest('.dq-row');
    if (!row || e.target.closest('.dq-grip')) return;
    if (e.target.closest('.dq-del')) { S.removeQueue(+row.dataset.pos); return; }
    S.playPos(+row.dataset.pos);
  });
  // перетаскивание за «ручку»: строка едет за мышью, позиция в очереди меняется при отпускании
  let qDrag = null;
  dqBody.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.dq-grip');
    if (!g || e.button) return;
    e.preventDefault();
    const row = g.closest('.dq-row');
    qDrag = { row, id: e.pointerId, from: +row.dataset.pos };
    row.classList.add('drag');
    try { g.setPointerCapture(e.pointerId); } catch (_) {}
  });
  dqBody.addEventListener('pointermove', (e) => {
    if (!qDrag || e.pointerId !== qDrag.id) return;
    const list = qDrag.row.parentNode;
    let before = null;
    for (const r of list.children) {
      if (r === qDrag.row) continue;
      const b = r.getBoundingClientRect();
      if (e.clientY < b.top + b.height / 2) { before = r; break; }
    }
    if (before !== qDrag.row.nextSibling) list.insertBefore(qDrag.row, before);
    const b = dqBody.getBoundingClientRect();
    if (e.clientY < b.top + 40) dqBody.scrollTop -= 10; else if (e.clientY > b.bottom - 40) dqBody.scrollTop += 10;
  });
  const qEnd = (e) => {
    if (!qDrag || e.pointerId !== qDrag.id) return;
    const { row, from } = qDrag;
    qDrag = null;
    row.classList.remove('drag');
    const rows = Array.from(row.parentNode.children);
    // строка встала на i-е место списка — значит, в очереди она займёт i-ю из старых позиций этого списка
    const olds = rows.map((r) => +r.dataset.pos).sort((x, y) => x - y);
    const to = olds[rows.indexOf(row)];
    if (to !== from) S.moveQueue(from, to); else renderQ();
  };
  dqBody.addEventListener('pointerup', qEnd);
  dqBody.addEventListener('pointercancel', qEnd);
  if (!APK) syncQ();

  // ---------- Настройки окном с разделами (широкое окно) ----------
  // Эквалайзер, Эффекты и Темы на ПК открываются не вкладкой, а окном поверх текущего экрана.
  // Панели переносятся в окно на время показа и возвращаются на место при закрытии.
  const wide = () => matchMedia('(min-width: 821px)').matches;
  const SECS = [['eq', 'Эквалайзер', IC.eq], ['fx', 'Эффекты', IC.fx], ['themes', 'Внешний вид', IC.look], ['keys', 'Клавиши', IC.keys]];
  const PC = !!(window.squadNative && window.squadNative.playerState); // раздел «Компьютер» заполняет js/native.js
  if (PC) SECS.push(['pc', 'Компьютер', IC.pc]);
  const gear = document.createElement('button');
  gear.className = 'tab dk-gear';
  gear.dataset.label = 'Настройки';
  gear.innerHTML = '<svg class="tab-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="' + IC.gear + '"/></svg>Настройки';
  $('tabs').after(gear);
  const md = document.createElement('div');
  md.className = 'dset';
  md.innerHTML = '<div class="dset-box" role="dialog" aria-label="Настройки"><nav class="dset-nav"><h2>Настройки</h2>' +
    SECS.map(([id, l, ic]) => '<button data-sec="' + id + '">' + svg(ic) + l + '</button>').join('') +
    '</nav><div class="dset-body"><header class="dset-top"><h3></h3><button class="icon-btn" data-x title="Закрыть (Esc)">' + svg(IC.close) + '</button></header>' +
    '<section class="panel dset-keys" id="dset-keys">' +
    [['Пробел', 'Пауза / играть'], ['← / →', 'Перемотка на 5 секунд'], ['Ctrl + ← / →', 'Предыдущий / следующий трек'], ['Esc', 'Закрыть окно, текст или меню']]
      .map(([k, d]) => '<div class="dset-key"><span>' + d + '</span><kbd>' + k + '</kbd></div>').join('') + '</section>' +
    (PC ? '<section class="panel dset-pc" id="dset-pc"></section>' : '') + '</div></div>';
  document.body.appendChild(md);
  const mbody = md.querySelector('.dset-body');
  const homes = ['themes', 'fx', 'eq'].map((id) => { const el = $('panel-' + id); return [el, el.nextElementSibling]; }); // порядок важен для возврата
  let sec = null, back = 'home';
  function openSet(id) {
    if (!sec) homes.slice().reverse().forEach(([el]) => mbody.appendChild(el));
    sec = id;
    md.classList.add('show');
    md.querySelectorAll('[data-sec]').forEach((b) => b.classList.toggle('on', b.dataset.sec === id));
    mbody.querySelectorAll('.panel').forEach((el) => el.classList.toggle('dset-on', el.id === 'panel-' + id || el.id === 'dset-' + id));
    md.querySelector('.dset-top h3').textContent = SECS.find((x) => x[0] === id)[1];
    gear.classList.add('active');
  }
  function closeSet() {
    if (!sec) return;
    sec = null;
    md.classList.remove('show');
    gear.classList.remove('active');
    homes.forEach(([el, next]) => { el.classList.remove('dset-on'); next.before(el); });
  }
  gear.onclick = () => (sec ? closeSet() : openSet('eq'));
  md.addEventListener('click', (e) => {
    if (e.target === md || e.target.closest('[data-x]')) { closeSet(); return; }
    const b = e.target.closest('[data-sec]');
    if (b) openSet(b.dataset.sec);
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sec && !st.open) closeSet(); });
  // вкладка настроек в широком окне — открываем окно, а экран под ним оставляем прежним
  S.on('tab', () => {
    const t = S.settings.tab;
    if (!['eq', 'fx', 'themes'].includes(t)) { back = t; return; }
    if (!wide()) { closeSet(); return; }
    S.showTab(back === t ? 'home' : back);
    openSet(t);
  });
  window.addEventListener('resize', () => { if (sec && !wide()) closeSet(); });
  if (['eq', 'fx', 'themes'].includes(S.settings.tab) && wide()) S.showTab('home');

  // Кнопки окна .exe — последними в документе: Electron считает зоны перетаскивания по порядку элементов,
  // и полоса перетаскивания над контентом (она ниже в разметке) перекрывала их — кнопки не нажимались
  if (root.classList.contains('desk')) document.body.appendChild($('winctl'));
})();
