'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aemeathSettings', {
  get: () => ipcRenderer.invoke('settings-window:get'),
  set: (patch) => ipcRenderer.send('settings-window:set', patch),
  chatStatus: () => ipcRenderer.invoke('chat:status'),
  setChatConfig: (config) => ipcRenderer.invoke('chat:set-config', config),
  // The key goes one way: renderer to main. There is no call that returns it.
  setApiKey: (provider, key) => ipcRenderer.invoke('chat:set-key', { provider, key }),
  clearApiKey: (provider) => ipcRenderer.invoke('chat:clear-key', provider),
});
