const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('squadNative', {
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  readRange: (p, start, length) => ipcRenderer.invoke('read-range', p, start, length),
  scanMusic: () => ipcRenderer.invoke('scan-music'),
  filterExisting: (paths) => ipcRenderer.invoke('filter-existing', paths),
  version: () => ipcRenderer.invoke('version'),
  // Автообновление работает только в установленной версии (не portable)
  autoUpdate: ipcRenderer.sendSync('auto-update-enabled'),
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  onUpdate: (cb) => ipcRenderer.on('update-status', (_e, ev) => cb(ev)),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch (_) { return ''; }
  },
});
