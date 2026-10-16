/* Material Design 3: рябь от точки касания и перезапуск анимаций при смене трека. */
(function () {
  'use strict';

  const RIPPLE = '.btn, .chip, .tab, .icon-btn, .play-btn, .track, .menu button, .theme, .t-more';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('pointerdown', (e) => {
    if (reduce || e.button > 0) return;
    const el = e.target.closest(RIPPLE);
    if (!el || el.disabled || e.target.closest('.t-handle')) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    // радиус — до самого дальнего угла, чтобы волна закрыла весь элемент
    const size = 2 * Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
    const s = document.createElement('span');
    s.className = 'md-ripple';
    s.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (x - size / 2) + 'px;top:' + (y - size / 2) + 'px';
    el.appendChild(s);
    const born = Date.now();
    const release = () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      // даём волне дорасти хотя бы немного, потом гасим
      setTimeout(() => { s.classList.add('out'); setTimeout(() => s.remove(), 350); }, Math.max(0, 180 - (Date.now() - born)));
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }, { passive: true });

  // Новый трек — название и исполнитель мягко «въезжают» снизу
  const replay = (el) => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; };
  ['np-title', 'np-artist'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    let last = el.textContent;
    new MutationObserver(() => { if (el.textContent !== last) { last = el.textContent; replay(el); } })
      .observe(el, { childList: true, characterData: true, subtree: true });
  });
})();
