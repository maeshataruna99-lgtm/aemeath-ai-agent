'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { createClaudeCodeProvider } = require('./src/claude-code-provider');
const { createMediaWatcher } = require('./src/media-watcher');
const { createSettingsStore, MIN_SCALE, MAX_SCALE } = require('./src/settings');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  main();
}

function main() {
  const isSelfie = process.argv.includes('--selfie');
  app.setAppUserModelId('aemeth.ai.agent');

  let win = null;
  let tray = null;
  let provider = null;
  let media = null;
  let aggregateTimer = null;

  const settingsStore = createSettingsStore(app.getPath('userData'));
  const settings = settingsStore.load();
  const atlasJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'assets', 'pet', 'atlas.json'), 'utf8'),
  );

  app.on('second-instance', () => {
    if (win) {
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
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
      console.log('[aemeth] pet window ready ' + workArea.width + 'x' + workArea.height);
      startWatchers();
      if (isSelfie) runSelfie();
    });

    ipcMain.handle('init', () => ({
      settings: settings,
      atlas: atlasJson,
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
    return [
      { label: 'Sesi AI berjalan: ' + running, enabled: false },
      { type: 'separator' },
      { label: 'Tampilkan Aemeth', click: () => win?.show() },
      { label: 'Sembunyikan Aemeth', click: () => win?.hide() },
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
      .createFromPath(path.join(__dirname, 'assets', 'icon.png'))
      .resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('Aemeth');
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
        console.log('[aemeth] geometry ' + JSON.stringify(geometry));
      }
      const image = await win.webContents.capturePage();
      const file = path.join(dir, 'state-' + state + '.png');
      fs.writeFileSync(file, image.toPNG());
      console.log('[aemeth] selfie saved: ' + state);
    }
    app.quit();
  }

  // The tray is created once the window is up; on some platforms the tray icon
  // must exist before first use, so create it eagerly after ready.
  app.whenReady().then(() => createTray());
}
