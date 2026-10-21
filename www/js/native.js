/* .exe: трей, кнопки в превью на панели задач, глобальные горячие клавиши, мини-плеер, статус в Discord.
 * Само окно Windows и трей живут в electron/main.js; здесь — состояние плеера для них и раздел «Компьютер» в настройках.
 */
(function () {
  'use strict';
  const N = window.squadNative, S = window.SquadApp;
  if (!N || !N.playerState || !S) return;
  const $ = (id) => document.getElementById(id);
  const set = S.settings;
  if (set.pcTray == null) set.pcTray = false;
  if (set.pcHotkeys == null) set.pcHotkeys = true;
  if (set.pcDiscordOn == null) set.pcDiscordOn = false;
  if (set.pcDiscord == null) set.pcDiscord = '';
  const validId = (v) => /^\d{15,22}$/.test(v);

  // ---------- Состояние плеера → трей, превью, мини-плеер, Discord ----------
  let thumbKey = null, themeKey = '';
  function send() {
    const t = S.cur(), tm = S.time();
    const st = {
      has: !!t, title: t ? t.title : '', artist: t ? t.artist : '', playing: !!t && S.playing(),
      cur: tm.cur || 0, dur: isFinite(tm.dur) ? tm.dur : 0, rate: S.rate(),
    };
    const k = t ? t.key + '|' + (t.thumb || '').length : '';
    if (k !== thumbKey) { thumbKey = k; st.thumb = (t && t.thumb) || ''; } // обложку шлём только при смене
    const c = getComputedStyle(document.documentElement);
    const theme = { accent: c.getPropertyValue('--accent').trim(), bg: c.getPropertyValue('--bg').trim(), text: c.getPropertyValue('--text').trim() };
    const tk = JSON.stringify(theme);
    if (tk !== themeKey) { themeKey = tk; st.theme = theme; }
    N.playerState(st);
  }
  S.on('track', send);
  S.on('play', send);
  setInterval(send, 1000);
  send();

  N.onPlayerCmd((c, v) => {
    if (c === 'toggle') S.togglePlay();
    else if (c === 'next') S.step(1);
    else if (c === 'prev') S.step(-1);
    else if (c === 'volUp' || c === 'volDown') {
      const vol = Math.round(Math.min(1, Math.max(0, S.sound().volume + (c === 'volUp' ? 0.05 : -0.05))) * 100) / 100;
      S.setFx('volume', vol);
      S.toast('Громкость ' + Math.round(vol * 100) + '%');
    } else if (c === 'seek') {
      const d = S.time().dur;
      if (d && isFinite(d)) S.seek(Math.max(0, Math.min(1, v)) * d);
    }
    setTimeout(send, 60);
  });

  // ---------- Настройки → главный процесс ----------
  let busy = [];
  function apply() {
    const id = set.pcDiscord.trim();
    N.setNativeCfg({ tray: set.pcTray, hotkeys: set.pcHotkeys, discord: set.pcDiscordOn && validId(id) ? id : '' })
      .then((r) => { busy = (r && r.busy) || []; syncUI(); }).catch(() => {});
  }
  apply();

  // ---------- Кнопка мини-плеера в нижнем плеере ----------
  const acts = document.querySelector('.np-actions');
  if (acts) {
    const b = document.createElement('button');
    b.className = 'chip dk-chip';
    b.title = 'Мини-плеер поверх всех окон';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3zM12 12h7v5h-7z"/></svg>Мини';
    b.onclick = () => N.openMini();
    acts.appendChild(b);
  }

  // ---------- Раздел «Компьютер» в окне настроек ----------
  const box = $('dset-pc');
  if (!box) return;
  const KEYS = [['Ctrl + Alt + Пробел', 'Пауза / играть'], ['Ctrl + Alt + → / ←', 'Следующий / предыдущий трек'], ['Ctrl + Alt + ↑ / ↓', 'Громкость']];
  const ACC = { 'Control+Alt+Space': 0, 'Control+Alt+Right': 1, 'Control+Alt+Left': 1, 'Control+Alt+Up': 2, 'Control+Alt+Down': 2 };
  box.innerHTML =
    '<div class="card"><h3>Окно</h3>' +
      '<label class="switch"><input type="checkbox" id="pc-tray"><span></span>Закрывать в трей</label>' +
      '<p class="hint">Крестик прячет окно в значок у часов, музыка играет дальше. Выйти: правой кнопкой по значку → «Выход».</p>' +
      '<div class="row wrap"><button class="btn" id="pc-mini">Открыть мини-плеер</button></div>' +
      '<p class="hint">Маленькое окно поверх всех окон: обложка, название и кнопки. Его можно перетащить куда удобно.</p></div>' +
    '<div class="card"><h3>Горячие клавиши в Windows</h3>' +
      '<label class="switch"><input type="checkbox" id="pc-hot"><span></span>Работают, даже когда окно свёрнуто</label>' +
      '<div class="pc-keys">' + KEYS.map(([k, d], i) => '<div class="dset-key" data-i="' + i + '"><span>' + d + '</span><kbd>' + k + '</kbd></div>').join('') + '</div>' +
      '<p class="hint" id="pc-hot-st"></p></div>' +
    '<div class="card"><h3>Статус в Discord</h3>' +
      '<label class="switch"><input type="checkbox" id="pc-dc"><span></span>Показывать в Discord, что я слушаю</label>' +
      '<div class="row"><input class="search" id="pc-dc-id" placeholder="ID приложения Discord" inputmode="numeric" maxlength="22" autocomplete="off" spellcheck="false"></div>' +
      '<p class="hint" id="pc-dc-st"></p>' +
      '<p class="hint">Нужно своё приложение Discord: открой discord.com/developers/applications, нажми New Application, назови его, например, SQUAD SOUND (это имя будет в статусе), и скопируй Application ID сюда. Картинку для статуса можно загрузить там же в Rich Presence → Art Assets под именем squad. Discord должен быть запущен на этом компьютере.</p></div>';

  const tr = $('pc-tray'), hot = $('pc-hot'), dc = $('pc-dc'), dcId = $('pc-dc-id');
  function syncUI() {
    tr.checked = set.pcTray;
    hot.checked = set.pcHotkeys;
    dc.checked = set.pcDiscordOn;
    if (document.activeElement !== dcId) dcId.value = set.pcDiscord;
    const bad = new Set(busy.map((a) => ACC[a]));
    box.querySelectorAll('.pc-keys .dset-key').forEach((el) => el.classList.toggle('pc-busy', set.pcHotkeys && bad.has(+el.dataset.i)));
    $('pc-hot-st').textContent = set.pcHotkeys && busy.length ? 'Часть сочетаний занята другой программой, они не работают: ' + busy.join(', ').replace(/Control/g, 'Ctrl') : '';
    const id = set.pcDiscord.trim();
    $('pc-dc-st').textContent = !set.pcDiscordOn ? '' : !id ? 'Вставь ID приложения, чтобы статус заработал.' : validId(id) ? 'Статус включён: появится, когда играет музыка.' : 'ID приложения — это число из 17–20 цифр.';
  }
  tr.onchange = () => { set.pcTray = tr.checked; S.saveSettings(); apply(); };
  hot.onchange = () => { set.pcHotkeys = hot.checked; S.saveSettings(); apply(); };
  dc.onchange = () => { set.pcDiscordOn = dc.checked; S.saveSettings(); apply(); };
  let idT = 0;
  dcId.oninput = () => {
    set.pcDiscord = dcId.value.replace(/\D+/g, '').slice(0, 22);
    if (dcId.value !== set.pcDiscord) dcId.value = set.pcDiscord;
    S.saveSettings(); syncUI();
    clearTimeout(idT); idT = setTimeout(apply, 600);
  };
  $('pc-mini').onclick = () => N.openMini();
  syncUI();
})();
