// SQUAD SOUND — оболочка Electron для Windows (.exe)
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');

const WWW = path.join(__dirname, '..', 'www');

// Свой протокол app:// вместо file:// — иначе Chromium не грузит AudioWorklet (тон).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const AUDIO_RE = /\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|webm|mp4)$/i;

function createWindow() {
  const win = new BrowserWindow({
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
ipcMain.handle('update-install', () => { if (autoUpdater) autoUpdater.quitAndInstall(true, true); }); // тихо и сразу запустить

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  app.whenReady().then(() => {
    protocol.handle('app', (req) => {
      const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
      const file = path.normalize(path.join(WWW, rel || 'index.html'));
      if (!file.startsWith(WWW + path.sep)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    createWindow();
    setupAutoUpdate();
  });
  app.on('window-all-closed', () => app.quit());
}
