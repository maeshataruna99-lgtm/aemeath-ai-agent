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
  chatStatus: () => ipcRenderer.invoke('chat:status'),
  chatSend: (text) => ipcRenderer.invoke('chat:send', text),
  chatReset: () => ipcRenderer.invoke('chat:reset'),
  openSettings: () => ipcRenderer.send('chat:open-settings'),
  listCommands: () => ipcRenderer.invoke('command:list'),
  runCommand: (text) => ipcRenderer.invoke('command:run', text),
  terminalRun: (text) => ipcRenderer.invoke('terminal:run', text),
  terminalStop: () => ipcRenderer.invoke('terminal:stop'),
  focusWindow: () => ipcRenderer.send('chat:focus'),
  blurWindow: () => ipcRenderer.send('chat:blur'),
  onChatToggle: (fn) => ipcRenderer.on('chat:toggle', () => fn()),
  onActivityRemark: (fn) => ipcRenderer.on('activity:remark', (_e, remark) => fn(remark)),
  onChatState: (fn) => ipcRenderer.on('chat:state', (_e, state) => fn(state)),
  onChatChunk: (fn) => ipcRenderer.on('chat:chunk', (_e, chunk) => fn(chunk)),
  openSession: (sessionId) => ipcRenderer.invoke('session:open', sessionId),
  onTimerDone: (fn) => ipcRenderer.on('productivity:timer-done', (_e, payload) => fn(payload)),
  onLorebookUpdated: (fn) => ipcRenderer.on('lorebook:updated', (_e, data) => fn(data)),
});
