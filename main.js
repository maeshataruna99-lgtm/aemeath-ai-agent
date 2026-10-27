'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  dialog,
  globalShortcut,
  powerMonitor,
  safeStorage,
  screen,
  shell,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const { createClaudeCodeProvider } = require('./src/claude-code-provider');
const { createMediaWatcher } = require('./src/media-watcher');
const { loadLorebook } = require('./src/lorebook-loader');
const { createLorebookUpdater, OVERLAY_FILE } = require('./src/lorebook-updater');
const { createKeyStore } = require('./src/chat/key-store');
const { createProviders } = require('./src/chat/providers');
const { createChatService } = require('./src/chat/chat-service');
const { createCompanionMode } = require('./src/chat/companion-mode');
const { createWebSearch } = require('./src/chat/web-search');
const { createLocalResponder } = require('./src/chat/local-responder');
const { createCommandStore } = require('./src/commands/command-store');
const { createCommandRunner } = require('./src/commands/command-runner');
const { createCommandHandler } = require('./src/commands/command-handler');
const { createUacGate } = require('./src/terminal/uac-gate');
const { createTerminalSession } = require('./src/terminal/terminal-session');
const { createTerminalController } = require('./src/terminal/terminal-controller');
const { createActivityMonitor } = require('./src/activity/activity-monitor');
const { createActivityTracker } = require('./src/activity/activity-tracker');
const { createActivityWatcher } = require('./src/activity/activity-watcher');
const { createWorkReviewer } = require('./src/activity/work-reviewer');
const { createProductivityHub } = require('./src/productivity/productivity-hub');
const { detectPlatform, applyLinuxStartup, getLinuxStartupStatus } = require('./src/platform');
const {
  createSettingsStore,
  migrateLegacySettings,
  MIN_SCALE,
  MAX_SCALE,
} = require('./src/settings');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  main();
}

