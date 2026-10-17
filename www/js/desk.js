/* Тексты песен и караоке на ПК: кнопки в панели «Сейчас играет» и текст на всё окно с подсветкой строки.
 * Только для .exe/браузера (html без .apk). Поиск текстов — общий модуль js/lyrics.js.
 */
(function () {
  'use strict';
  const root = document.documentElement;
  const S = window.SquadApp, L = window.SquadLyrics;
  if (root.classList.contains('apk') || !S || !L) return;

  const $ = (id) => document.getElementById(id);
  const esc = S.esc;
  const svg = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  const IC = {
    lyrics: 'M4 5h16M4 10h16M4 15h10M4 20h7',
    mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
    close: 'M6 6l12 12M18 6 6 18',
  };

  // ---------- Кнопки в панели плеера ----------
  const acts = document.querySelector('.np-actions');
  const bLyr = document.createElement('button');
  bLyr.className = 'chip dk-chip';
  bLyr.innerHTML = svg(IC.lyrics) + 'Текст';
  const bKara = document.createElement('button');
  bKara.className = 'chip dk-chip';
  bKara.innerHTML = svg(IC.mic) + 'Караоке';
  acts.append(bLyr, bKara);

  // ---------- Текст на всё окно ----------
  const ov = document.createElement('div');
  ov.className = 'dl';
  ov.innerHTML = '<div class="dl-bg"></div><header class="dl-head"><img class="dl-art" alt=""><div class="dl-meta"><b></b><span></span></div>' +
    '<button class="chip dl-kara">' + svg(IC.mic) + '<span>Караоке</span></button>' +
    '<button class="icon-btn dl-close" title="Закрыть (Esc)">' + svg(IC.close) + '</button></header>' +
    '<div class="dl-body"><div class="dl-lines"></div></div>';
  document.body.appendChild(ov);
  const body = ov.querySelector('.dl-body'), box = ov.querySelector('.dl-lines'), kb = ov.querySelector('.dl-kara');
  const st = { open: false, kara: false, key: null, lines: null, cur: -1, raf: 0 };

  function setKara(on) {
    st.kara = on;
    S.setFx('karaoke', on ? 1 : 0);
    ov.classList.toggle('kara', on);
    kb.classList.toggle('on', on);
    bKara.classList.toggle('on', on && st.open);
    kb.lastChild.textContent = on ? 'Голос убран' : 'Караоке';
    st.cur = -1;
  }
  function open(kara) {
    st.open = true;
    ov.classList.add('show');
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
    if (st.kara) setKara(false); // закрыли — голос возвращается
    bKara.classList.remove('on');
  }
  bLyr.onclick = () => (st.open ? close() : open(false));
  bKara.onclick = () => (st.open && st.kara ? close() : open(true));
  kb.onclick = () => setKara(!st.kara);
  ov.querySelector('.dl-close').onclick = close;
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.open) close(); });
  body.addEventListener('click', (e) => {
    if (e.target.closest('[data-dl="retry"]')) { const t = S.cur(); if (t) { L.forget(t.key); load(); } return; }
    const l = e.target.closest('[data-t]');
    if (l) S.seek(+l.dataset.t);
  });

  function head(t) {
    ov.querySelector('.dl-meta b').textContent = t ? t.title : 'Ничего не играет';
    ov.querySelector('.dl-meta span').textContent = t ? t.artist || '' : '';
    const src = $('cover-img').getAttribute('src') || '';
    ov.querySelector('.dl-art').src = src;
    ov.querySelector('.dl-bg').style.backgroundImage = src ? 'url("' + src.replace(/"/g, '%22') + '")' : '';
  }
  async function load() {
    const t = S.cur();
    cancelAnimationFrame(st.raf);
    head(t);
    if (!t) { box.innerHTML = '<p class="dl-hint">Включите трек — здесь появится его текст.</p>'; return; }
    st.key = t.key; st.lines = null; st.cur = -1;
    box.innerHTML = '<p class="dl-hint">Ищем текст…</p>';
    try {
      const r = await L.get(t);
      if (st.key !== t.key || !st.open) return;
      if (r.none) { box.innerHTML = '<p class="dl-hint">Текст не нашёлся ни в файле, ни в LRCLIB, ни в lyrics.ovh.</p><button class="chip" data-dl="retry">Искать снова</button>'; return; }
      if (r.instrumental && !r.synced && !r.plain) { box.innerHTML = '<p class="dl-hint">Это инструментальный трек.</p>'; return; }
      const lines = L.parse(r.synced);
      if (lines.length) {
        st.lines = lines;
        box.innerHTML = lines.map((l, i) => '<p data-i="' + i + '" data-t="' + l.t + '">' + (esc(l.text) || '♪') + '</p>').join('');
        tick();
      } else box.innerHTML = '<div class="dl-plain">' + esc(r.plain).replace(/\n/g, '<br>') + '</div>';
      if (r.src) box.insertAdjacentHTML('beforeend', '<p class="dl-src">Текст: ' + esc(r.src) + '</p>');
    } catch (_) {
      if (st.key === t.key) box.innerHTML = '<p class="dl-hint">Не удалось загрузить текст. Проверьте интернет.</p><button class="chip" data-dl="retry">Ещё раз</button>';
    }
  }
  function tick() {
    if (!st.open || !st.lines) return;
    const now = S.time().cur + 0.25;
    let i = -1;
    for (let k = 0; k < st.lines.length && st.lines[k].t <= now; k++) i = k;
    if (i !== st.cur) {
      const prev = box.querySelector('.on');
      if (prev) prev.classList.remove('on');
      const el = box.querySelector('[data-i="' + i + '"]');
      if (el) {
        el.classList.add('on');
        body.scrollTo({ top: el.offsetTop - body.clientHeight / 2 + el.offsetHeight / 2, behavior: st.cur < 0 ? 'auto' : 'smooth' });
      } else if (i < 0) body.scrollTo({ top: 0 });
      st.cur = i;
    }
    st.raf = requestAnimationFrame(tick);
  }
  S.on('track', () => { if (st.open && (S.cur() || {}).key !== st.key) load(); });
  // обложка подгружается после события трека
  new MutationObserver(() => { if (st.open) head(S.cur()); }).observe($('cover-img'), { attributes: true, attributeFilter: ['src'] });
})();
