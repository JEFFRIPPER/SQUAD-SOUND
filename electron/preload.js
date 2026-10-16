const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('squadNative', {
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  filterExisting: (paths) => ipcRenderer.invoke('filter-existing', paths),
  version: () => ipcRenderer.invoke('version'),
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch (_) { return ''; }
  },
});
