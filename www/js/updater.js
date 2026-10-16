/* Обновления «по воздуху».
 * Windows (установщик): electron-updater сам качает новую версию из GitHub Releases,
 *   ставится при перезапуске.
 * Android и portable .exe: проверяем последний релиз и предлагаем скачать новый файл.
 */
(function () {
  'use strict';

  const REPO = 'JEFFRIPPER/SQUAD-SOUND';
  const native = window.squadNative || null;
  const cap = window.Capacitor;
  const isAndroid = !!(cap && cap.getPlatform && cap.getPlatform() === 'android');

  const bar = document.getElementById('update-bar');
  const text = document.getElementById('update-text');
  const btn = document.getElementById('update-btn');
  const close = document.getElementById('update-close');
  close.onclick = () => bar.classList.remove('show');

  function show(msg, label, action) {
    text.textContent = msg;
    btn.textContent = label || '';
    btn.classList.toggle('hidden', !label);
    btn.onclick = action || null;
    bar.classList.add('show');
  }

  function newer(a, b) {
    const pa = String(a).replace(/^v/, '').split('.').map(Number);
    const pb = String(b).replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) > (pb[i] || 0)) return true;
      if ((pa[i] || 0) < (pb[i] || 0)) return false;
    }
    return false;
  }

  async function currentVersion() {
    return native ? native.version() : (window.SQUAD_VERSION || '0.0.0');
  }

  // Проверка через GitHub Releases (Android, portable .exe)
  async function checkRelease(manual) {
    try {
      const r = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rel = await r.json();
      const cur = await currentVersion();
      if (!newer(rel.tag_name, cur)) {
        if (manual) show('У вас последняя версия v' + cur);
        return;
      }
      const want = isAndroid ? /\.apk$/i : /portable\.exe$/i;
      const asset = (rel.assets || []).find((a) => want.test(a.name));
      const url = asset ? asset.browser_download_url : rel.html_url;
      show('Доступна версия ' + rel.tag_name, 'Скачать', () => {
        if (native && native.openExternal) native.openExternal(url);
        else window.location.href = url; // Capacitor откроет ссылку в браузере, APK скачается
      });
    } catch (e) {
      if (manual) show('Не удалось проверить обновления: ' + e.message);
    }
  }

  window.squadCheckUpdates = function (manual) {
    if (manual) show('Проверяю обновления…');
    if (native && native.autoUpdate) return native.checkUpdate();
    if (native || isAndroid) return checkRelease(manual);
    if (manual) show('Обновления доступны в версиях для Windows и Android');
  };

  if (native && native.autoUpdate) {
    native.onUpdate((ev) => {
      if (ev.type === 'available') show('Скачиваю обновление v' + ev.version + '…');
      else if (ev.type === 'progress') show('Скачиваю обновление: ' + Math.round(ev.percent) + '%');
      else if (ev.type === 'downloaded') show('Обновление v' + ev.version + ' готово', 'Перезапустить', () => native.installUpdate());
      else if (ev.type === 'none' && ev.manual) show('У вас последняя версия');
      else if (ev.type === 'error' && ev.manual) show('Не удалось проверить обновления');
    });
  }

  // Автопроверка при запуске
  setTimeout(() => window.squadCheckUpdates(false), 4000);
})();
