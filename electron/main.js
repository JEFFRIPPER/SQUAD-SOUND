// SQUAD SOUND — оболочка Electron для Windows (.exe)
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');

const WWW = path.join(__dirname, '..', 'www');

// Свой протокол app:// вместо file:// — иначе Chromium не грузит AudioWorklet (тон).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const AUDIO_RE = /\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|webm|mp4)$/i;

let mainWin = null;
let quitting = false; // настоящий выход (меню трея, обновление), а не «закрыть в трей»

function createWindow() {
  const win = mainWin = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#070203',
    title: 'SQUAD SOUND',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    // своя шапка окна в стиле Сквада (www: .titlebar); рамка и привязка к краям экрана остаются системными
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.removeMenu();
  win.loadURL('app://squad/index.html');
  const sendMax = () => win.webContents.send('win-state', { max: win.isMaximized(), full: win.isFullScreen() });
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(ev, sendMax);
  win.webContents.on('did-finish-load', sendMax);
  // Наружу открываем только https, а уйти со страницы приложения окну нельзя (squadNative не должен достаться чужой странице)
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://squad/')) e.preventDefault(); });
  // «Закрыть в трей»: окно прячется, музыка играет дальше
  win.on('close', (e) => { if (cfg.tray && tray && !quitting) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { mainWin = null; app.quit(); });
  win.once('ready-to-show', updateThumbar);
  win.on('show', updateThumbar);
}

// ---------- Автопоиск музыки по компьютеру ----------
// Папка пользователя целиком и остальные диски (D:, E:…), без системных и игровых папок.
const SKIP_DIRS = new Set(['windows', 'program files', 'program files (x86)', 'programdata', 'appdata', '$recycle.bin',
  'system volume information', 'recovery', 'perflogs', 'msocache', 'node_modules', 'steamapps', 'steamlibrary', 'steam',
  'epic games', 'riot games', 'xboxgames', 'windowsapps', 'origin games', 'ubisoft game launcher', 'battle.net',
  'cache', 'caches', 'temp', 'tmp', 'library', 'proc', 'sys', 'dev', 'snap', 'android', '.git']);
const MIN_SIZE = 500 * 1024; // отсекаем звуки уведомлений и игр
const MAX_FILES = 30000;

async function scanRoots() {
  const roots = new Set([app.getPath('home')]);
  for (const k of ['music', 'downloads', 'desktop', 'documents']) {
    try { roots.add(app.getPath(k)); } catch (_) {}
  }
  if (process.platform === 'win32') {
    const sys = (process.env.SystemDrive || 'C:').toUpperCase();
    for (const L of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      const d = L + ':\\';
      if ((L + ':') === sys) continue; // системный диск — только папка пользователя
      try { await fs.promises.access(d); roots.add(d); } catch (_) {}
    }
  }
  return Array.from(roots);
}

// Асинхронный обход папок: окно не подвисает даже на целом диске
async function collectAudio(roots, minSize) {
  const found = new Set();
  const seenDirs = new Set();
  const walkAsync = async (dir, depth) => {
    if (depth > 12 || found.size >= MAX_FILES) return;
    let real;
    try { real = await fs.promises.realpath(dir); } catch (_) { return; }
    if (seenDirs.has(real)) return;
    seenDirs.add(real);
    let entries;
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const name = e.name;
      if (name[0] === '.' || name[0] === '$') continue;
      const p = path.join(dir, name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(name.toLowerCase())) await walkAsync(p, depth + 1);
      } else if (e.isFile() && AUDIO_RE.test(name) && !/\.(webm|mp4)$/i.test(name)) {
        if (!minSize) found.add(p);
        else try { if ((await fs.promises.stat(p)).size >= minSize) found.add(p); } catch (_) {}
        if (found.size >= MAX_FILES) return;
      }
    }
  };
  for (const r of roots) await walkAsync(r, 0);
  return Array.from(found).sort((a, b) => a.localeCompare(b, 'ru'));
}
const scanMusic = async () => collectAudio(await scanRoots(), MIN_SIZE);

let scanning = null;
ipcMain.handle('scan-music', () => {
  if (!scanning) scanning = scanMusic().finally(() => { scanning = null; });
  return scanning;
});

ipcMain.handle('pick-files', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Добавить треки',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Аудио', extensions: ['mp3', 'flac', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'opus', 'webm'] }],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('pick-folder', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Добавить папку с музыкой',
    properties: ['openDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return [];
  return collectAudio([r.filePaths[0]], 0);
});

ipcMain.handle('read-file', async (_e, p) => {
  if (!AUDIO_RE.test(p)) throw new Error('Not an audio file');
  return fs.promises.readFile(p);
});

