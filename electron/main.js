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

ipcMain.handle('filter-existing', async (_e, paths) =>
  (Array.isArray(paths) ? paths : []).filter((p) => typeof p === 'string' && fs.existsSync(p)));

ipcMain.handle('version', () => app.getVersion());

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
  });
  app.on('window-all-closed', () => app.quit());
}
