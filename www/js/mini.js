/* Мини-плеер .exe: показывает состояние из главного окна и шлёт ему команды через electron/preload-mini.js */
(function () {
  'use strict';
  const M = window.squadMini;
  const $ = (id) => document.getElementById(id);
  const PLAY = 'M7 4v16l13-8z', PAUSE = 'M6 4h4v16H6zM14 4h4v16h-4z';
  let st = { has: false, playing: false, cur: 0, dur: 0, rate: 1 }, at = 0;
  if (!M) return;
  M.onState((s) => {
    st = s; at = performance.now();
    $('mp').classList.toggle('off', !s.has);
    $('title').textContent = s.has ? s.title : 'Ничего не играет';
    $('artist').textContent = s.has ? s.artist || '—' : 'SQUAD SOUND';
    $('letter').textContent = s.has ? (s.title[0] || 'S').toUpperCase() : 'S';
    const art = $('art');
    if (s.thumb && art.getAttribute('src') !== s.thumb) art.src = s.thumb;
    $('art').parentNode.classList.toggle('has', !!(s.has && s.thumb));
    $('pp').setAttribute('d', s.playing ? PAUSE : PLAY);
    if (s.theme) for (const k of ['accent', 'bg', 'text']) if (s.theme[k]) document.documentElement.style.setProperty('--' + k, s.theme[k]);
    document.title = s.has ? s.title + ' — SQUAD SOUND' : 'SQUAD SOUND — мини-плеер';
    draw();
  });
  // между сообщениями (раз в секунду) прогресс досчитываем сами, чтобы полоска шла плавно
  function draw() {
    const pos = st.cur + (st.playing ? ((performance.now() - at) / 1000) * (st.rate || 1) : 0);
    $('prog').style.width = st.dur ? Math.min(100, (pos / st.dur) * 100) + '%' : '0';
  }
  setInterval(() => { if (st.playing) draw(); }, 250);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (b) M.cmd(b.dataset.c);
  });
  $('bar').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (st.has && st.dur) M.cmd('seek', (e.clientX - r.left) / r.width);
  });
})();