// Кусок файла — для чтения тегов без загрузки всего трека
ipcMain.handle('read-range', async (_e, p, start, length) => {
  if (!AUDIO_RE.test(p)) throw new Error('Not an audio file');
  const fh = await fs.promises.open(p, 'r');
  try {
    const { size } = await fh.stat();
    const s = Math.max(0, Math.min(start | 0, size));
    const len = Math.max(0, Math.min(length | 0, size - s));
    const buf = Buffer.alloc(len);
    if (len) await fh.read(buf, 0, len, s);
    return { size, data: buf };
  } finally {
    await fh.close();
  }
});

// Удаление трека с диска — только аудиофайлы и только в корзину, чтобы можно было вернуть
ipcMain.handle('delete-file', async (_e, p) => {
  if (typeof p !== 'string' || !AUDIO_RE.test(p) || /\.(webm|mp4)$/i.test(p)) throw new Error('Not an audio file');
  if (!fs.existsSync(p)) return true;
  await shell.trashItem(p);
  return true;
});

// Сеть для поиска в открытых источниках: из главного процесса нет ограничений CORS
ipcMain.handle('http-get', async (_e, url, binary) => {
  if (typeof url !== 'string' || new URL(url).protocol !== 'https:') throw new Error('Only https');
  const r = await net.fetch(url, { signal: AbortSignal.timeout(binary ? 180000 : 20000), headers: { 'User-Agent': 'SQUAD-SOUND/' + app.getVersion() } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  if (!binary) return r.text();
  const LIMIT = 300 * 1024 * 1024;
  if (+(r.headers.get('content-length') || 0) > LIMIT) throw new Error('Файл слишком большой');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.byteLength > LIMIT) throw new Error('Файл слишком большой');
  return buf;
});

// Сохранённые пути проверяем асинхронно пачками, а недоступные диски/сетевые папки — один раз на корень,
// иначе отключённая флешка или NAS вешают окно на минуты
ipcMain.handle('filter-existing', async (_e, paths) => {
  const list = (Array.isArray(paths) ? paths : []).filter((p) => typeof p === 'string');
  const rootOk = new Map();
  const rootOf = (p) => { const m = /^(\\\\[^\\]+\\[^\\]+|[A-Za-z]:\\|\/)/.exec(p); return m ? m[1] : ''; };
  const alive = async (p) => {
    const root = rootOf(p);
    if (root && !rootOk.has(root)) {
      rootOk.set(root, Promise.race([fs.promises.access(root).then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 3000))]));
    }
    if (root && !(await rootOk.get(root))) return false;
    return fs.promises.access(p).then(() => true, () => false);
  };
  const out = [];
  for (let i = 0; i < list.length; i += 64) {
    const part = list.slice(i, i + 64);
    const ok = await Promise.all(part.map(alive));
    part.forEach((p, j) => { if (ok[j]) out.push(p); });
  }
  return out;
});

// Переименовать трек на диске: только аудиофайлы, в той же папке, расширение не меняется; занято — «(2)», «(3)»…
ipcMain.handle('rename-file', async (_e, p, base) => {
  if (typeof p !== 'string' || typeof base !== 'string' || !AUDIO_RE.test(p) || /\.(webm|mp4)$/i.test(p)) throw new Error('Not an audio file');
  const clean = base.replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim().slice(0, 180);
  if (!clean) throw new Error('Пустое имя');
  const dir = path.dirname(p), ext = path.extname(p);
  let to = path.join(dir, clean + ext);
  if (to === p) return p;
  for (let i = 2; fs.existsSync(to) && to.toLowerCase() !== p.toLowerCase(); i++) to = path.join(dir, clean + ' (' + i + ')' + ext);
  await fs.promises.rename(p, to);
  return to;
});

// Перетащенные в окно папки раскрываем в список аудиофайлов
ipcMain.handle('expand-paths', async (_e, paths) => {
  const list = (Array.isArray(paths) ? paths : []).filter((p) => typeof p === 'string' && path.isAbsolute(p));
  const out = [];
  for (const p of list) {
    let st;
    try { st = await fs.promises.stat(p); } catch (_) { continue; }
    if (st.isDirectory()) out.push(...await collectAudio([p], 0));
    else if (st.isFile() && AUDIO_RE.test(p)) out.push(p);
    if (out.length >= MAX_FILES) break;
  }
  return out.slice(0, MAX_FILES);
});

ipcMain.on('win', (e, act) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  if (act === 'min') w.minimize();
  else if (act === 'max') { if (w.isFullScreen()) w.setFullScreen(false); else if (w.isMaximized()) w.unmaximize(); else w.maximize(); }
  else if (act === 'close') w.close();
});

