/* Обновления «по воздуху» — плашка сверху и отдельная панель, как в SQUAD VPN.
 * Android: APK скачивается внутри приложения (android-src/SquadUpdaterPlugin.java), потом «Установить».
 * Windows (установщик): electron-updater качает сам, потом «Перезапустить и установить».
 * Portable .exe и браузер: кнопка открывает файл на GitHub.
 */
(function () {
  'use strict';

  const REPO = 'JEFFRIPPER/SQUAD-SOUND';
  const GITHUB = 'https://github.com/' + REPO;
  const native = window.squadNative || null;
  const cap = window.Capacitor;
  const isAndroid = !!(cap && cap.getPlatform && cap.getPlatform() === 'android');
  const apkUpdater = isAndroid && cap.nativePromise ? (m, o) => cap.nativePromise('SquadUpdater', m, o || {}) : null;
  const electronAuto = !!(native && native.autoUpdate);
  const $ = (id) => document.getElementById(id);

  // phase: idle | checking | latest | available | downloading | ready | error
  const st = { phase: 'idle', cur: '', version: '', notes: '', url: '', page: GITHUB + '/releases/latest', size: 0, percent: 0, msg: '' };
  let bannerClosed = false;

  function newer(a, b) {
    const pa = String(a).replace(/^v/, '').split('.').map(Number);
    const pb = String(b).replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) > (pb[i] || 0)) return true;
      if ((pa[i] || 0) < (pb[i] || 0)) return false;
    }
    return false;
  }

  function openUrl(url) {
    if (native && native.openExternal) native.openExternal(url);
    else if (apkUpdater) apkUpdater('openUrl', { url }).catch(() => { window.location.href = url; });
    else window.open(url, '_blank', 'noopener');
  }

  // ---------- Отрисовка ----------
  const hasUpdate = () => ['available', 'downloading', 'ready'].includes(st.phase) ||
    (st.phase === 'error' && !!st.version);

  function mainAction() {
    if (st.phase === 'ready') return [electronAuto ? 'Перезапустить и установить' : 'Установить', install];
    if (st.phase === 'downloading') return [null, null];
    if (hasUpdate()) {
      if (apkUpdater) return ['Скачать и установить', download];
      if (electronAuto) return [null, null]; // electron-updater уже качает сам
      return ['Скачать с GitHub', () => openUrl(st.url || st.page)];
    }
    return ['Проверить обновления', () => check(true)];
  }

  function statusText() {
    switch (st.phase) {
      case 'checking': return 'Проверяю…';
      case 'latest': return 'У вас последняя версия';
      case 'available': return 'Доступна версия ' + st.version;
      case 'downloading': return 'Скачиваю ' + st.version + (st.percent ? ' · ' + st.percent + '%' : '…');
      case 'ready': return 'Версия ' + st.version + ' скачана, осталось установить';
      case 'error': return st.msg || 'Не получилось, попробуйте ещё раз';
      default: return 'Новая версия ищется при каждом запуске';
    }
  }

  function render() {
    const [label, act] = mainAction();
    const text = statusText();
    const pct = st.phase === 'ready' ? 100 : st.percent;

    // Плашка сверху
    const banner = $('update-banner');
    banner.classList.toggle('show', hasUpdate() && !bannerClosed);
    $('ub-title').textContent = st.phase === 'ready' ? 'Готово к установке' : 'Есть обновление';
    $('ub-sub').textContent = st.phase === 'downloading' ? 'Скачиваю ' + st.percent + '%' : st.phase === 'ready'
      ? 'Осталось установить' : st.phase === 'error' ? 'Не скачалось, попробуйте ещё раз' : 'Версия ' + st.version;
    $('ub-btn').textContent = st.phase === 'ready' ? 'УСТАНОВИТЬ' : 'ОБНОВИТЬ';
    $('ub-btn').classList.toggle('loading', st.phase === 'downloading');
    $('ub-progress').style.width = (st.phase === 'downloading' ? pct : 0) + '%';

    // Панель
    $('up-cur').textContent = st.cur ? 'v' + st.cur : '';
    $('up-new').textContent = hasUpdate() ? st.version : '';
    $('up-arrow').classList.toggle('hidden', !hasUpdate());
    $('up-status').textContent = text;
    $('up-notes').textContent = st.notes;
    $('up-notes').classList.toggle('hidden', !st.notes || !hasUpdate());
    $('up-bar').classList.toggle('hidden', !(st.phase === 'downloading' || st.phase === 'ready' || st.phase === 'checking'));
    $('up-bar').classList.toggle('indeterminate', st.phase === 'checking' || (st.phase === 'downloading' && !st.percent));
    $('up-bar-fill').style.width = pct + '%';
    const btn = $('up-main');
    btn.classList.toggle('hidden', !label);
    btn.textContent = label || '';
    btn.disabled = st.phase === 'checking';
    btn.onclick = act;

    // Карточка «Обновления» во вкладке «Темы»
    $('upd-status').textContent = text;
    $('btn-check-update').textContent = hasUpdate() ? 'Обновить' : 'Проверить обновления';
  }

  function set(patch) { Object.assign(st, patch); render(); }

  function openPanel() {
    const p = $('update-panel');
    clearTimeout(closeTimer);
    p.classList.remove('closing');
    $('up-sheet').style.transform = '';
    render();
    p.classList.add('show');
  }
  let closeTimer = null;
  function closePanel() {
    const p = $('update-panel');
    if (!p.classList.contains('show') || p.classList.contains('closing')) return;
    p.classList.add('closing'); // MD3: уход с ускорением, потом прячем
    closeTimer = setTimeout(() => { p.classList.remove('show', 'closing'); $('up-sheet').style.transform = ''; }, 240);
  }

  // Шторку на телефоне можно смахнуть вниз за верхнюю часть
  (function swipe() {
    const sheet = $('up-sheet');
    let y0 = null, dy = 0;
    sheet.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || e.clientY - sheet.getBoundingClientRect().top > 70) return;
      y0 = e.clientY; dy = 0; sheet.classList.add('dragging');
    });
    window.addEventListener('pointermove', (e) => {
      if (y0 == null) return;
      dy = Math.max(0, e.clientY - y0);
      sheet.style.transform = 'translateY(' + dy + 'px)';
    });
    const end = () => {
      if (y0 == null) return;
      y0 = null; sheet.classList.remove('dragging');
      if (dy > 90) closePanel();
      else { sheet.style.transition = 'transform 300ms cubic-bezier(.34,1.4,.64,1)'; sheet.style.transform = '';
        setTimeout(() => { sheet.style.transition = ''; }, 320); }
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  })();

  // ---------- Проверка ----------
  async function check(manual) {
    if (st.phase === 'downloading' || st.phase === 'checking') return;
    const before = Object.assign({}, st);
    if (manual) set({ phase: 'checking', msg: '' });
    if (electronAuto) {
      // electron-updater сам скачает, а описание версии берём с GitHub
      fetchRelease().catch(() => {});
      native.checkUpdate();
      return;
    }
    try {
      const rel = await fetchRelease();
      if (!newer(rel.tag_name, st.cur)) { set({ phase: manual ? 'latest' : 'idle', version: '' }); return; }
      if (before.phase === 'ready' && before.version === rel.tag_name) { set({ phase: 'ready' }); return; }
      set({ phase: 'available', msg: '' });
      if (apkUpdater) syncAndroid();
    } catch (e) {
      if (['available', 'ready'].includes(before.phase)) set({ phase: before.phase });
      else set({ phase: manual ? 'error' : 'idle', msg: 'Не удалось проверить: ' + (/^HTTP/.test(e.message) ? 'GitHub ответил ' + e.message : 'нет связи с GitHub') });
    }
  }

  async function fetchRelease() {
    const r = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rel = await r.json();
    const want = isAndroid ? /android\.apk$/i : /portable\.exe$/i;
    const asset = (rel.assets || []).find((a) => want.test(a.name));
    const m = /\*\*Что нового:\*\*\s*(.+)/.exec(rel.body || '');
    Object.assign(st, {
      version: rel.tag_name,
      notes: m ? m[1].trim() : '',
      url: asset ? asset.browser_download_url : '',
      size: asset ? asset.size : 0,
      page: rel.html_url || st.page,
    });
    render();
    return rel;
  }

  // ---------- Android: скачать APK и установить ----------
  let poll = null;
  async function syncAndroid() {
    try {
      const s = await apkUpdater('status');
      if (s.state === 'downloading') {
        set({ phase: 'downloading', percent: s.total ? Math.floor((s.done / s.total) * 100) : 0 });
        if (!poll) poll = setInterval(syncAndroid, 400);
        return;
      }
      clearInterval(poll); poll = null;
      if (s.state === 'ready' && s.version === st.version) set({ phase: 'ready', percent: 100 });
      else if (s.state === 'error' && st.phase === 'downloading') set({ phase: 'error', msg: 'Не скачалось: ' + s.error });
    } catch (_) {
      clearInterval(poll); poll = null;
    }
  }

  async function download() {
    if (!st.url) { openUrl(st.page); return; }
    set({ phase: 'downloading', percent: 0, msg: '' });
    try {
      await apkUpdater('download', { url: st.url, size: st.size, version: st.version });
      syncAndroid();
    } catch (e) {
      set({ phase: 'error', msg: 'Не скачалось: ' + (e.message || e) });
    }
  }

  async function install() {
    if (electronAuto) { native.installUpdate(); return; }
    try {
      const r = await apkUpdater('install');
      if (r && r.needPermission) {
        set({ msg: '' });
        $('up-status').textContent = 'Разрешите установку для SQUAD SOUND, вернитесь и нажмите «Установить» ещё раз';
      }
    } catch (e) {
      set({ phase: 'error', msg: e.message || String(e) });
    }
  }

  // ---------- Windows: события electron-updater ----------
  if (electronAuto) {
    native.onUpdate((ev) => {
      if (ev.type === 'available') set({ phase: 'downloading', version: 'v' + ev.version, percent: 0 });
      else if (ev.type === 'progress') set({ phase: 'downloading', percent: Math.round(ev.percent) });
      else if (ev.type === 'downloaded') set({ phase: 'ready', version: 'v' + ev.version, percent: 100 });
      else if (ev.type === 'none') set({ phase: ev.manual ? 'latest' : 'idle' });
      else if (ev.type === 'error') {
        if (hasUpdate()) set({ phase: 'available' }); // кнопка откроет GitHub
        else set({ phase: ev.manual ? 'error' : 'idle', msg: 'Не удалось проверить обновления' });
      }
    });
  }

  // ---------- Кнопки ----------
  $('ub-btn').onclick = (e) => {
    e.stopPropagation();
    openPanel();
    const [, act] = mainAction();
    if (act && st.phase !== 'error') act();
  };
  $('update-banner').onclick = openPanel;
  $('ub-close').onclick = (e) => { e.stopPropagation(); bannerClosed = true; render(); };
  $('up-close').onclick = closePanel;
  $('update-panel').onclick = (e) => { if (e.target.id === 'update-panel') closePanel(); };
  $('up-github').onclick = () => openUrl(st.page);
  $('btn-github').onclick = () => openUrl(GITHUB);

  window.squadCheckUpdates = function (manual) {
    if (manual) {
      openPanel();
      if (!hasUpdate()) check(true);
      return;
    }
    check(false);
  };

  // Вернулись из настроек «Установка неизвестных приложений» или из фона
  document.addEventListener('visibilitychange', () => { if (!document.hidden && apkUpdater) syncAndroid(); });

  (async () => {
    st.cur = String(native ? await native.version() : (window.SQUAD_VERSION || '0.0.0')).replace(/^v/, '');
    render();
    if (apkUpdater) syncAndroid();
    setTimeout(() => check(false), 3000);
    setInterval(() => check(false), 3 * 60 * 60 * 1000);
  })();
})();
