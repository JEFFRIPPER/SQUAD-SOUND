const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('squadNative', {
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  readRange: (p, start, length) => ipcRenderer.invoke('read-range', p, start, length),
  scanMusic: () => ipcRenderer.invoke('scan-music'),
  deleteFile: (p) => ipcRenderer.invoke('delete-file', p),
  renameFile: (p, base) => ipcRenderer.invoke('rename-file', p, base),
  win: (act) => ipcRenderer.send('win', act),
  onWinState: (cb) => ipcRenderer.on('win-state', (_e, st) => cb(st)),
  httpGet: (url, binary) => ipcRenderer.invoke('http-get', url, binary),
  filterExisting: (paths) => ipcRenderer.invoke('filter-existing', paths),
  version: () => ipcRenderer.invoke('version'),
  // Автообновление работает только в установленной версии (не portable)
  autoUpdate: ipcRenderer.sendSync('auto-update-enabled'),
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  onUpdate: (cb) => ipcRenderer.on('update-status', (_e, ev) => cb(ev)),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  expandPaths: (paths) => ipcRenderer.invoke('expand-paths', paths),
  // плеер снаружи окна: трей, превью на панели задач, горячие клавиши, мини-плеер, Discord
  playerState: (st) => ipcRenderer.send('player-state', st),
  onPlayerCmd: (cb) => ipcRenderer.on('player-cmd', (_e, c, v) => cb(c, v)),
  setNativeCfg: (c) => ipcRenderer.invoke('native-cfg', c),
  openMini: () => ipcRenderer.send('open-mini'),
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch (_) { return ''; }
  },
});