ipcMain.handle('version', () => app.getVersion());

ipcMain.handle('open-external', (_e, url) => {
  if (/^https:\/\/github\.com\/JEFFRIPPER\/SQUAD-SOUND\//.test(url) || url === 'https://t.me/THKC_SQUAD') shell.openExternal(url);
});

// ---------- Управление плеером снаружи окна: трей, кнопки в превью панели задач, горячие клавиши, мини-плеер, Discord ----------
// Окно присылает состояние плеера (player-state), а команды из трея/превью/мини-плеера уходят ему же (player-cmd).
const ICONS = path.join(__dirname, 'icons');
const icon = (n) => nativeImage.createFromPath(path.join(ICONS, n + '.png'));
let cfg = { tray: false, hotkeys: true, discord: '' };
let pstate = { has: false, title: '', artist: '', playing: false, cur: 0, dur: 0, rate: 1, thumb: '', at: 0, theme: null };
let tray = null, miniWin = null;
const CMDS = new Set(['toggle', 'next', 'prev', 'volUp', 'volDown', 'seek']);

function showMain() {
  if (!mainWin) return;
  if (!mainWin.isVisible()) mainWin.show();
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.focus();
}
function playerCmd(c, v) {
  if (CMDS.has(c) && mainWin) mainWin.webContents.send('player-cmd', c, typeof v === 'number' && isFinite(v) ? v : 0);
}

function updateThumbar() {
  if (process.platform !== 'win32' || !mainWin || mainWin.isDestroyed()) return;
  const off = pstate.has ? [] : ['disabled'];
  try {
    mainWin.setThumbarButtons([
      { tooltip: 'Предыдущий', icon: icon('prev'), flags: off, click: () => playerCmd('prev') },
      { tooltip: pstate.playing ? 'Пауза' : 'Играть', icon: icon(pstate.playing ? 'pause' : 'play'), flags: off, click: () => playerCmd('toggle') },
      { tooltip: 'Следующий', icon: icon('next'), flags: off, click: () => playerCmd('next') },
    ]);
  } catch (_) {}
}

const trackLine = () => (pstate.has ? (pstate.artist ? pstate.artist + ' — ' : '') + pstate.title : 'Ничего не играет');
function updateTray() {
  if (!tray) return;
  tray.setToolTip(('SQUAD SOUND\n' + trackLine()).slice(0, 127)); // Windows обрезает подсказку трея до 127 символов
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: trackLine().slice(0, 60), enabled: false },
    { type: 'separator' },
    { label: pstate.playing ? 'Пауза' : 'Играть', enabled: pstate.has, click: () => playerCmd('toggle') },
    { label: 'Следующий', enabled: pstate.has, click: () => playerCmd('next') },
    { label: 'Предыдущий', enabled: pstate.has, click: () => playerCmd('prev') },
    { type: 'separator' },
    { label: 'Мини-плеер', click: openMini },
    { label: 'Открыть SQUAD SOUND', click: showMain },
    { type: 'separator' },
    { label: 'Выход', click: () => { quitting = true; app.quit(); } },
  ]));
}
function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: 32, height: 32 }));
  } catch (e) { console.error(e); tray = null; return; }
  tray.on('click', showMain);
  updateTray();
}

// Глобальные горячие клавиши работают, даже когда окно свёрнуто или в трее. Занятые другой программой сочетания пропускаем.
const HOTKEYS = [['Control+Alt+Space', 'toggle'], ['Control+Alt+Right', 'next'], ['Control+Alt+Left', 'prev'], ['Control+Alt+Up', 'volUp'], ['Control+Alt+Down', 'volDown']];
function applyHotkeys() {
  globalShortcut.unregisterAll();
  if (!cfg.hotkeys) return [];
  const busy = [];
  for (const [acc, c] of HOTKEYS) {
    let ok = false;
    try { ok = globalShortcut.register(acc, () => playerCmd(c)); } catch (_) {}
    if (!ok) busy.push(acc);
  }
  return busy;
}

