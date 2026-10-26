'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aemeath', {
  init: () => ipcRenderer.invoke('init'),
  setHover: (hovering) => ipcRenderer.send('pet:hover', hovering),
  saveSettings: (patch) => ipcRenderer.send('settings:save', patch),
  quit: () => ipcRenderer.send('app:quit'),
  openContextMenu: () => ipcRenderer.send('pet:contextmenu'),
  onSessionEvent: (fn) => ipcRenderer.on('session:event', (_e, event) => fn(event)),
  onMediaStatus: (fn) => ipcRenderer.on('media:status', (_e, status) => fn(status)),
  onAggregate: (fn) => ipcRenderer.on('session:aggregate', (_e, agg) => fn(agg)),
  onSettingsUpdated: (fn) => ipcRenderer.on('settings:updated', (_e, s) => fn(s)),
  onDemo: (fn) => ipcRenderer.on('demo:set-state', (_e, state) => fn(state)),
  onReset: (fn) => ipcRenderer.on('pet:reset', () => fn()),
});