function main() {
  const isSelfie = process.argv.includes('--selfie');
  app.setAppUserModelId('aemeath.ai.agent');

  const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

  let win = null;
  let settingsWin = null;
  let keyStore = null;
  let commandStore = null;
  let productivity = null;
  let lorebookUpdater = null;
  let activityTrayTimer = null;
  let tray = null;
  let provider = null;
  let media = null;
  let aggregateTimer = null;

  migrateLegacySettings(app.getPath('userData'), path.join(app.getPath('appData'), 'Aemeth'));
  const settingsStore = createSettingsStore(app.getPath('userData'));
  const settings = settingsStore.load();
  const atlasJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'assets', 'pet', 'atlas.json'), 'utf8'),
  );

  // Trivia is optional: a broken lorebook must not stop the pet from starting.
  const lorebookDir = path.join(__dirname, 'lorebook');
  let lorebookOverlayFile = path.join(app.getPath('userData'), OVERLAY_FILE);
  let lorebookData = { sources: {}, entries: [] };
  function reloadLorebook() {
    try {
      lorebookData = loadLorebook(lorebookDir, isSelfie ? null : lorebookOverlayFile);
    } catch (error) {
      console.error('[aemeath] lorebook disabled: ' + error.message);
    }
  }
  reloadLorebook();

  app.on('second-instance', () => {
    if (win) {
      win.show();
      win.focus();
    }
  });

  // The selfie run answers with a canned reply so the chat UI can be checked
  // without a real key or network access.
  const selfieRequests = [];
  const selfieFetch = async (_url, init) => {
    selfieRequests.push(init && init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Halo, Rover! Ini balasan contoh untuk uji tampilan.' } }],
      }),
    };
  };
  const providers = createProviders({ fetchImpl: isSelfie ? selfieFetch : undefined });

  const selfieSearch = {
    search: async () => ({
      results: [
        {
          title: 'Exostrider',
          text: 'Contoh hasil pencarian untuk uji tampilan.',
          source: {
            title: 'Wuthering Waves Wiki: Exostrider',
            url: 'https://wutheringwaves.fandom.com/wiki/Exostrider',
            license: 'CC BY-SA',
          },
        },
      ],
    }),
  };

  // Lore entries with the credit of the page they came from, for offline answers.
  const loreEntries = () =>
    lorebookData.entries.map((e) => ({
      id: e.id,
      topic: e.topic,
      text: e.text,
      credit: lorebookData.sources[e.source],
    }));

  function chatConfig() {
    const provider = providers.get(settings.chatProvider) || providers.get(providers.defaultId);
    const known = provider.models.some((m) => m.id === settings.chatModel);
    return { provider: provider.id, model: known ? settings.chatModel : provider.defaultModel };
  }

  // Companion mode (/change-mode-search): Aemeath helps with any topic instead of focusing on
  // the game wiki. Only in effect while the current provider has a key.
  const companionMode = createCompanionMode({
    isOn: () => settings.chatCompanionMode === true,
    setOn: (on) => {
      Object.assign(settings, settingsStore.save({ chatCompanionMode: on === true }));
    },
    hasKey: () => Boolean(keyStore && keyStore.has(chatConfig().provider)),
    providerName: () => providers.get(chatConfig().provider).name,
  });

  const chatService = createChatService({
    providers,
    getKey: (id) => (keyStore ? keyStore.get(id) : null),
    getConfig: chatConfig,
    getKnowledge: () => lorebookData.entries.map((e) => ({ topic: e.topic, text: e.text })),
    getFeatures: () => ({
      webSearch: settings.chatWebSearch === true,
      offlineFallback: settings.chatOfflineFallback !== false,
      companion: companionMode.active(),
    }),
    search: isSelfie ? selfieSearch : createWebSearch(),
    localResponder: createLocalResponder({ getEntries: loreEntries }),
  });

  // Never includes a key: only whether one exists.
  function chatStatus() {
    const config = chatConfig();
    return {
      provider: config.provider,
      model: config.model,
      secure: keyStore.secure,
      webSearch: settings.chatWebSearch === true,
      offlineFallback: settings.chatOfflineFallback !== false,
      streaming: settings.chatStreaming !== false,
      companion: companionMode.active(),
      providers: providers.list.map((p) => ({
        id: p.id,
        name: p.name,
        keyUrl: p.keyUrl,
        models: p.models,
        hasKey: keyStore.has(p.id),
      })),
    };
  }

  // Custom slash commands. The runner is the only code that launches anything,
  // and it only ever receives commands the settings window saved. The selfie
  // run records launches instead of making them.
  const selfieLaunches = [];
  const platformInfo = detectPlatform();
  const realCommandRunner = createCommandRunner({
    shell,
    spawn,
    exists: fs.existsSync,
    env: process.env,
    platform: platformInfo.id,
  });
  const commandRunner = isSelfie
    ? {
        run: async (command) => {
          // Only harmless echo scripts are really run by the verification run; every other
          // command, shutdown included, is only recorded.
          if (command.type === 'powershell' && /^(?:Write-Output|echo)\b/.test(command.script)) {
            return realCommandRunner.run(command);
          }
          if (command.type === 'workflow') {
            selfieLaunches.push('workflow:' + command.name);
            return { ok: true, output: '' };
          }
          selfieLaunches.push(command.type === 'powershell' ? 'powershell:' + command.name : command.target);
          return { ok: true, output: '' };
        },
      }
    : realCommandRunner;
  // Terminal mode: /change-mode asks the OS for admin consent (UAC on Windows, Polkit on Linux)
  // and then opens a user shell (PowerShell or Bash). The selfie run skips the real prompt.
  const terminal = createTerminalController({
    gate: isSelfie
      ? { request: async () => ({ granted: true }) }
      : createUacGate({ spawn, platform: platformInfo.id, polkit: platformInfo.isLinux }),
    createSession: () => createTerminalSession({ spawn, cwd: os.homedir(), platform: platformInfo.id }),
    isEnabled: () => settings.terminalEnabled !== false,
  });
  // Interactive mode "medium": while it is on, Aemeath reads which app is in front, sorts it
  // into a category and comments on a few things (a game starting, long social media
  // sessions). Off by default. Nothing is stored or sent anywhere. The selfie run feeds
  // samples by hand and moves its own clock, so no real window is ever read.
  let selfieNow = 1000000;
  let selfieSample = null;
  const selfieRemarks = [];
  const activity = createActivityMonitor({
    createWatcher: (onSample) => {
      if (!isSelfie) return createActivityWatcher({ onSample });
      selfieSample = onSample;
      return {
        start() {},
        stop() {
          selfieSample = null;
        },
      };
    },
    tracker: createActivityTracker({
      getLimitMin: () => settings.doomscrollLimitMin,
      getMode: () => settings.interactiveMode,
    }),
    getIdleSeconds: () => (isSelfie ? 0 : powerMonitor.getSystemIdleTime()),
    onRemark: (remark) => {
      if (isSelfie) selfieRemarks.push(remark.kind);
      win?.webContents?.send('activity:remark', remark);
    },
    now: isSelfie ? () => selfieNow : Date.now,
  });

  const workReviewer = createWorkReviewer({
    spawn: spawn,
    getCwd: () => process.cwd(),
  });

  const builtins = {
    'change-mode': {
      description: 'Ganti mode obrolan dan terminal ' + platformInfo.shellName,
      run: () => terminal.changeMode(),
    },
    'change-mode-search': {
      description: 'Mode pendamping: bantu topik apa saja, bukan cuma wiki (butuh API key)',
      run: (arg) => companionMode.run(arg),
    },
    review: {
      description: 'Tinjau dan nilai perubahan kodinganmu saat ini (git diff)',
      run: () => workReviewer.review(),
    },
  };
  const commandHandler = createCommandHandler({
    getCommands: () => (commandStore ? commandStore.list() : []),
    run: commandRunner.run,
    builtins: builtins,
  });

  const fromWindow = (event, target) => Boolean(target) && event.sender === target.webContents;

  app.whenReady().then(() => {
    // The selfie run uses a throwaway folder so it never touches real commands.
    const dataDir = isSelfie
      ? fs.mkdtempSync(path.join(app.getPath('temp'), 'aemeath-selfie-'))
      : app.getPath('userData');
    commandStore = createCommandStore({ dir: dataDir });
    lorebookOverlayFile = path.join(dataDir, OVERLAY_FILE);
    lorebookUpdater = createLorebookUpdater({ dir: dataDir });
    reloadLorebook();
    productivity = createProductivityHub({
      dir: dataDir,
      getActivitySummary: () => activity.summary(),
      onTimerDone: (payload) => {
        win?.webContents?.send('productivity:timer-done', payload);
      },
    });
    Object.assign(builtins, productivity.asBuiltins());

    // The selfie run keeps keys in memory so it can never touch a real saved key.
    keyStore = createKeyStore({
      dir: app.getPath('userData'),
      crypto: isSelfie
        ? { isAvailable: () => false }
        : {
            isAvailable: () => safeStorage.isEncryptionAvailable(),
            encrypt: (text) => safeStorage.encryptString(text),
            decrypt: (buffer) => safeStorage.decryptString(buffer),
          },
    });
    const workArea = screen.getPrimaryDisplay().workArea;
    win = new BrowserWindow({
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true, { forward: true });
    win.on('closed', () => {
      win = null;
    });
    win.loadFile(path.join(__dirname, 'renderer', 'index.html')).then(() => {
      win.show();
      console.log('[aemeath] pet window ready ' + workArea.width + 'x' + workArea.height);
      startWatchers();
      if (isSelfie) runSelfie();
    });

    ipcMain.handle('init', () => ({
      settings: settings,
      atlas: atlasJson,
      lorebook: lorebookData,
      spriteUrl: '../assets/pet/spritesheet.webp',
      workArea: { width: workArea.width, height: workArea.height },
    }));

    ipcMain.on('pet:hover', (_event, hovering) => {
      if (win) win.setIgnoreMouseEvents(!hovering, { forward: true });
    });

    ipcMain.on('settings:save', (_event, patch) => {
      Object.assign(settings, settingsStore.save(patch));
      applyFeatureFlags();
      win?.webContents?.send('settings:updated', settings);
      updateTray();
    });

    // The settings window may only change the keys listed here.
    ipcMain.handle('settings-window:get', () => Object.assign({}, settings, { platform: platformInfo }));
    ipcMain.handle('platform:info', (event) =>
      fromWindow(event, settingsWin) || fromWindow(event, win) ? platformInfo : null,
    );
    ipcMain.on('settings-window:set', (_event, patch) => {
      const next = {};
      if (patch && typeof patch.chatterEnabled === 'boolean') next.chatterEnabled = patch.chatterEnabled;
      for (const flag of [
        'chatWebSearch',
        'chatOfflineFallback',
        'chatStreaming',
        'terminalEnabled',
        'startAtLogin',
        'stayStill',
        'transparentMode',
        'fullConsent',
      ]) {
        if (patch && typeof patch[flag] === 'boolean') next[flag] = patch[flag];
      }
      if (patch && typeof patch.opacity === 'number') {
        next.opacity = patch.opacity;
      }
      if (patch && typeof patch.chatterIntervalMin === 'number') {
        next.chatterIntervalMin = patch.chatterIntervalMin;
      }
      if (
        patch &&
        (patch.interactiveMode === 'low' ||
          patch.interactiveMode === 'medium' ||
          patch.interactiveMode === 'full')
      ) {
        next.interactiveMode = patch.interactiveMode;
      }
      if (patch && typeof patch.doomscrollLimitMin === 'number') next.doomscrollLimitMin = patch.doomscrollLimitMin;
      if (patch && typeof patch.chatShortcut === 'string') next.chatShortcut = patch.chatShortcut;
      Object.assign(settings, settingsStore.save(next));
      if (settings.transparentMode) win?.setIgnoreMouseEvents(true, { forward: true });
      win?.webContents?.send('settings:updated', settings);
      applyActivityMode();
      applyStartup();
      applyShortcut();
      updateTray();
    });

    // Whether Windows will really start her at login, for the settings window to show.
    ipcMain.handle('startup:status', (event) => (fromWindow(event, settingsWin) ? startupStatus() : null));

    ipcMain.handle('lorebook:status', (event) => {
      if (!fromWindow(event, settingsWin)) return null;
      const overlay = lorebookUpdater ? lorebookUpdater.readOverlay() : { updatedAt: null };
      return {
        entryCount: lorebookData.entries.length,
        sourceCount: Object.keys(lorebookData.sources || {}).length,
        updatedAt: overlay.updatedAt || null,
      };
    });

    ipcMain.handle('lorebook:update', async (event, rawQuery) => {
      if (!fromWindow(event, settingsWin) || !lorebookUpdater) {
        return { ok: false, error: 'Pembaru lorebook tidak tersedia.' };
      }
      const res = await lorebookUpdater.update(rawQuery);
      if (res.ok) {
        reloadLorebook();
        win?.webContents?.send('lorebook:updated', lorebookData);
      }
      return Object.assign({}, res, {
        entryCount: lorebookData.entries.length,
        sourceCount: Object.keys(lorebookData.sources || {}).length,
      });
    });

    // What Aemeath currently sees, as a category and never a window title.
    ipcMain.handle('activity:current', (event) =>
      fromWindow(event, settingsWin)
        ? { mode: settings.interactiveMode, label: activity.describe(), summary: activity.summary() }
        : null,
    );

    ipcMain.handle('session:open', async (event, sessionId) => {
      if (!fromWindow(event, win) || isSelfie || !provider) return { ok: false };
      const info = provider.findSession(sessionId);
      if (info && info.cwd && path.isAbsolute(info.cwd) && fs.existsSync(info.cwd)) {
        const err = await shell.openPath(info.cwd);
        return { ok: !err };
      }
      return { ok: false };
    });

    ipcMain.on('chat:open-settings', (event) => {
      if (fromWindow(event, win)) openSettingsWindow();
    });
    // The overlay is click-through and unfocused by default; typing needs focus.
    ipcMain.on('chat:focus', (event) => {
      if (fromWindow(event, win)) win.focus();
    });
    ipcMain.on('chat:blur', (event) => {
      if (fromWindow(event, win)) win.blur();
    });
    ipcMain.handle('chat:status', (event) =>
      fromWindow(event, win) || fromWindow(event, settingsWin) ? chatStatus() : null,
    );
    ipcMain.handle('chat:send', async (event, text) => {
      if (!fromWindow(event, win)) return { ok: false, error: 'Tidak diizinkan.' };
      win?.webContents?.send('chat:state', { thinking: true });
      const streaming = settings.chatStreaming !== false;
      try {
        const reply = await chatService.send(text, streaming ? (chunk) => {
          win?.webContents?.send('chat:chunk', { delta: chunk });
        } : undefined);
        win?.webContents?.send('chat:state', { thinking: false, replied: true });
        return { ok: true, text: reply.text, mode: reply.mode, sources: reply.sources };
      } catch (error) {
        win?.webContents?.send('chat:state', { thinking: false, replied: false });
        return { ok: false, code: error.code || 'unknown', error: error.message };
      }
    });
    ipcMain.handle('chat:reset', (event) => {
      if (fromWindow(event, win)) chatService.reset();
      return true;
    });
    // Key management is only accepted from the settings window.
    ipcMain.handle('chat:set-key', (event, payload) => {
      if (!fromWindow(event, settingsWin)) return { ok: false, error: 'Tidak diizinkan.' };
      const provider = payload && providers.get(payload.provider);
      if (!provider) return { ok: false, error: 'Penyedia tidak dikenal.' };
      return keyStore.set(provider.id, payload.key);
    });
    ipcMain.handle('chat:clear-key', (event, providerId) => {
      if (!fromWindow(event, settingsWin)) return false;
      const provider = providers.get(providerId);
      if (provider) keyStore.clear(provider.id);
      return true;
    });
    ipcMain.handle('chat:set-config', (event, payload) => {
      if (!fromWindow(event, settingsWin)) return null;
      const provider = payload && providers.get(payload.provider);
      if (provider) {
        const model = provider.models.some((m) => m.id === payload.model)
          ? payload.model
          : provider.defaultModel;
        Object.assign(settings, settingsStore.save({ chatProvider: provider.id, chatModel: model }));
      }
      return chatStatus();
    });

    // Slash commands: the overlay can list names and run by typed text, never
    // see targets; only the settings window can read or change the definitions.
    ipcMain.handle('command:list', (event) =>
      fromWindow(event, win)
        ? Object.entries(builtins)
            .map(([name, b]) => ({ name: name, description: b.description, builtin: true }))
            .concat(commandStore.list().map((c) => ({ name: c.name, description: c.description })))
        : [],
    );

    // Terminal lines: only the overlay may send them, only while the mode is on, and
    // the mode can only be switched on through /change-mode and its consent prompt.
    ipcMain.handle('terminal:run', async (event, text) => {
      if (!fromWindow(event, win)) return { ok: false, mode: 'chat', error: 'Tidak diizinkan.' };
      win?.webContents?.send('chat:state', { thinking: true });
      try {
        return await terminal.run(String(text == null ? '' : text));
      } finally {
        win?.webContents?.send('chat:state', { thinking: false });
      }
    });
    ipcMain.handle('terminal:stop', (event) => {
      if (fromWindow(event, win)) terminal.stop();
      return true;
    });
    ipcMain.handle('command:run', (event, text) =>
      fromWindow(event, win) ? commandHandler.handle(String(text == null ? '' : text)) : { isCommand: false },
    );
    ipcMain.handle('commands:get', (event) => (fromWindow(event, settingsWin) ? commandStore.list() : []));
    ipcMain.handle('commands:save', (event, list) =>
      fromWindow(event, settingsWin)
        ? commandStore.save(list)
        : { saved: [], errors: [{ index: -1, message: 'Tidak diizinkan.' }] },
    );
    ipcMain.handle('commands:pick', async (event, kind) => {
      if (!fromWindow(event, settingsWin)) return null;
      const picked = await dialog.showOpenDialog(settingsWin, {
        properties: [kind === 'folder' ? 'openDirectory' : 'openFile'],
      });
      return picked.canceled ? null : picked.filePaths[0];
    });

    ipcMain.on('app:quit', () => app.quit());
    ipcMain.on('pet:contextmenu', () => {
      if (tray) tray.popUpContextMenu(Menu.buildFromTemplate(menuTemplate()));
    });
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    if (!isSelfie) {
      try {
        globalShortcut.unregisterAll();
      } catch {
        // ignore
      }
    }
    if (productivity) productivity.stop();
    terminal.stop();
    activity.stop();
    if (activityTrayTimer) clearInterval(activityTrayTimer);
    if (provider) provider.stop();
    if (media) media.stop();
    if (aggregateTimer) clearInterval(aggregateTimer);
  });

  // Chat lives in a box next to the pet; the tray only asks the overlay to toggle it.
  function toggleChat() {
    if (!win) return;
    win.show();
    win.webContents.send('chat:toggle');
  }

  function openSettingsWindow() {
    if (settingsWin) {
      settingsWin.show();
      settingsWin.focus();
      return;
    }
    settingsWin = new BrowserWindow({
      width: 420,
      height: 640,
      resizable: true,
      minimizable: false,
      maximizable: false,
      autoHideMenuBar: true,
      title: 'Pengaturan Aemeath',
      icon: ICON_PATH,
      webPreferences: {
        preload: path.join(__dirname, 'settings-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    // The pet overlay sits at the screen-saver level; stay above it.
    settingsWin.setAlwaysOnTop(true, 'screen-saver');
    settingsWin.on('closed', () => {
      settingsWin = null;
    });
    settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  }

  // Starting with Windows. In development the entry must name the app folder too, or
  // Windows would launch a bare Electron with nothing to show. It is re-applied on every
  // launch, so a moved folder repairs itself. The verification run never touches the list.
  function loginItemOptions() {
    return app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] };
  }

  function applyStartup() {
    if (isSelfie) return;
    try {
      if (platformInfo.isLinux) {
        applyLinuxStartup({
          enabled: settings.startAtLogin !== false,
          execPath: process.execPath,
          appPath: app.getAppPath(),
          isPackaged: app.isPackaged,
        });
      } else {
        app.setLoginItemSettings({ openAtLogin: settings.startAtLogin !== false, ...loginItemOptions() });
      }
    } catch (error) {
      console.error('[aemeath] startup entry failed: ' + error.message);
    }
  }

  function startupStatus() {
    const wanted = settings.startAtLogin !== false;
    try {
      if (platformInfo.isLinux) {
        return getLinuxStartupStatus({ wanted: wanted });
      }
      const item = app.getLoginItemSettings(loginItemOptions());
      return { wanted: wanted, registered: Boolean(item.openAtLogin), willLaunch: item.executableWillLaunchAtLogin !== false };
    } catch {
      return { wanted: wanted, registered: false, willLaunch: false };
    }
  }

  function applyShortcut() {
    if (isSelfie) return;
    try {
      globalShortcut.unregisterAll();
      if (settings.chatShortcut) {
        globalShortcut.register(settings.chatShortcut, () => toggleChat());
      }
    } catch (error) {
      console.error('[aemeath] shortcut registration failed: ' + error.message);
    }
  }

  function applyActivityMode() {
    const on = settings.interactiveMode === 'medium' || settings.interactiveMode === 'full';
    if (on) activity.start();
    else activity.stop();
    // keep the tray's "what she sees" line fresh while she is watching
    if (on && !activityTrayTimer) activityTrayTimer = setInterval(updateTray, 10000);
    if (!on && activityTrayTimer) {
      clearInterval(activityTrayTimer);
      activityTrayTimer = null;
    }
    updateTray();
  }

  function startWatchers() {
    provider = createClaudeCodeProvider({
      onEvent: (event) => {
        if (!settings.watcherEnabled) return;
        win?.webContents?.send('session:event', event);
        pushAggregate();
        updateTray();
      },
    });
    media = createMediaWatcher({
      onStatus: (status) => {
        win?.webContents?.send('media:status', status);
      },
    });
    applyFeatureFlags();
    applyActivityMode();
    applyStartup();
    applyShortcut();

    aggregateTimer = setInterval(pushAggregate, 5000);
    pushAggregate();
  }

  function applyFeatureFlags() {
    if (!provider || !media) return;
    if (settings.watcherEnabled) provider.start();
    else provider.stop();
    if (settings.musicEnabled) media.start();
    else media.stop();
  }

  function pushAggregate() {
    win?.webContents?.send('session:aggregate', {
      running: provider ? provider.activeSessionCount() : 0,
      awaitingDecision: provider ? provider.pendingDecisionCount() : 0,
    });
  }

  function adjustScale(delta) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, settings.scale + delta));
    Object.assign(settings, settingsStore.save({ scale: next }));
    win?.webContents?.send('settings:updated', settings);
    updateTray();
  }

  function setSpeed(speed) {
    Object.assign(settings, settingsStore.save({ speed }));
    win?.webContents?.send('settings:updated', settings);
    updateTray();
  }

  function toggleFeature(key) {
    Object.assign(settings, settingsStore.save({ [key]: !settings[key] }));
    if (key === 'transparentMode' && settings.transparentMode) {
      win?.setIgnoreMouseEvents(true, { forward: true });
    }
    applyFeatureFlags();
    win?.webContents?.send('settings:updated', settings);
    updateTray();
  }

  function menuTemplate() {
    const running = provider ? provider.activeSessionCount() : 0;
    const awaiting = provider ? provider.pendingDecisionCount() : 0;
    return [
      { label: 'Sesi AI berjalan: ' + running, enabled: false },
      { label: 'Menunggu keputusanmu: ' + awaiting, enabled: false },
      ...(activity.running
        ? [
            { label: 'Aktivitas terbaca: ' + (activity.describe() || 'belum ada'), enabled: false },
            ...(activity.summary() ? [{ label: 'Rekap sesi: ' + activity.summary(), enabled: false }] : []),
          ]
        : []),
      { type: 'separator' },
      { label: 'Fleet Snowfluff GPT...', click: () => toggleChat() },
      { type: 'separator' },
      { label: 'Tampilkan Aemeath', click: () => win?.show() },
      { label: 'Sembunyikan Aemeath', click: () => win?.hide() },
      { type: 'separator' },
      { label: 'Skala: perbesar', click: () => adjustScale(0.1) },
      { label: 'Skala: perkecil', click: () => adjustScale(-0.1) },
      {
        label: 'Diam di tempat: ' + (settings.stayStill ? 'aktif' : 'nonaktif'),
        click: () => toggleFeature('stayStill'),
      },
      {
        label: 'Mode transparan (tembus klik): ' + (settings.transparentMode ? 'aktif' : 'nonaktif'),
        click: () => toggleFeature('transparentMode'),
      },
      {
        label: 'Kecepatan jalan',
        submenu: [
          { label: 'Lambat', click: () => setSpeed(60) },
          { label: 'Normal', click: () => setSpeed(120) },
          { label: 'Cepat', click: () => setSpeed(240) },
        ],
      },
      { type: 'separator' },
      {
        label: 'Deteksi musik: ' + (settings.musicEnabled ? 'aktif' : 'nonaktif'),
        click: () => toggleFeature('musicEnabled'),
      },
      {
        label: 'Pemantau sesi AI: ' + (settings.watcherEnabled ? 'aktif' : 'nonaktif'),
        click: () => toggleFeature('watcherEnabled'),
      },
      {
        label: 'Aemeath bicara: ' + (settings.chatterEnabled ? 'aktif' : 'nonaktif'),
        click: () => toggleFeature('chatterEnabled'),
      },
      { label: 'Pengaturan...', click: () => openSettingsWindow() },
      { label: 'Atur ulang posisi', click: () => win?.webContents?.send('pet:reset') },
      { type: 'separator' },
      { label: 'Keluar', click: () => app.quit() },
    ];
  }

  function updateTray() {
    if (tray) tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
  }

  function createTray() {
    const icon = nativeImage
      .createFromPath(ICON_PATH)
      .resize({ width: 32, height: 32, quality: 'best' });
    tray = new Tray(icon);
    tray.setToolTip('Aemeath');
    updateTray();
  }

  async function runSelfie() {
    const states = [
      'idle',
      'running-right',
      'running-left',
      'waving',
      'jumping',
      'waiting',
      'running',
      'review',
      'failed',
      'confused',
      'trivia',
      'music',
      'session-finished',
      'session-failed',
    ];
    const dir = path.join(app.getAppPath(), '.verify');
    fs.mkdirSync(dir, { recursive: true });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await sleep(1200); // let the sprite finish loading
    for (const state of states) {
      win.webContents.send('demo:set-state', state);
      await sleep(1100);
      if (state === 'session-finished') {
        const geometry = await win.webContents.executeJavaScript(
          `(() => {
            const pet = document.getElementById('pet');
            const bubble = document.getElementById('bubble');
            const cs = getComputedStyle(bubble);
            return {
              viewport: { w: innerWidth, h: innerHeight },
              pet: pet.getBoundingClientRect().toJSON(),
              bubble: bubble.getBoundingClientRect().toJSON(),
              bubbleStyle: {
                radius: cs.borderRadius,
                background: cs.backgroundColor,
                border: cs.borderColor,
                display: cs.display,
                whiteSpace: cs.whiteSpace,
              },
            };
          })()`,
        );
        console.log('[aemeath] geometry ' + JSON.stringify(geometry));
      }
      const image = await win.webContents.capturePage();
      const file = path.join(dir, 'state-' + state + '.png');
      fs.writeFileSync(file, image.toPNG());
      console.log('[aemeath] selfie saved: ' + state);
    }

    // Settings window: drive the slider like a user would and check it sticks.
    openSettingsWindow();
    await sleep(1200);
    const before = settings.chatterIntervalMin;
    await settingsWin.webContents.executeJavaScript(
      `(() => {
        const slider = document.getElementById('interval');
        slider.value = '8';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      })()`,
    );
    await sleep(600);
    console.log(
      '[aemeath] settings interval ' + before + ' -> ' + settings.chatterIntervalMin +
        ' (stored ' + settingsStore.data.chatterIntervalMin + ')',
    );
    const shot = await settingsWin.webContents.capturePage();
    fs.writeFileSync(path.join(dir, 'settings-window.png'), shot.toPNG());
    console.log('[aemeath] selfie saved: settings-window');
    Object.assign(settings, settingsStore.save({ chatterIntervalMin: before }));

    // Chatbot without a key: the lorebook answers, and the model is never called.
    const ask = async (text) => {
      await win.webContents.executeJavaScript(
        `(() => {
          document.getElementById('chat-input').value = ${JSON.stringify(text)};
          document.getElementById('chat-form').requestSubmit();
        })()`,
      );
      await sleep(1000);
    };
    const lastMessages = () =>
      win.webContents.executeJavaScript(
        `JSON.stringify([...document.querySelectorAll('#chat-log .msg')].slice(-2).map((m) => m.textContent))`,
      );
    win.webContents.send('chat:toggle');
    await sleep(1200);
    await ask('Apa itu Exostrider?');
    console.log('[aemeath] offline known ' + (await lastMessages()));
    await ask('Resep nasi goreng yang enak bagaimana?');
    console.log('[aemeath] offline unknown ' + (await lastMessages()));
    console.log('[aemeath] offline model calls ' + selfieRequests.length);
    const shotOffline = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, 'chat-offline.png'), shotOffline.toPNG());
    win.webContents.send('chat:toggle');
    await sleep(500);

    // Chatbot: save a throwaway key through the settings window, chat through the
    // chat window against the canned reply, and make sure the key never shows up
    // anywhere a renderer can read it.
    const selfieKey = 'selfie-test-key-0123456789';
    await settingsWin.webContents.executeJavaScript(
      `(async () => {
        document.getElementById('apikey').value = '${selfieKey}';
        document.getElementById('save-key').click();
      })()`,
    );
    await sleep(800);
    const settingsLeak = await settingsWin.webContents.executeJavaScript(
      `JSON.stringify({
        inputEmpty: document.getElementById('apikey').value === '',
        pageHasKey: document.documentElement.outerHTML.includes('${selfieKey}')
          || document.body.innerText.includes('${selfieKey}'),
        api: Object.keys(window.aemeathSettings),
        status: document.getElementById('key-status').textContent,
      })`,
    );
    console.log('[aemeath] key check (settings) ' + settingsLeak);
    await settingsWin.webContents.executeJavaScript(`document.getElementById('tab-chatbot').click()`);
    await sleep(300);
    const shotSettings = await settingsWin.webContents.capturePage();
    fs.writeFileSync(path.join(dir, 'settings-chatbot.png'), shotSettings.toPNG());

    // With a key and web search on, the model receives the lookup results.
    Object.assign(settings, settingsStore.save({ chatWebSearch: true }));
    selfieRequests.length = 0;
    win.webContents.send('chat:toggle');
    await sleep(1200);
    await win.webContents.executeJavaScript(
      `(() => {
        document.getElementById('chat-input').value = 'Apa itu Exostrider sebenarnya?';
        document.getElementById('chat-form').requestSubmit();
      })()`,
    );
    await sleep(1200);
    const chatCheck = await win.webContents.executeJavaScript(
      `JSON.stringify({
        panelVisible: !document.getElementById('chat').classList.contains('hidden'),
        messages: [...document.querySelectorAll('#chat-log .msg')].map((m) => m.className + ': ' + m.textContent),
        api: Object.keys(window.aemeath),
        pageHasKey: document.documentElement.outerHTML.includes('${selfieKey}'),
      })`,
    );
    console.log('[aemeath] chat check ' + chatCheck);
    console.log(
      '[aemeath] search block sent to model ' +
        selfieRequests.some((body) => String(body).includes('Hasil pencarian web')),
    );
    Object.assign(settings, settingsStore.save({ chatWebSearch: false }));
    const shotChat = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, 'chat-panel.png'), shotChat.toPNG());
    console.log('[aemeath] selfie saved: chat-panel');

    // Custom commands: save through the settings window, then run them from the
    // chat box. Launches are recorded by the selfie runner, never made.
    const saveResult = await settingsWin.webContents.executeJavaScript(
      `window.aemeathSettings.saveCommands([
        { name: '/Invoice', target: ${JSON.stringify(app.getPath('temp'))}, description: 'folder invoice' },
        { name: 'wuwa', target: 'https://example.com/wuwa' },
        { name: 'halo', type: 'powershell', script: 'Write-Output "halo dari perintah"', confirm: false, description: 'sapaan dari PowerShell' },
        { name: 'panjang', type: 'powershell', script: 'Write-Output (1..40 | ForEach-Object { \"baris $_\" })', confirm: false, description: 'empat puluh baris' },
        { name: 'matikan', type: 'powershell', script: 'shutdown /s /t 60 /c "Aemeath: komputer akan mati dalam 60 detik."', confirm: false, description: 'matikan komputer' },
        { name: 'bad name', target: 'notepad.exe' },
      ]).then((r) => JSON.stringify({ saved: r.saved.map((c) => c.name), errors: r.errors.map((e) => e.message) }))`,
    );
    console.log('[aemeath] commands saved ' + saveResult);
    settingsWin.webContents.reload();
    await sleep(1200);
    await settingsWin.webContents.executeJavaScript(
      `document.getElementById('tab-commands').click(); document.getElementById('builtin').scrollIntoView()`,
    );
    await sleep(300);
    const shotCommands = await settingsWin.webContents.capturePage();
    fs.writeFileSync(path.join(dir, 'settings-commands.png'), shotCommands.toPNG());
    await settingsWin.webContents.executeJavaScript(`document.getElementById('add-preset').scrollIntoView()`);
    await sleep(300);
    fs.writeFileSync(path.join(dir, 'settings-commands-ps.png'), (await settingsWin.webContents.capturePage()).toPNG());

    const requestsBefore = selfieRequests.length;
    win.webContents.send('chat:toggle'); // close
    await sleep(300);
    win.webContents.send('chat:toggle'); // reopen so it loads the new commands
    await sleep(1200);
    const type = (text) =>
      win.webContents.executeJavaScript(
        `(() => {
          const input = document.getElementById('chat-input');
          input.value = ${JSON.stringify(text)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`,
      );
    await type('/');
    await sleep(400);
    const suggestions = await win.webContents.executeJavaScript(
      `JSON.stringify([...document.querySelectorAll('#chat-suggest button')].map((b) => b.textContent))`,
    );
    console.log('[aemeath] suggestions for "/" ' + suggestions);
    const shotSuggest = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, 'chat-suggest.png'), shotSuggest.toPNG());

    for (const text of ['/invoice', '/nope', '/ketik;calc', '/help']) {
      await type(text);
      await win.webContents.executeJavaScript(`document.getElementById('chat-form').requestSubmit()`);
      await sleep(600);
    }
    const commandReplies = await win.webContents.executeJavaScript(
      `JSON.stringify([...document.querySelectorAll('#chat-log .msg')].slice(-8).map((m) => m.textContent))`,
    );
    console.log('[aemeath] command replies ' + commandReplies);
    console.log('[aemeath] launches ' + JSON.stringify(selfieLaunches));
    console.log('[aemeath] model calls during commands ' + (selfieRequests.length - requestsBefore));
    const shotRun = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, 'chat-commands.png'), shotRun.toPNG());

    // Terminal mode: /change-mode (the Windows prompt is skipped here), then a real
    // PowerShell session with harmless commands, then back to chat.
    const submit = async (text, wait) => {
      await type(text);
      await win.webContents.executeJavaScript(`document.getElementById('chat-form').requestSubmit()`);
      await sleep(wait || 900);
    };
    const launchesBefore = selfieLaunches.length;
    await submit('/change-mode', 1800);
    const modeOn = await win.webContents.executeJavaScript(
      `JSON.stringify({ terminal: document.getElementById('chat').classList.contains('terminal'), badge: !document.getElementById('chat-mode').classList.contains('hidden'), placeholder: document.getElementById('chat-input').placeholder })`,
    );
    console.log('[aemeath] terminal mode on ' + modeOn);
    await submit('Set-Location $env:TEMP', 1500);
    await submit('$greet = "halo dari terminal"; $greet', 1200);
    await submit(
      '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
      1200,
    );
    await submit('Get-Item Z:/tidak/ada', 1200);
    await submit('/invoice', 1200); // a custom command name is just text to the shell now
    const shotTerminal = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, 'chat-terminal.png'), shotTerminal.toPNG());
    const termLog = await win.webContents.executeJavaScript(
      `JSON.stringify([...document.querySelectorAll('#chat-log .msg')].slice(-10).map((m) => m.className.replace('msg ', '') + ': ' + m.textContent.slice(0, 110)))`,
    );
    console.log('[aemeath] terminal log ' + termLog);
    console.log('[aemeath] custom launches during terminal mode ' + (selfieLaunches.length - launchesBefore));
    await submit('exit', 1500);
    const modeOff = await win.webContents.executeJavaScript(
      `JSON.stringify({ terminal: document.getElementById('chat').classList.contains('terminal'), last: document.querySelector('#chat-log .msg:last-child').textContent })`,
    );
    console.log('[aemeath] terminal mode off ' + modeOff);

    // PowerShell commands: a harmless one runs and prints, a risky one asks first and can be
    // cancelled, and the verification run only records what would have been shut down.
    const lastReplies = (n) =>
      win.webContents.executeJavaScript(
        `JSON.stringify([...document.querySelectorAll('#chat-log .msg')].slice(-${n}).map((m) => m.className.replace('msg ', '') + ': ' + m.textContent.slice(0, 90)))`,
      );
    const psBefore = selfieLaunches.length;
    await submit('/halo', 3500);
    console.log('[aemeath] powershell command: ' + (await lastReplies(2)));
    // Regression guard: command output used to be squeezed to a sliver inside the message list.
    const outputSize = () =>
      win.webContents.executeJavaScript(
        `JSON.stringify([...document.querySelectorAll('#chat-log .cmd-out')].map((el) => ({ shown: Math.round(el.getBoundingClientRect().height), needs: el.scrollHeight })))`,
      );
    console.log('[aemeath] command output sizes after /halo: ' + (await outputSize()));
    await submit('/panjang', 3500);
    console.log('[aemeath] command output sizes after /panjang: ' + (await outputSize()));
    fs.writeFileSync(path.join(dir, 'chat-output.png'), (await win.webContents.capturePage()).toPNG());
    await submit('/matikan', 800);
    console.log('[aemeath] risky command asks first: ' + (await lastReplies(1)) + ' | launched so far: ' + (selfieLaunches.length - psBefore));
    await submit('nanti dulu', 800);
    console.log('[aemeath] answered no: ' + (await lastReplies(1)) + ' | launched: ' + (selfieLaunches.length - psBefore));
    await submit('/matikan', 800);
    await submit('ya', 900);
    console.log('[aemeath] answered yes: ' + (await lastReplies(1)) + ' | recorded: ' + JSON.stringify(selfieLaunches.slice(psBefore)));
    await submit('apa kabar Fleet?', 900);
    console.log('[aemeath] plain text after that is chat again: ' + (await lastReplies(1)));
    fs.writeFileSync(path.join(dir, 'chat-powershell.png'), (await win.webContents.capturePage()).toPNG());

    // The chat box: its size and where it goes. On this short screen (672 px) Aemeath dragged
    // to the middle leaves too little room above or below, so the box must go beside her.
    const boxMetrics = () =>
      win.webContents.executeJavaScript(
        `(() => {
          const el = document.getElementById('chat');
          const r = el.getBoundingClientRect();
          const p = document.getElementById('pet').getBoundingClientRect();
          return JSON.stringify({
            classes: el.className,
            width: Math.round(r.width),
            height: Math.round(r.height),
            list: document.getElementById('chat-log').style.maxHeight,
            coversPet: r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top,
            viewport: innerWidth + 'x' + innerHeight,
          });
        })()`,
      );
    console.log('[aemeath] chat box where she is: ' + (await boxMetrics()));
    await win.webContents.executeJavaScript(
      `(() => {
        const pet = document.getElementById('pet');
        const r = pet.getBoundingClientRect();
        const down = { screenX: r.left + 10, screenY: r.top + 10, button: 0, bubbles: true };
        pet.dispatchEvent(new MouseEvent('mousedown', down));
        window.dispatchEvent(new MouseEvent('mousemove', { screenX: down.screenX + (560 - r.left), screenY: down.screenY + (263 - r.top), bubbles: true }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      })()`,
    );
    await sleep(600);
    console.log('[aemeath] chat box with her in the middle: ' + (await boxMetrics()));
    fs.writeFileSync(path.join(dir, 'chat-side.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.getElementById('chat-size').click()`);
    await sleep(400);
    console.log('[aemeath] chat box large: ' + (await boxMetrics()));
    fs.writeFileSync(path.join(dir, 'chat-large.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.getElementById('chat-size').click()`);

    // Staying still: let her move again, watch her, switch the option on through the
    // settings window, and watch again. The bob is only a few pixels, so look at the spread.
    win.webContents.send('chat:toggle'); // close the box so nothing holds her
    await sleep(400);
    win.webContents.send('demo:set-state', 'free');
    const watch = async (ms) => {
      const seen = [];
      const until = Date.now() + ms;
      while (Date.now() < until) {
        seen.push(
          await win.webContents.executeJavaScript(
            `(() => { const c = document.getElementById('pet'); return [parseFloat(c.style.left), parseFloat(c.style.top)]; })()`,
          ),
        );
        await sleep(400);
      }
      const xs = seen.map((p) => p[0]);
      const ys = seen.map((p) => p[1]);
      return { samples: seen.length, xSpread: Math.round(Math.max(...xs) - Math.min(...xs)), ySpread: Math.round(Math.max(...ys) - Math.min(...ys)) };
    };
    console.log('[aemeath] free to move: ' + JSON.stringify(await watch(16000)));
    await settingsWin.webContents.executeJavaScript(`document.getElementById('tab-general').click(); document.getElementById('still-toggle').click()`);
    await sleep(700);
    const trayStill = menuTemplate().find((item) => item.label && item.label.startsWith('Diam di tempat'));
    console.log('[aemeath] stay still: ' + JSON.stringify(await watch(9000)) + ' | setting: ' + settings.stayStill + ' | tray: ' + JSON.stringify(trayStill && trayStill.label));
    await settingsWin.webContents.executeJavaScript(`document.getElementById('still-toggle').click()`);
    await sleep(500);
    console.log('[aemeath] stay still switched off again: ' + settings.stayStill);
    win.webContents.send('chat:toggle'); // open the box again for the steps below
    await sleep(600);

    // Interactive mode: go through the settings window like a user would (consent
    // first), then drive the real monitor with hand-made samples on a clock the
    // selfie moves itself. No real window is read.
    win.webContents.send('chat:toggle'); // close the chat box so remarks can show
    await sleep(500);
    const inSettings = (code) => settingsWin.webContents.executeJavaScript(code);
    await sleep(300);
    console.log(
      '[aemeath] startup in settings: ' +
        (await inSettings(
          `JSON.stringify({ checked: document.getElementById('startup-toggle').checked, status: document.getElementById('startup-status').textContent })`,
        )) +
        ' | setting: ' + settings.startAtLogin,
    );
    await inSettings(`document.getElementById('tab-general').click(); document.getElementById('mode-medium').click();`);
    await sleep(400);
    console.log(
      '[aemeath] medium consent ' +
        (await inSettings(
          `JSON.stringify({ consentShown: !document.getElementById('medium-consent').classList.contains('hidden'), mediumChecked: document.getElementById('mode-medium').checked, fullDisabled: document.getElementById('mode-full').disabled, soon: document.querySelector('.soon').textContent })`,
        )) +
        ' | mode in settings: ' + settings.interactiveMode + ' | reading: ' + activity.running,
    );
    fs.writeFileSync(path.join(dir, 'settings-interactive-consent.png'), (await settingsWin.webContents.capturePage()).toPNG());

    await inSettings(`document.getElementById('medium-accept').click()`);
    await sleep(900);
    console.log('[aemeath] medium on | mode: ' + settings.interactiveMode + ' | reading: ' + activity.running);

    selfieSample({ process: 'RobloxPlayerBeta', title: 'TOPSECRETTITLE', path: 'C:\\Users\\someone\\game.exe' });
    await sleep(1100);
    const bubbleText = () => win.webContents.executeJavaScript(`document.getElementById('bubble').textContent`);
    console.log('[aemeath] game remark: ' + JSON.stringify(await bubbleText()));
    await win.webContents.executeJavaScript(`document.getElementById('bubble').click()`);

    // 21 minutes of Instagram in 3 second steps (the default limit is 20 minutes)
    selfieRemarks.length = 0;
    selfieSample({ process: 'chrome', title: 'Instagram - Google Chrome', path: '' });
    for (let i = 0; i < 420; i++) {
      selfieNow += 3000;
      selfieSample({ process: 'chrome', title: 'Instagram - Google Chrome', path: '' });
    }
    await sleep(1100);
    console.log('[aemeath] remarks made: ' + JSON.stringify(selfieRemarks) + ' | bubble: ' + JSON.stringify(await bubbleText()));
    fs.writeFileSync(path.join(dir, 'activity-remark.png'), (await win.webContents.capturePage()).toPNG());

    const trayLine = menuTemplate().find((item) => item.label && item.label.startsWith('Aktivitas'));
    const seen = await inSettings(`window.aemeathSettings.getActivity().then((a) => JSON.stringify(a))`);
    console.log('[aemeath] what she sees: tray ' + JSON.stringify(trayLine && trayLine.label) + ' | settings ' + seen);
    console.log('[aemeath] title leaked anywhere: ' + (JSON.stringify([trayLine, seen, selfieRemarks]).includes('TOPSECRET')));
    fs.writeFileSync(path.join(dir, 'settings-interactive-on.png'), (await settingsWin.webContents.capturePage()).toPNG());

    await inSettings(`window.aemeathSettings.set({ interactiveMode: 'full' })`);
    await sleep(500);
    console.log('[aemeath] asking for full -> mode stays ' + settings.interactiveMode);

    await inSettings(`document.getElementById('mode-low').click()`);
    await sleep(700);
    console.log(
      '[aemeath] back to low | mode: ' + settings.interactiveMode + ' | reading: ' + activity.running +
        ' | sees: ' + activity.describe() + ' | tray line gone: ' +
        !menuTemplate().some((item) => item.label && item.label.startsWith('Aktivitas')),
    );
    app.quit();
  }

  // The tray is created once the window is up; on some platforms the tray icon
  // must exist before first use, so create it eagerly after ready.
  app.whenReady().then(() => createTray());
}