// Мини-плеер: маленькое окно поверх всех окон
let miniPos = null;
function openMini() {
  if (miniWin) { miniWin.show(); miniWin.focus(); return; }
  const { screen } = require('electron');
  const wa = screen.getPrimaryDisplay().workArea;
  const W = 360, H = 104;
  const pos = miniPos || { x: wa.x + wa.width - W - 24, y: wa.y + wa.height - H - 24 };
  miniWin = new BrowserWindow({
    width: W, height: H, x: pos.x, y: pos.y, frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
    title: 'SQUAD SOUND — мини-плеер', icon: path.join(__dirname, '..', 'build', 'icon.png'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-mini.js'), contextIsolation: true, nodeIntegration: false },
  });
  miniWin.setAlwaysOnTop(true, 'floating');
  miniWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  miniWin.webContents.on('will-navigate', (e) => e.preventDefault());
  miniWin.loadURL('app://squad/mini.html');
  miniWin.once('ready-to-show', () => { sendMini(); miniWin.showInactive(); });
  miniWin.on('moved', () => { if (miniWin) { const [x, y] = miniWin.getPosition(); miniPos = { x, y }; } });
  miniWin.on('closed', () => { miniWin = null; });
}
function sendMini() { if (miniWin && !miniWin.isDestroyed()) miniWin.webContents.send('mini-state', pstate); }
ipcMain.on('mini-cmd', (e, c, v) => {
  if (!miniWin || e.sender !== miniWin.webContents) return;
  if (c === 'close') miniWin.close();
  else if (c === 'show') showMain();
  else playerCmd(c, v);
});

// ---------- Discord Rich Presence: свой маленький клиент локального IPC Discord ----------
// Нужен ID приложения пользователя с discord.com/developers. Discord принимает не больше 5 обновлений за 20 секунд.
const discord = (() => {
  const sockNet = require('net');
  let id = '', sock = null, ready = false, buf = Buffer.alloc(0), retryT = null, flushT = null, last = 0, nonce = 0;
  let want = null, sent = 'none', lvl = 0; // lvl: 1 — без «Слушает», 2 — ещё и без картинки по ссылке (старый Discord)
  const pipe = (i) => (process.platform === 'win32' ? '\\\\?\\pipe\\discord-ipc-' + i
    : path.join(process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp', 'discord-ipc-' + i));
  const write = (op, obj) => {
    if (!sock) return;
    const body = Buffer.from(JSON.stringify(obj));
    const head = Buffer.alloc(8);
    head.writeInt32LE(op, 0); head.writeInt32LE(body.length, 4);
    sock.write(Buffer.concat([head, body]));
  };
  function retry() { clearTimeout(retryT); if (id) retryT = setTimeout(() => connect(0), 20000); }
  function connect(i) {
    if (!id || sock) return;
    const s = sockNet.createConnection(pipe(i));
    let opened = false;
    sock = s;
    s.on('connect', () => { opened = true; write(0, { v: 1, client_id: id }); });
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 8) {
        const op = buf.readInt32LE(0), len = buf.readInt32LE(4);
        if (buf.length < 8 + len) break;
        let msg = null;
        try { msg = JSON.parse(buf.subarray(8, 8 + len).toString()); } catch (_) {}
        buf = buf.subarray(8 + len);
        onMsg(op, msg || {});
      }
    });
    s.on('error', () => {});
    s.on('close', () => {
      if (sock !== s) return;
      sock = null; ready = false; buf = Buffer.alloc(0); sent = 'none';
      if (!opened && i < 9) connect(i + 1); else retry();
    });
  }
  function onMsg(op, msg) {
    if (op === 3) { write(4, msg); return; } // ping → pong
    if (op === 2) { if (sock) sock.destroy(); return; } // Discord закрыл: неверный ID приложения и т. п.
    if (msg.evt === 'READY') { ready = true; flush(); return; }
    if (msg.evt === 'ERROR' && msg.cmd === 'SET_ACTIVITY' && lvl < 2) { lvl++; sent = 'none'; flush(); }
  }
  function flush() {
    clearTimeout(flushT);
    if (!ready) return;
    const key = JSON.stringify(want);
    if (key === sent) return;
    const wait = last + 4500 - Date.now();
    if (wait > 0) { flushT = setTimeout(flush, wait); return; }
    last = Date.now(); sent = key;
    const activity = want && Object.assign({}, want);
    if (activity && lvl > 0) delete activity.type;
    if (activity && lvl > 1) activity.assets = { large_image: 'squad', large_text: 'SQUAD SOUND' };
    write(1, { cmd: 'SET_ACTIVITY', args: activity ? { pid: process.pid, activity } : { pid: process.pid }, nonce: String(++nonce) });
  }
  function stop() { clearTimeout(retryT); clearTimeout(flushT); if (sock) { const s = sock; sock = null; ready = false; s.destroy(); } }
  return {
    setId(v) {
      v = /^\d{15,22}$/.test(v || '') ? v : '';
      if (v === id) return;
      stop(); id = v; lvl = 0; sent = 'none';
      if (id) connect(0);
    },
    set(a) { want = a; flush(); },
    stop,
  };
})();
const clip = (s, n) => { s = String(s || '').trim().slice(0, n); return s.length < 2 ? (s + '⠀⠀').slice(0, 2) : s; };
let lastStart = 0, clearT = null;
function updateDiscord() {
  if (cfg.discord && pstate.has && !pstate.playing) { // пауза между треками длится миг — статус убираем, только если пауза настоящая
    if (!clearT) clearT = setTimeout(() => { clearT = null; lastStart = 0; discord.set(null); }, 2000);
    return;
  }
  clearTimeout(clearT); clearT = null;
  if (!cfg.discord || !pstate.has || !pstate.dur) { lastStart = 0; discord.set(null); return; }
  const rate = pstate.rate || 1;
  let start = Math.round(pstate.at - (pstate.cur / rate) * 1000);
  if (Math.abs(start - lastStart) < 3000) start = lastStart; // мелкий дрейф времени не повод слать обновление
  lastStart = start;
  const a = {
    type: 2, details: clip(pstate.title, 128), state: clip(pstate.artist || 'SQUAD SOUND', 128),
    timestamps: { start, end: Math.round(start + (pstate.dur / rate) * 1000) },
    assets: { large_image: /^https:\/\//.test(pstate.thumb) && pstate.thumb.length < 256 ? pstate.thumb : 'squad', large_text: 'SQUAD SOUND' },
  };
  discord.set(a);
}

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);
ipcMain.on('player-state', (e, st) => {
  if (!mainWin || e.sender !== mainWin.webContents || !st || typeof st !== 'object') return;
  const prev = pstate;
  pstate = {
    has: !!st.has, title: str(st.title, 300), artist: str(st.artist, 300), playing: !!st.playing,
    cur: num(st.cur), dur: num(st.dur), rate: num(st.rate) || 1, thumb: st.thumb === undefined ? prev.thumb : str(st.thumb, 400000), at: Date.now(),
    theme: st.theme && typeof st.theme === 'object' ? { accent: str(st.theme.accent, 40), bg: str(st.theme.bg, 40), text: str(st.theme.text, 40) } : prev.theme,
  };
  if (prev.playing !== pstate.playing || prev.has !== pstate.has) updateThumbar();
  if (prev.playing !== pstate.playing || prev.has !== pstate.has || prev.title !== pstate.title || prev.artist !== pstate.artist) updateTray();
  sendMini();
  updateDiscord();
});
ipcMain.handle('native-cfg', (e, c) => {
  if (!mainWin || e.sender !== mainWin.webContents || !c || typeof c !== 'object') return {};
  cfg = { tray: !!c.tray, hotkeys: c.hotkeys !== false, discord: str(c.discord, 30).trim() };
  const busy = applyHotkeys();
  discord.setId(cfg.discord);
  updateDiscord();
  return { busy };
});
ipcMain.on('open-mini', (e) => { if (mainWin && e.sender === mainWin.webContents) openMini(); });

