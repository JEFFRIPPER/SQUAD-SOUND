const { contextBridge, ipcRenderer } = require('electron');

// Мини-плеер видит только состояние плеера и шлёт команды; к файлам и сети доступа нет
contextBridge.exposeInMainWorld('squadMini', {
  onState: (cb) => ipcRenderer.on('mini-state', (_e, st) => cb(st)),
  cmd: (c, v) => ipcRenderer.send('mini-cmd', c, v),
});
