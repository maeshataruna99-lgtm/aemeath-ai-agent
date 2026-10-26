'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  dialog,
  safeStorage,
  screen,
  shell,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const { createClaudeCodeProvider } = require('./src/claude-code-provider');
const { createMediaWatcher } = require('./src/media-watcher');
const { loadLorebook } = require('./src/lorebook-loader');
const { createKeyStore } = require('./src/chat/key-store');
const { createProviders } = require('./src/chat/providers');
const { createChatService } = require('./src/chat/chat-service');
const { createWebSearch } = require('./src/chat/web-search');
const { createLocalResponder } = require('./src/chat/local-responder');
const { createCommandStore } = require('./src/commands/command-store');
const { createCommandRunner } = require('./src/commands/command-runner');
const { createCommandHandler } = require('./src/commands/command-handler');
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
  let lorebookData = { sources: {}, entries: [] };
  try {
    lorebookData = loadLorebook(path.join(__dirname, 'lorebook'));
  } catch (error) {
    console.error('[aemeath] lorebook disabled: ' + error.message);
  }

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

  const chatService = createChatService({
    providers,
    getKey: (id) => (keyStore ? keyStore.get(id) : null),
    getConfig: chatConfig,
    getKnowledge: () => lorebookData.entries.map((e) => ({ topic: e.topic, text: e.text })),
    getFeatures: () => ({
      webSearch: settings.chatWebSearch === true,
      offlineFallback: settings.chatOfflineFallback !== false,
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
  const commandRunner = isSelfie
    ? {
        run: async (command) => {
          selfieLaunches.push(command.target);
          return { ok: true };
        },
      }
    : createCommandRunner({ shell, spawn, exists: fs.existsSync, env: process.env });
  const commandHandler = createCommandHandler({
    getCommands: () => (commandStore ? commandStore.list() : []),
    run: commandRunner.run,
  });

  const fromWindow = (event, target) => Boolean(target) && event.sender === target.webContents;

  app.whenReady().then(() => {
    // The selfie run uses a throwaway folder so it never touches real commands.
    commandStore = createCommandStore({
      dir: isSelfie
        ? fs.mkdtempSync(path.join(app.getPath('temp'), 'aemeath-selfie-'))
        : app.getPath('userData'),
    });

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
    ipcMain.handle('settings-window:get', () => settings);
    ipcMain.on('settings-window:set', (_event, patch) => {
      const next = {};
      if (patch && typeof patch.chatterEnabled === 'boolean') next.chatterEnabled = patch.chatterEnabled;
      for (const flag of ['chatWebSearch', 'chatOfflineFallback']) {
        if (patch && typeof patch[flag] === 'boolean') next[flag] = patch[flag];
      }
      if (patch && typeof patch.chatterIntervalMin === 'number') {
        next.chatterIntervalMin = patch.chatterIntervalMin;
      }
      Object.assign(settings, settingsStore.save(next));
      win?.webContents?.send('settings:updated', settings);
      updateTray();
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
      try {
        const reply = await chatService.send(text);
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
        ? commandStore.list().map((c) => ({ name: c.name, description: c.description }))
        : [],
    );
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
      { type: 'separator' },
      { label: 'Ngobrol dengan Aemeath...', click: () => toggleChat() },
      { type: 'separator' },
      { label: 'Tampilkan Aemeath', click: () => win?.show() },
      { label: 'Sembunyikan Aemeath', click: () => win?.hide() },
      { type: 'separator' },
      { label: 'Skala: perbesar', click: () => adjustScale(0.1) },
      { label: 'Skala: perkecil', click: () => adjustScale(-0.1) },
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
        { name: 'bad name', target: 'notepad.exe' },
      ]).then((r) => JSON.stringify({ saved: r.saved.map((c) => c.name), errors: r.errors.map((e) => e.message) }))`,
    );
    console.log('[aemeath] commands saved ' + saveResult);
    settingsWin.webContents.reload();
    await sleep(1200);
    await settingsWin.webContents.executeJavaScript(
      `document.getElementById('commands').scrollIntoView()`,
    );
    await sleep(300);
    const shotCommands = await settingsWin.webContents.capturePage();
    fs.writeFileSync(path.join(dir, 'settings-commands.png'), shotCommands.toPNG());

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
    app.quit();
  }

  // The tray is created once the window is up; on some platforms the tray icon
  // must exist before first use, so create it eagerly after ready.
  app.whenReady().then(() => createTray());
}
