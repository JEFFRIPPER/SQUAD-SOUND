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

const AUDIO_RE = /\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|wma|webm|mp4)$/i;

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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.removeMenu();
  win.loadURL('app://squad/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function walk(dir, out, depth = 0) {
  if (depth > 8) return out;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else if (AUDIO_RE.test(e.name)) out.push(p);
  }
  return out;
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

async function scanMusic() {
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
        try { if ((await fs.promises.stat(p)).size >= MIN_SIZE) found.add(p); } catch (_) {}
        if (found.size >= MAX_FILES) return;
      }
    }
  };
  for (const r of await scanRoots()) await walkAsync(r, 0);
  return Array.from(found).sort((a, b) => a.localeCompare(b, 'ru'));
}

let scanning = null;
ipcMain.handle('scan-music', () => {
  if (!scanning) scanning = scanMusic().finally(() => { scanning = null; });
  return scanning;
});

ipcMain.handle('pick-files', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Добавить треки',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Аудио', extensions: ['mp3', 'flac', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'opus', 'wma', 'webm'] }],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('pick-folder', async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Добавить папку с музыкой',
    properties: ['openDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return [];
  return walk(r.filePaths[0], []).sort((a, b) => a.localeCompare(b, 'ru'));
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

ipcMain.handle('filter-existing', async (_e, paths) =>
  (Array.isArray(paths) ? paths : []).filter((p) => typeof p === 'string' && fs.existsSync(p)));

ipcMain.handle('version', () => app.getVersion());

ipcMain.handle('open-external', (_e, url) => {
  if (/^https:\/\/github\.com\/JEFFRIPPER\/SQUAD-SOUND\//.test(url)) shell.openExternal(url);
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
ipcMain.handle('update-install', () => { if (autoUpdater) autoUpdater.quitAndInstall(); });

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
      if (!file.startsWith(WWW)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    createWindow();
    setupAutoUpdate();
  });
  app.on('window-all-closed', () => app.quit());
}
