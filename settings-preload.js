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
  getActivity: () => ipcRenderer.invoke('activity:current'),
  getStartup: () => ipcRenderer.invoke('startup:status'),
  getPlatform: () => ipcRenderer.invoke('platform:info'),
  getLorebookStatus: () => ipcRenderer.invoke('lorebook:status'),
  updateLorebook: (query) => ipcRenderer.invoke('lorebook:update', query),
  getCommands: () => ipcRenderer.invoke('commands:get'),
  saveCommands: (list) => ipcRenderer.invoke('commands:save', list),
  pickPath: (kind) => ipcRenderer.invoke('commands:pick', kind),
  memoryStatus: () => ipcRenderer.invoke('memory:status'),
  listMemory: () => ipcRenderer.invoke('memory:list'),
  saveMemory: (payload) => ipcRenderer.invoke('memory:save', payload),
  updateMemory: (payload) => ipcRenderer.invoke('memory:update', payload),
  deleteMemory: (id) => ipcRenderer.invoke('memory:delete', id),
  clearMemory: () => ipcRenderer.invoke('memory:clear'),
  setMemoryPolicy: (patch) => ipcRenderer.send('memory:set', patch),
  onMemoryUpdated: (fn) => ipcRenderer.on('memory:updated', (_e, status) => fn(status)),
  getTheme: () => ipcRenderer.invoke('theme:get'),
  previewTheme: (patch) => ipcRenderer.invoke('theme:preview', patch),
  setTheme: (patch) => ipcRenderer.invoke('theme:set', patch),
  setThemePreset: (name) => ipcRenderer.invoke('theme:set-preset', name),
  onThemeChanged: (fn) => ipcRenderer.on('theme:changed', (_e, payload) => fn(payload)),
});
