'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { defaultCatalogs, SUPPORTED_LOCALES, DEFAULT_LOCALE } = require('./src/i18n');

contextBridge.exposeInMainWorld('aemeath', {
  init: () => ipcRenderer.invoke('init'),
  getCatalogs: () => defaultCatalogs,
  supportedLocales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
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
  chatSend: (input, requestId) => ipcRenderer.invoke('chat:send', input, requestId),
  chatReset: () => ipcRenderer.invoke('chat:reset'),
  openSettings: () => ipcRenderer.send('chat:open-settings'),
  openExternal: (url) => ipcRenderer.invoke('chat:open-external', url),
  listCommands: () => ipcRenderer.invoke('command:list'),
  runCommand: (text) => ipcRenderer.invoke('command:run', text),
  terminalRun: (text) => ipcRenderer.invoke('terminal:run', text),
  terminalStop: () => ipcRenderer.invoke('terminal:stop'),
  focusWindow: () => ipcRenderer.send('chat:focus'),
  blurWindow: () => ipcRenderer.send('chat:blur'),
  onChatToggle: (fn) => ipcRenderer.on('chat:toggle', () => fn()),
  onActivityRemark: (fn) => ipcRenderer.on('activity:remark', (_e, remark) => fn(remark)),
  onPresence: (fn) => ipcRenderer.on('presence:state', (_e, state) => fn(state)),
  onChatState: (fn) => ipcRenderer.on('chat:state', (_e, state) => fn(state)),
  onChatChunk: (fn) => {
    const listener = (_e, chunk) => fn(chunk);
    ipcRenderer.on('chat:chunk', listener);
    return () => ipcRenderer.removeListener('chat:chunk', listener);
  },
  openSession: (sessionId) => ipcRenderer.invoke('session:open', sessionId),
  onTimerDone: (fn) => ipcRenderer.on('productivity:timer-done', (_e, payload) => fn(payload)),
  onQuestDone: (fn) => ipcRenderer.on('productivity:quest-done', (_e, payload) => fn(payload)),
  onWorkSessionFinished: (fn) => ipcRenderer.on('work-session:finished', (_e, finished) => fn(finished)),
  // Companion memory: she can offer to remember something, and Rover answers on
  // the bubble. The overlay never reads the memory list.
  onMemoryOffer: (fn) => ipcRenderer.on('memory:offer', (_e, offer) => fn(offer)),
  acceptMemory: (offerId) => ipcRenderer.invoke('memory:accept', offerId),
  dismissMemory: (offerId) => ipcRenderer.invoke('memory:dismiss', offerId),
  answerContinuation: (offerId, choice) => ipcRenderer.invoke('memory:continuation-answer', offerId, choice),
  onLorebookUpdated: (fn) => ipcRenderer.on('lorebook:updated', (_e, data) => fn(data)),
  getTheme: () => ipcRenderer.invoke('theme:get'),
  onThemeChanged: (fn) => ipcRenderer.on('theme:changed', (_e, themeData) => fn(themeData)),
});
