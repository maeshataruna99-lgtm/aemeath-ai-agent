'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aemeathSettings', {
  get: () => ipcRenderer.invoke('settings-window:get'),
  set: (patch) => ipcRenderer.send('settings-window:set', patch),
});