// ---------- Автообновление (GitHub Releases) ----------
// portable-версия не умеет обновляться сама: для неё страница предлагает скачать новый файл.
const AUTO_UPDATE = app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;
let autoUpdater = null;
let manualCheck = false;

ipcMain.on('auto-update-enabled', (e) => { e.returnValue = AUTO_UPDATE; });

function sendUpdate(ev) {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update-status', ev);
}

function setupAutoUpdate() {
  if (!AUTO_UPDATE) return;
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (i) => sendUpdate({ type: 'available', version: i.version }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ type: 'progress', percent: p.percent }));
  autoUpdater.on('update-downloaded', (i) => sendUpdate({ type: 'downloaded', version: i.version }));
  autoUpdater.on('update-not-available', () => { sendUpdate({ type: 'none', manual: manualCheck }); manualCheck = false; });
  autoUpdater.on('error', (err) => { console.error(err); sendUpdate({ type: 'error', manual: manualCheck }); manualCheck = false; });
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

ipcMain.handle('update-check', () => {
  if (!autoUpdater) return;
  manualCheck = true;
  return autoUpdater.checkForUpdates().then(() => {}).catch(() => {});
});
ipcMain.handle('update-install', () => { if (autoUpdater) { quitting = true; autoUpdater.quitAndInstall(true, true); } }); // тихо и сразу запустить

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMain);
  app.whenReady().then(() => {
    protocol.handle('app', (req) => {
      const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
      const file = path.normalize(path.join(WWW, rel || 'index.html'));
      if (!file.startsWith(WWW + path.sep)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    createWindow();
    createTray();
    setupAutoUpdate();
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); discord.stop(); });
  app.on('window-all-closed', () => app.quit());
}
