'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aemeathGuide', {
  getEntries: () => ipcRenderer.invoke('guide:get-entries'),
  search: (query) => ipcRenderer.invoke('guide:search', query),
  getAtlas: () => ipcRenderer.invoke('guide:get-atlas'),
  getSettings: () => ipcRenderer.invoke('guide:get-settings'),
  saveSettings: (patch) => ipcRenderer.send('settings:save', patch),
  onSettingsUpdated: (fn) => ipcRenderer.on('settings:updated', (_e, s) => fn(s)),
  closeWindow: () => ipcRenderer.send('guide:close'),
  getTheme: () => ipcRenderer.invoke('theme:get'),
  setTheme: (patch) => ipcRenderer.invoke('theme:set', patch),
  setThemePreset: (name) => ipcRenderer.invoke('theme:set-preset', name),
  onThemeChanged: (fn) => ipcRenderer.on('theme:changed', (_e, payload) => fn(payload)),
});
