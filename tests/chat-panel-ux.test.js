'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Unref any timeouts so tests do not hang the event loop
const origSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, delay, ...args) => {
  const t = origSetTimeout(fn, delay, ...args);
  if (t && typeof t.unref === 'function' && delay >= 1000) t.unref();
  return t;
};

// Minimal Fake DOM to test chat-panel browser interactions inside Node.js
class FakeElement {
  constructor(tag, id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this._classes = new Set();
    this.classList = {
      _classes: this._classes,
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this._classes.has(c)) this._classes.delete(c);
          else this._classes.add(c);
        } else if (force) {
          this._classes.add(c);
        } else {
          this._classes.delete(c);
        }
      },
      contains: (c) => this._classes.has(c),
    };
    this.children = [];
    this.parentElement = null;
    this.value = '';
    this.disabled = false;
    this._textContent = '';
    this.innerHTML = '';
    this.style = {
      setProperty: (k, v) => {
        this.style[k] = v;
      },
    };
    this.listeners = new Map();
  }

  set className(val) {
    this._classes.clear();
    if (typeof val === 'string') {
      val.split(/\s+/).filter(Boolean).forEach((c) => this._classes.add(c));
    }
  }

  get className() {
    return Array.from(this._classes).join(' ');
  }

  get firstChild() {
    return this.children[0] || null;
  }

  set textContent(val) {
    this._textContent = val;
    if (val === '') {
      this.children = [];
    }
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this.children.map((c) => c.textContent).join('');
  }

  setAttribute(name, val) {
    if (!this._attributes) this._attributes = new Map();
    this._attributes.set(name, String(val));
    if (name === 'class') this.className = val;
    if (name === 'id') this.id = val;
  }

  getAttribute(name) {
    if (!this._attributes) return null;
    return this._attributes.has(name) ? this._attributes.get(name) : null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  append(...items) {
    items.forEach((item) => this.appendChild(item));
  }

  remove() {
    if (this.parentElement) this.parentElement.removeChild(this);
  }

  querySelector(sel) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      const find = (node) => {
        if (node.classList && node.classList.contains(cls)) return node;
        for (const c of node.children) {
          const res = find(c);
          if (res) return res;
        }
        return null;
      };
      for (const c of this.children) {
        const res = find(c);
        if (res) return res;
      }
      return null;
    }
    return null;
  }

  querySelectorAll(sel) {
    const results = [];
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      const scan = (node) => {
        if (node.classList && node.classList.contains(cls)) results.push(node);
        node.children.forEach(scan);
      };
      this.children.forEach(scan);
    }
    return results;
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const fn of list) fn(event);
  }

  focus() {}
  blur() {}
  click() {
    this.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  }
}

class FakeFileReader {
  readAsDataURL(file) {
    origSetTimeout(() => {
      this.result = 'data:' + (file.type || 'image/png') + ';base64,' + (file._base64 || 'ZmFrZQ==');
      if (typeof this.onload === 'function') this.onload();
    }, 5);
  }
}

function setupChatPanelEnvironment() {
  const elements = new Map();
  const ids = [
    'chat',
    'chat-head',
    'chat-log',
    'chat-form',
    'chat-input',
    'chat-send',
    'chat-notice',
    'chat-notice-text',
    'chat-settings',
    'chat-reset',
    'chat-close',
    'chat-suggest',
    'chat-mode',
    'chat-size',
    'chat-attachments',
    'chat-attachments-disclosure',
    'chat-file-input',
    'chat-attach',
    'chat-folder',
    'chat-folder-btn',
    'chat-folder-name',
    'chat-folder-menu',
    'chat-agentbar',
    'chat-session',
    'chat-session-btn',
    'chat-session-name',
    'chat-session-menu',
    'chat-opt-model',
    'chat-opt-model-btn',
    'chat-opt-model-name',
    'chat-opt-model-menu',
    'chat-opt-effort',
    'chat-opt-effort-btn',
    'chat-opt-effort-name',
    'chat-opt-effort-menu',
    'chat-opt-perm',
    'chat-opt-perm-btn',
    'chat-opt-perm-name',
    'chat-opt-perm-menu',
  ];

  ids.forEach((id) => {
    const tag = id.includes('input') ? 'input' : id.includes('button') || id.includes('attach') || id.includes('send') || id.includes('size') || id.includes('reset') || id.includes('close') || id.includes('settings') ? 'button' : 'div';
    const el = new FakeElement(tag, id);
    if (id === 'chat-attachments' || id === 'chat-attachments-disclosure' || id === 'chat-suggest' || id === 'chat-notice' || id === 'chat' || id === 'chat-mode' || id === 'chat-folder' || id === 'chat-folder-menu' || id === 'chat-agentbar' || id === 'chat-session' || id === 'chat-session-menu' || /^chat-opt-(model|effort|perm)(-menu)?$/.test(id)) {
      el.className = 'hidden';
    }
    elements.set(id, el);
  });

  const fakeDocument = {
    addEventListener: () => {},
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
  };

  const fakeWindow = {
    addEventListener: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    AemeathChatLayout: {
      placeBox: () => ({ placement: 'above', logMax: 300, arrow: 'up', left: 0, top: 0, arrowX: 0 }),
    },
    FileReader: FakeFileReader,
  };

  globalThis.document = fakeDocument;
  globalThis.window = fakeWindow;
  globalThis.FileReader = FakeFileReader;

  // Execute chat-panel.js script
  const code = fs.readFileSync(path.join(__dirname, '../renderer/chat-panel.js'), 'utf8');
  eval(code);

  return {
    elements,
    createPanel: (apiOverrides) => {
      const defaultApi = {
        chatStatus: async () => ({ providers: [{ id: 'fake', name: 'Fake', hasKey: true }], provider: 'fake' }),
        listCommands: async () => [],
        focusWindow: () => {},
        blurWindow: () => {},
        chatReset: () => {},
        chatSend: async () => ({ ok: true, text: 'balasan' }),
      };
      return window.AemeathChatPanel.create({
        api: Object.assign(defaultApi, apiOverrides),
        anchor: () => ({ centerX: 100, top: 100, bottom: 200 }),
        bounds: () => ({ width: 1000, height: 800 }),
      });
    },
  };
}

test('IMG-02 & IMG-03: file input change accepts PNG and JPEG files and displays preview thumbnail', async () => {
  const { elements, createPanel } = setupChatPanelEnvironment();
  const panel = createPanel();
  await panel.open();

  const fileInput = elements.get('chat-file-input');
  const attachContainer = elements.get('chat-attachments');

  assert.ok(attachContainer.classList.contains('hidden'));

  // Simulate file upload
  const fakeFile = {
    name: 'test.png',
    type: 'image/png',
    size: 2048,
    _base64: 'iVBORw0KGgoAAAANSUhEUg==',
  };
  fileInput.files = [fakeFile];
  fileInput.dispatchEvent({ type: 'change' });

  // Wait for FileReader
  await new Promise((r) => origSetTimeout(r, 20));

  assert.ok(!attachContainer.classList.contains('hidden'), 'Attachment preview container should be visible');
  assert.equal(attachContainer.children.length, 1);
  const item = attachContainer.children[0];
  const thumb = item.querySelector('.chat-att-thumb');
  const name = item.querySelector('.chat-att-name');
  assert.ok(thumb);
  assert.equal(name.textContent, 'test.png');
});

test('IMG-04: clipboard paste with image file attaches image and prevents default text paste', async () => {
  const { elements, createPanel } = setupChatPanelEnvironment();
  const panel = createPanel();
  await panel.open();

  const chatInput = elements.get('chat-input');
  const attachContainer = elements.get('chat-attachments');

  let defaultPrevented = false;
  const pasteEvent = {
    type: 'paste',
    preventDefault: () => {
      defaultPrevented = true;
    },
    clipboardData: {
      getData: (type) => (type === 'text/plain' ? '' : null),
      items: [
        {
          type: 'image/png',
          getAsFile: () => ({
            name: 'clipboard.png',
            type: 'image/png',
            size: 4096,
            _base64: 'c2NyZWVuc2hvdA==',
          }),
        },
      ],
    },
  };

  chatInput.dispatchEvent(pasteEvent);
  await new Promise((r) => origSetTimeout(r, 20));

  assert.equal(defaultPrevented, true, 'preventDefault should be called when pasting pure image');
  assert.ok(!attachContainer.classList.contains('hidden'));
  assert.equal(attachContainer.children.length, 1);
});

test('IMG-05: clipboard paste with ordinary text does NOT prevent default and adds NO image attachments', async () => {
  const { elements, createPanel } = setupChatPanelEnvironment();
  const panel = createPanel();
  await panel.open();

  const chatInput = elements.get('chat-input');
  const attachContainer = elements.get('chat-attachments');

  let defaultPrevented = false;
  const pasteEvent = {
    type: 'paste',
    preventDefault: () => {
      defaultPrevented = true;
    },
    clipboardData: {
      getData: (type) => (type === 'text/plain' ? 'Halo Aemeath' : null),
      items: [{ type: 'text/plain' }],
    },
  };

  chatInput.dispatchEvent(pasteEvent);
  await new Promise((r) => origSetTimeout(r, 20));

  assert.equal(defaultPrevented, false, 'Ordinary text paste should NOT be prevented');
  assert.ok(attachContainer.classList.contains('hidden'), 'No attachments should be added');
  assert.equal(attachContainer.children.length, 0);
});

test('IMG-06: removing an attachment removes only the clicked attachment and leaves text intact', async () => {
  const { elements, createPanel } = setupChatPanelEnvironment();
  const panel = createPanel();
  await panel.open();

  const fileInput = elements.get('chat-file-input');
  const chatInput = elements.get('chat-input');
  const attachContainer = elements.get('chat-attachments');

  chatInput.value = 'Pertanyaan penting saya';

  // Attach two files
  fileInput.files = [
    { name: 'file1.png', type: 'image/png', size: 1024, _base64: 'MQ==' },
    { name: 'file2.jpg', type: 'image/jpeg', size: 2048, _base64: 'Mg==' },
  ];
  fileInput.dispatchEvent({ type: 'change' });
  await new Promise((r) => origSetTimeout(r, 25));

  assert.equal(attachContainer.children.length, 2);

  // Click remove on the first attachment
  const firstRemoveBtn = attachContainer.children[0].querySelector('.chat-att-remove');
  assert.ok(firstRemoveBtn);
  firstRemoveBtn.click();

  // Now only 1 attachment should remain
  assert.equal(attachContainer.children.length, 1);
  const remainingName = attachContainer.children[0].querySelector('.chat-att-name');
  assert.equal(remainingName.textContent, 'file2.jpg');

  // User input text is preserved!
  assert.equal(chatInput.value, 'Pertanyaan penting saya');
});

test('submitting with attachment sends payload object { text, attachments } to chatSend API', async () => {
  let sentPayload = null;
  const { elements, createPanel } = setupChatPanelEnvironment();
  const panel = createPanel({
    chatSend: async (input) => {
      sentPayload = input;
      return { ok: true, text: 'Analisis selesai' };
    },
  });
  await panel.open();

  const fileInput = elements.get('chat-file-input');
  const chatInput = elements.get('chat-input');
  const form = elements.get('chat-form');

  chatInput.value = 'Jelaskan gambar ini';
  fileInput.files = [{ name: 'diagram.webp', type: 'image/webp', size: 1200, _base64: 'ZGlhZ3JhbQ==' }];
  fileInput.dispatchEvent({ type: 'change' });
  await new Promise((r) => origSetTimeout(r, 20));

  let submitted = false;
  form.dispatchEvent({
    type: 'submit',
    preventDefault: () => {
      submitted = true;
    },
  });
  await new Promise((r) => origSetTimeout(r, 20));

  assert.ok(submitted);
  assert.ok(sentPayload);
  assert.equal(sentPayload.text, 'Jelaskan gambar ini');
  assert.equal(sentPayload.attachments.length, 1);
  assert.equal(sentPayload.attachments[0].name, 'diagram.webp');
  assert.equal(sentPayload.attachments[0].mimeType, 'image/webp');
  assert.equal(sentPayload.attachments[0].data, 'ZGlhZ3JhbQ==');

  // Input and pending attachments are cleared after sending
  assert.equal(chatInput.value, '');
  assert.ok(elements.get('chat-attachments').classList.contains('hidden'));
});

test('resetConversation clears pending attachments', async () => {
  const { elements, createPanel } = setupChatPanelEnvironment();
  const panel = createPanel();
  await panel.open();

  const fileInput = elements.get('chat-file-input');
  const attachContainer = elements.get('chat-attachments');
  const resetButton = elements.get('chat-reset');

  fileInput.files = [{ name: 'file.png', type: 'image/png', size: 1024, _base64: 'MQ==' }];
  fileInput.dispatchEvent({ type: 'change' });
  await new Promise((r) => origSetTimeout(r, 20));

  assert.equal(attachContainer.children.length, 1);

  resetButton.click();
  assert.equal(attachContainer.children.length, 0);
  assert.ok(attachContainer.classList.contains('hidden'));
});

// --- Folder bar: the folder /claude works in, chosen from the chat box ---

const CHECK = String.fromCharCode(0x2713);

function foldersState(over) {
  return Object.assign(
    {
      enabled: true,
      busy: false,
      isHome: false,
      current: { name: 'proyek-a', path: 'C:/kerja/proyek-a' },
      recent: [
        { name: 'proyek-a', path: 'C:/kerja/proyek-a' },
        { name: 'proyek-b', path: 'C:/kerja/proyek-b' },
      ],
    },
    over || {}
  );
}

async function typeInto(env, text) {
  env.elements.get('chat-input').value = text;
  env.elements.get('chat-form').dispatchEvent({ type: 'submit', preventDefault: () => {} });
  await new Promise((resolve) => origSetTimeout(resolve, 25));
}

// The folder chip lives in Claude mode, so these tests switch it on first unless told to stay in chat.
async function openWithFolders(state, apiExtra, options) {
  const env = setupChatPanelEnvironment();
  window.AemeathI18n = require('../src/i18n');
  const calls = { use: [], pick: 0 };
  let current = state;
  const panel = env.createPanel(
    Object.assign(
      {
        agentFolders: async () => current,
        agentFolderUse: async (which) => {
          calls.use.push(which);
          if (which === 'home') current = Object.assign({}, current, { isHome: true, current: { name: 'home', path: 'C:/Users/me' } });
          else current = Object.assign({}, current, { isHome: false, current: current.recent[which] });
          return current;
        },
        agentFolderPick: async () => {
          calls.pick++;
          current = Object.assign({}, current, { current: { name: 'baru', path: 'C:/kerja/baru' } });
          return current;
        },
        runCommand: async (text) =>
          text === '/claude-mode'
            ? { isCommand: true, ok: true, text: 'Mode Claude aktif', mode: 'claude' }
            : { isCommand: true, ok: true, text: 'ok' },
      },
      apiExtra || {}
    )
  );
  await panel.open();
  if (!(options && options.stayInChat)) await typeInto(env, '/claude-mode');
  return {
    env,
    panel,
    calls,
    bar: env.elements.get('chat-folder'),
    menu: env.elements.get('chat-folder-menu'),
    button: env.elements.get('chat-folder-btn'),
    name: env.elements.get('chat-folder-name'),
    log: env.elements.get('chat-log'),
  };
}

test('the folder bar is hidden while the module is off and shows the folder name when on', async () => {
  const off = await openWithFolders(foldersState({ enabled: false }));
  assert.equal(off.bar.classList.contains('hidden'), true);

  const on = await openWithFolders(foldersState());
  assert.equal(on.bar.classList.contains('hidden'), false);
  assert.equal(on.name.textContent, 'proyek-a');
  assert.match(on.button.title, /C:\/kerja\/proyek-a/);
  delete window.AemeathI18n;
});

test('the folder bar shows only in Claude mode, even when the module is on', async () => {
  const t = await openWithFolders(foldersState(), {}, { stayInChat: true });
  assert.equal(t.bar.classList.contains('hidden'), true, 'not shown in plain chat');
  await typeInto(t.env, '/claude-mode');
  assert.equal(t.bar.classList.contains('hidden'), false, 'shown once Claude mode is on');
  await typeInto(t.env, '/claude-mode');
  assert.equal(t.bar.classList.contains('hidden'), true, 'gone again after leaving');
  delete window.AemeathI18n;
});

test('the home folder is shown by name, not by path', async () => {
  const t = await openWithFolders(foldersState({ isHome: true, current: { name: 'me', path: 'C:/Users/me' } }));
  assert.equal(t.name.textContent, 'Folder home');
  delete window.AemeathI18n;
});

test('the menu lists recent folders, the picker and home, and marks the current one', async () => {
  const t = await openWithFolders(foldersState());
  t.button.click();
  assert.equal(t.menu.classList.contains('hidden'), false);
  const labels = t.menu.children.map((c) => c.textContent);
  assert.deepEqual(labels, [CHECK + ' proyek-a', 'proyek-b', 'Pilih folder lain...', 'Folder home']);
  assert.equal(t.menu.children[1].title, 'C:/kerja/proyek-b');
  assert.equal(t.button.getAttribute('aria-expanded'), 'true');
  t.button.click();
  assert.equal(t.menu.classList.contains('hidden'), true);
  delete window.AemeathI18n;
});

test('choosing a recent folder sends only its position and says Claude starts over', async () => {
  const t = await openWithFolders(foldersState());
  t.button.click();
  t.menu.children[1].click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(t.calls.use, [1]);
  assert.equal(t.name.textContent, 'proyek-b');
  assert.equal(t.menu.classList.contains('hidden'), true);
  assert.match(t.log.children.map((c) => c.textContent).join('|'), /Claude sekarang bekerja di proyek-b/);
  delete window.AemeathI18n;
});

test('the picker and the home entry call their own actions', async () => {
  const t = await openWithFolders(foldersState());
  t.button.click();
  t.menu.children[2].click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(t.calls.pick, 1);
  assert.equal(t.name.textContent, 'baru');
  t.button.click();
  t.menu.children[t.menu.children.length - 1].click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(t.calls.use, ['home']);
  assert.equal(t.name.textContent, 'Folder home');
  delete window.AemeathI18n;
});

test('nothing changes while a request runs, and the user is told why', async () => {
  const t = await openWithFolders(foldersState({ busy: true }));
  t.button.click();
  t.menu.children[1].click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(t.calls.use, []);
  assert.equal(t.calls.pick, 0);
  assert.match(t.log.children.map((c) => c.textContent).join('|'), /Tunggu permintaan \/claude/);
  delete window.AemeathI18n;
});

test('turning the module off hides the folder bar and ends Claude mode', async () => {
  let enabled = true;
  let notify = null;
  const t = await openWithFolders(foldersState(), {
    agentFolders: async () => foldersState({ enabled }),
    onSettingsUpdated: (fn) => {
      notify = fn;
    },
  });
  assert.equal(t.bar.classList.contains('hidden'), false);
  enabled = false;
  notify({});
  await new Promise((resolve) => origSetTimeout(resolve, 25));
  assert.equal(t.bar.classList.contains('hidden'), true);
  assert.equal(t.env.elements.get('chat-mode').classList.contains('hidden'), true);
  delete window.AemeathI18n;
});

// --- /claude: the bubble shows what the CLI is doing, reported by Aemeath ---

test('the /claude bubble shows status lines from the CLI in Aemeath\'s voice until the answer arrives', async () => {
  const env = setupChatPanelEnvironment();
  window.AemeathI18n = require('../src/i18n');
  let stepCallback = null;
  let finish = null;
  const panel = env.createPanel({
    onAgentStep: (fn) => {
      stepCallback = fn;
      return () => {
        stepCallback = null;
      };
    },
    runCommand: () =>
      new Promise((resolve) => {
        finish = () => resolve({ isCommand: true, ok: true, text: 'jawaban akhir' });
      }),
  });
  await panel.open();
  const log = env.elements.get('chat-log');
  const messages = () => log.children.map((c) => c.textContent);

  env.elements.get('chat-input').value = '/claude baca README';
  env.elements.get('chat-form').dispatchEvent({ type: 'submit', preventDefault: () => {} });
  await new Promise((r) => origSetTimeout(r, 20));

  const pending = log.children[log.children.length - 1];
  assert.ok(pending.classList.contains('pending'));
  assert.equal(pending.textContent, 'Aemeath sedang menghubungi Claude...');
  assert.doesNotMatch(messages().join('|'), /Claude sedang bekerja/);

  stepCallback({ text: 'Aemeath meneruskan pesanmu ke Claude…' });
  stepCallback({ text: 'Membaca: README.md' });
  stepCallback({ text: 'Membaca: README.md' }); // a repeat is not shown twice
  stepCallback({ text: 'Mencari: workflow' });
  assert.equal(pending.textContent, ['Aemeath meneruskan pesanmu ke Claude…', 'Membaca: README.md', 'Mencari: workflow'].join('\n'));

  for (let i = 0; i < 6; i++) stepCallback({ text: 'Langkah ' + i });
  assert.equal(pending.textContent.split('\n').length, 5, 'only the last five lines are kept');

  finish();
  await new Promise((r) => origSetTimeout(r, 20));
  assert.match(messages().join('|'), /jawaban akhir/);
  assert.doesNotMatch(messages().join('|'), /Langkah 5\|/);
  assert.equal(stepCallback, null, 'the listener is released when the request ends');
  delete window.AemeathI18n;
});

// --- Claude mode and the session chip ---

const DOT = String.fromCharCode(0xb7);
const S1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const S2 = 'bbbbbbbb-0000-4000-8000-000000000002';

function sessionsState(over) {
  return Object.assign(
    {
      enabled: true,
      busy: false,
      current: null,
      items: [
        { id: S1, short: 'aaaaaaaa', age: '5 menit lalu' },
        { id: S2, short: 'bbbbbbbb', age: '3 jam lalu' },
      ],
    },
    over || {}
  );
}

async function agentPanel(extra) {
  const env = setupChatPanelEnvironment();
  window.AemeathI18n = require('../src/i18n');
  const sent = [];
  const t = {
    env,
    sent,
    sessionCalls: [],
    folderEnabled: true,
    sessions: sessionsState(),
    refreshes: 0,
  };
  const panel = env.createPanel(
    Object.assign(
      {
        agentFolders: async () => foldersState({ enabled: t.folderEnabled }),
        agentSessions: async () => {
          t.refreshes++;
          return t.sessions;
        },
        agentSessionUse: async (which) => {
          t.sessionCalls.push(which);
          if (t.refuse) return { ok: false, code: t.refuse, state: t.sessions };
          t.sessions = which === 'new' ? sessionsState({ current: null }) : sessionsState({ current: { id: which, short: which.slice(0, 8) } });
          return { ok: true, state: t.sessions };
        },
        runCommand: async (text) => {
          sent.push(text);
          if (text === '/claude-mode') return { isCommand: true, ok: true, text: 'Mode Claude aktif', mode: 'claude' };
          if (text === '/change-mode') return { isCommand: true, ok: true, text: 'Mode terminal aktif', mode: 'terminal', cwd: 'C:/x' };
          return { isCommand: true, ok: true, text: 'dijawab: ' + text };
        },
        terminalRun: async () => {
          t.terminalCalls = (t.terminalCalls || 0) + 1;
          return { ok: true, output: '', mode: 'terminal', cwd: 'C:/x' };
        },
      },
      extra || {}
    )
  );
  await panel.open();
  t.panel = panel;
  t.log = env.elements.get('chat-log');
  t.input = env.elements.get('chat-input');
  t.badge = env.elements.get('chat-mode');
  t.chat = env.elements.get('chat');
  t.bar = env.elements.get('chat-agentbar');
  t.sessionBar = env.elements.get('chat-session');
  t.sessionName = env.elements.get('chat-session-name');
  t.sessionMenu = env.elements.get('chat-session-menu');
  t.sessionButton = env.elements.get('chat-session-btn');
  t.say = (text) => typeInto(env, text);
  // The folder and session chips live in Claude mode.
  t.enter = async () => {
    await t.say('/claude-mode');
    t.sent.length = 0;
  };
  t.texts = () => t.log.children.map((c) => c.textContent).join('|');
  return t;
}

test('/claude-mode switches the box into Claude mode', async () => {
  const t = await agentPanel();
  assert.equal(t.badge.classList.contains('hidden'), true);
  await t.say('/claude-mode');
  assert.deepEqual(t.sent, ['/claude-mode']);
  assert.equal(t.badge.classList.contains('hidden'), false);
  assert.equal(t.badge.textContent, 'Claude');
  assert.equal(t.chat.classList.contains('claude'), true);
  assert.match(t.input.placeholder, /Tulis tugas untuk Claude/);
  delete window.AemeathI18n;
});

test('in Claude mode plain text goes to Claude without typing /claude, and /commands stay commands', async () => {
  const t = await agentPanel();
  await t.enter();
  await t.say('jelaskan struktur folder ini');
  await t.say('ya');
  await t.say('/jadwal');
  assert.deepEqual(t.sent, ['/claude jelaskan struktur folder ini', '/claude ya', '/jadwal']);
  const typed = t.log.children.filter((c) => c.classList.contains('user')).map((c) => c.textContent);
  assert.deepEqual(typed, ['/claude-mode', 'jelaskan struktur folder ini', 'ya', '/jadwal'], 'the bubbles show what was typed, not the prefix');
  delete window.AemeathI18n;
});

test('typing /claude-mode again leaves the mode without calling anything', async () => {
  const t = await agentPanel();
  await t.enter();
  await t.say('/claude-mode');
  assert.deepEqual(t.sent, []);
  assert.equal(t.badge.classList.contains('hidden'), true);
  assert.equal(t.chat.classList.contains('claude'), false);
  assert.match(t.texts(), /Keluar dari mode Claude/);
  assert.match(t.input.placeholder, /Tulis pesan/);
  delete window.AemeathI18n;
});

test('"off" when the mode is not on, and "on" when it already is, only explain', async () => {
  const t = await agentPanel();
  await t.say('/claude-mode off');
  assert.deepEqual(t.sent, []);
  assert.match(t.texts(), /Mode Claude sedang tidak aktif/);
  await t.enter();
  await t.say('/claude-mode on');
  assert.deepEqual(t.sent, []);
  assert.match(t.texts(), /Mode Claude sudah aktif/);
  assert.equal(t.badge.classList.contains('hidden'), false);
  delete window.AemeathI18n;
});

test('terminal mode refuses Claude mode and keeps the text away from PowerShell', async () => {
  const t = await agentPanel();
  await t.say('/change-mode');
  assert.equal(t.chat.classList.contains('terminal'), true);
  await t.say('/claude-mode');
  assert.equal(t.terminalCalls || 0, 0);
  assert.match(t.texts(), /Keluar dari mode terminal dulu/);
  assert.equal(t.chat.classList.contains('claude'), false);
  assert.equal(t.bar.classList.contains('hidden'), true, 'the folder and session chips are hidden in terminal mode');
  delete window.AemeathI18n;
});

test('turning the module off ends Claude mode', async () => {
  let notify = null;
  const t = await agentPanel({ onSettingsUpdated: (fn) => (notify = fn) });
  await t.enter();
  t.folderEnabled = false;
  notify({});
  await new Promise((r) => origSetTimeout(r, 25));
  assert.equal(t.badge.classList.contains('hidden'), true);
  assert.match(t.texts(), /mode Claude berakhir/);
  delete window.AemeathI18n;
});

test('a command waiting for a yes still gets the yes in Claude mode', async () => {
  const sent = [];
  const t = await agentPanel({
    runCommand: async (text) => {
      sent.push(text);
      if (text === '/claude-mode') return { isCommand: true, ok: true, text: 'Mode Claude aktif', mode: 'claude' };
      if (text === '/matikan') return { isCommand: true, ok: true, text: 'Yakin?', awaitConfirm: true };
      return { isCommand: true, ok: true, text: 'dijawab: ' + text };
    },
  });
  await t.say('/claude-mode');
  sent.length = 0;
  await t.say('/matikan');
  await t.say('ya');
  assert.deepEqual(sent, ['/matikan', 'ya'], 'the yes goes to the command, not to Claude');
  delete window.AemeathI18n;
});

test('the folder and session chips appear only in Claude mode', async () => {
  const t = await agentPanel();
  assert.equal(t.bar.classList.contains('hidden'), true, 'plain chat shows no chips even though the module is on');
  assert.equal(t.sessionBar.classList.contains('hidden'), true);
  await t.enter();
  assert.equal(t.bar.classList.contains('hidden'), false);
  assert.equal(t.sessionBar.classList.contains('hidden'), false);
  await t.say('/claude-mode');
  assert.equal(t.bar.classList.contains('hidden'), true);
  assert.equal(t.sessionBar.classList.contains('hidden'), true);
  delete window.AemeathI18n;
});

test('the session chip shows a new session or the current one', async () => {
  const fresh = await agentPanel();
  await fresh.enter();
  assert.equal(fresh.sessionBar.classList.contains('hidden'), false);
  assert.equal(fresh.bar.classList.contains('hidden'), false);
  assert.equal(fresh.sessionName.textContent, 'Sesi baru');
  const current = await agentPanel({ agentSessions: async () => sessionsState({ current: { id: S1, short: 'aaaaaaaa' } }) });
  await current.enter();
  assert.equal(current.sessionName.textContent, 'Sesi aaaaaaaa');
  const off = await agentPanel({ agentSessions: async () => sessionsState({ enabled: false }), agentFolders: async () => foldersState({ enabled: false }) });
  await off.enter();
  assert.equal(off.sessionBar.classList.contains('hidden'), true);
  assert.equal(off.bar.classList.contains('hidden'), true);
  delete window.AemeathI18n;
});

test('the session menu lists the folder sessions and a way to start a new one', async () => {
  const t = await agentPanel({ agentSessions: async () => sessionsState({ current: { id: S2, short: 'bbbbbbbb' } }) });
  await t.enter();
  t.sessionButton.click();
  assert.equal(t.sessionMenu.classList.contains('hidden'), false);
  assert.deepEqual(
    t.sessionMenu.children.map((c) => c.textContent),
    ['1. aaaaaaaa ' + DOT + ' 5 menit lalu', CHECK + ' 2. bbbbbbbb ' + DOT + ' 3 jam lalu', 'Mulai sesi baru']
  );
  assert.equal(t.sessionMenu.children[0].title, S1);
  delete window.AemeathI18n;
});

test('choosing a session sends its id, and "new" starts fresh', async () => {
  const t = await agentPanel();
  await t.enter();
  t.sessionButton.click();
  t.sessionMenu.children[0].click();
  await new Promise((r) => origSetTimeout(r, 25));
  assert.deepEqual(t.sessionCalls, [S1]);
  assert.equal(t.sessionName.textContent, 'Sesi aaaaaaaa');
  assert.match(t.texts(), /Claude melanjutkan sesi aaaaaaaa/);
  assert.equal(t.sessionMenu.classList.contains('hidden'), true);

  t.sessionButton.click();
  t.sessionMenu.children[t.sessionMenu.children.length - 1].click();
  await new Promise((r) => origSetTimeout(r, 25));
  assert.deepEqual(t.sessionCalls, [S1, 'new']);
  assert.equal(t.sessionName.textContent, 'Sesi baru');
  assert.match(t.texts(), /Sesi Claude baru dimulai/);
  delete window.AemeathI18n;
});

test('a refused session and a busy request are explained, not hidden', async () => {
  const refused = await agentPanel();
  await refused.enter();
  refused.refuse = 'session_active';
  refused.sessionButton.click();
  refused.sessionMenu.children[0].click();
  await new Promise((r) => origSetTimeout(r, 25));
  assert.match(refused.texts(), /baru saja dipakai dan mungkin masih terbuka/);

  const busy = await agentPanel({ agentSessions: async () => sessionsState({ busy: true }) });
  await busy.enter();
  busy.sessionButton.click();
  busy.sessionMenu.children[0].click();
  await new Promise((r) => origSetTimeout(r, 25));
  assert.deepEqual(busy.sessionCalls, []);
  assert.match(busy.texts(), /Tunggu permintaan \/claude/);
  delete window.AemeathI18n;
});

test('the session list is refreshed after a Claude request finishes', async () => {
  const t = await agentPanel();
  const before = t.refreshes;
  await t.say('/claude halo');
  assert.ok(t.refreshes > before, 'sessions were read again');
  delete window.AemeathI18n;
});

// --- Session names in the chip and the menu ---

test('the session chip shows the session name, shortened, with the full name in its tooltip', async () => {
  const name = 'Perbaiki bug login di halaman masuk';
  const t = await agentPanel({
    agentSessions: async () => sessionsState({ current: { id: S1, short: 'aaaaaaaa', title: name } }),
  });
  await t.enter();
  assert.equal(t.sessionName.textContent, name.slice(0, 23) + String.fromCharCode(0x2026));
  assert.match(t.sessionButton.title, new RegExp(name + ' \\(aaaaaaaa\\)'));
  delete window.AemeathI18n;
});

test('a short name is shown whole, and a session without a name falls back to its short id', async () => {
  const named = await agentPanel({
    agentSessions: async () => sessionsState({ current: { id: S1, short: 'aaaaaaaa', title: 'Perbaiki bug' } }),
  });
  await named.enter();
  assert.equal(named.sessionName.textContent, 'Perbaiki bug');
  const unnamed = await agentPanel({
    agentSessions: async () => sessionsState({ current: { id: S1, short: 'aaaaaaaa', title: '' } }),
  });
  await unnamed.enter();
  assert.equal(unnamed.sessionName.textContent, 'Sesi aaaaaaaa');
  delete window.AemeathI18n;
});

test('the session menu shows names where there are any, and the id in the tooltip', async () => {
  const t = await agentPanel({
    agentSessions: async () =>
      sessionsState({
        items: [
          { id: S1, short: 'aaaaaaaa', title: 'Perbaiki bug login', age: '5 menit lalu' },
          { id: S2, short: 'bbbbbbbb', title: '', age: '3 jam lalu' },
        ],
      }),
  });
  await t.enter();
  t.sessionButton.click();
  assert.deepEqual(
    t.sessionMenu.children.map((c) => c.textContent),
    ['1. Perbaiki bug login ' + DOT + ' 5 menit lalu', '2. bbbbbbbb ' + DOT + ' 3 jam lalu', 'Mulai sesi baru']
  );
  assert.equal(t.sessionMenu.children[0].title, 'Perbaiki bug login (' + S1 + ')');
  assert.equal(t.sessionMenu.children[1].title, S2);
  delete window.AemeathI18n;
});

test('choosing a named session says which one Claude continues, by name', async () => {
  const t = await agentPanel({
    agentSessionUse: async (which) => ({
      ok: true,
      state: sessionsState({ current: { id: which, short: 'aaaaaaaa', title: 'Perbaiki bug login' } }),
    }),
    agentSessions: async () =>
      sessionsState({ items: [{ id: S1, short: 'aaaaaaaa', title: 'Perbaiki bug login', age: '5 menit lalu' }] }),
  });
  await t.enter();
  t.sessionButton.click();
  t.sessionMenu.children[0].click();
  await new Promise((r) => origSetTimeout(r, 25));
  assert.match(t.texts(), /Claude melanjutkan sesi Perbaiki bug login/);
  delete window.AemeathI18n;
});

// --- Model, effort and permission chips ---

function optionsState(over) {
  return Object.assign(
    {
      enabled: true,
      busy: false,
      model: { choice: '', inUse: '' },
      effort: { choice: '' },
      permission: { choice: 'ask' },
      choices: {
        models: ['fable', 'opus', 'sonnet', 'haiku'],
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        permissions: ['ask', 'plan', 'edit'],
      },
    },
    over || {}
  );
}

async function optionPanel(state, extra) {
  const t = await agentPanel(
    Object.assign(
      {
        agentOptions: async () => t.opts,
        agentOptionSet: async (kind, value) => {
          t.optionCalls.push([kind, value]);
          const next = JSON.parse(JSON.stringify(t.opts));
          if (kind === 'model') next.model.choice = value;
          if (kind === 'effort') next.effort.choice = value;
          if (kind === 'permission') next.permission.choice = value;
          t.opts = next;
          return next;
        },
      },
      extra || {}
    )
  );
  t.optionCalls = [];
  t.opts = state || optionsState();
  await t.enter();
  await t.panel.open();
  const chip = (key) => ({
    bar: t.env.elements.get('chat-opt-' + key),
    button: t.env.elements.get('chat-opt-' + key + '-btn'),
    name: t.env.elements.get('chat-opt-' + key + '-name'),
    menu: t.env.elements.get('chat-opt-' + key + '-menu'),
  });
  t.model = chip('model');
  t.effort = chip('effort');
  t.perm = chip('perm');
  return t;
}

test('the model, effort and permission chips appear only in Claude mode', async () => {
  const t = await agentPanel({ agentOptions: async () => optionsState() });
  for (const key of ['model', 'effort', 'perm']) {
    assert.equal(t.env.elements.get('chat-opt-' + key).classList.contains('hidden'), true, key + ' hidden in plain chat');
  }
  await t.enter();
  for (const key of ['model', 'effort', 'perm']) {
    assert.equal(t.env.elements.get('chat-opt-' + key).classList.contains('hidden'), false, key + ' shown in Claude mode');
  }
  await t.say('/claude-mode');
  for (const key of ['model', 'effort', 'perm']) {
    assert.equal(t.env.elements.get('chat-opt-' + key).classList.contains('hidden'), true, key + ' gone after leaving');
  }
  delete window.AemeathI18n;
});

test('the chips show the defaults: default model and effort, and ask first', async () => {
  const t = await optionPanel();
  assert.equal(t.model.name.textContent, 'Model bawaan');
  assert.equal(t.effort.name.textContent, 'Upaya bawaan');
  assert.equal(t.perm.name.textContent, 'Izin: Tanya dulu');
  assert.match(t.perm.button.title, /Edit berkas menunggu "ya"/);
  delete window.AemeathI18n;
});

test('the model chip shows the model the CLI really runs, or the one chosen', async () => {
  const running = await optionPanel(optionsState({ model: { choice: '', inUse: 'claude-sonnet-5-5' } }));
  assert.equal(running.model.name.textContent, 'sonnet-5-5');
  assert.match(running.model.button.title, /claude-sonnet-5-5/);
  const dated = await optionPanel(optionsState({ model: { choice: '', inUse: 'claude-haiku-4-5-20251001' } }));
  assert.equal(dated.model.name.textContent, 'haiku-4-5');
  const chosen = await optionPanel(optionsState({ model: { choice: 'opus', inUse: 'claude-opus-5-5' } }));
  assert.equal(chosen.model.name.textContent, 'Opus');
  delete window.AemeathI18n;
});

test('the effort and permission chips show what was chosen', async () => {
  const t = await optionPanel(optionsState({ effort: { choice: 'medium' }, permission: { choice: 'edit' } }));
  assert.equal(t.effort.name.textContent, 'Upaya: Sedang');
  assert.equal(t.perm.name.textContent, 'Izin: Edit otomatis');
  assert.match(t.perm.button.title, /tanpa bertanya/);
  delete window.AemeathI18n;
});

test('each menu lists its choices and marks the current one', async () => {
  const t = await optionPanel(optionsState({ model: { choice: 'sonnet', inUse: '' }, permission: { choice: 'plan' } }));
  t.model.button.click();
  assert.deepEqual(t.model.menu.children.map((c) => c.textContent), ['Model bawaan', 'Fable', 'Opus', CHECK + ' Sonnet', 'Haiku']);
  t.effort.button.click();
  assert.deepEqual(t.effort.menu.children.map((c) => c.textContent), [CHECK + ' Upaya bawaan', 'Rendah', 'Sedang', 'Tinggi', 'Sangat tinggi', 'Maksimal']);
  assert.equal(t.model.menu.classList.contains('hidden'), true, 'opening one menu closes the other');
  t.perm.button.click();
  assert.deepEqual(t.perm.menu.children.map((c) => c.textContent), ['Tanya dulu', CHECK + ' Rencana saja', 'Edit otomatis']);
  assert.match(t.perm.menu.children[2].title, /Perintah shell tetap ditolak/);
  delete window.AemeathI18n;
});

test('choosing sends only the kind and the value, and Aemeath says what changed', async () => {
  const t = await optionPanel();
  t.model.button.click();
  t.model.menu.children[2].click();
  await new Promise((r) => origSetTimeout(r, 25));
  assert.deepEqual(t.optionCalls, [['model', 'opus']]);
  assert.equal(t.model.name.textContent, 'Opus');
  assert.match(t.texts(), /Model sekarang: Opus\./);

  t.effort.button.click();
  t.effort.menu.children[3].click();
  await new Promise((r) => origSetTimeout(r, 25));
  assert.deepEqual(t.optionCalls[1], ['effort', 'high']);
  assert.match(t.texts(), /Upaya sekarang: Tinggi\./);

  t.effort.button.click();
  t.effort.menu.children[0].click();
  await new Promise((r) => origSetTimeout(r, 25));
  assert.deepEqual(t.optionCalls[2], ['effort', '']);
  assert.match(t.texts(), /Upaya sekarang: Upaya bawaan\./);
  delete window.AemeathI18n;
});

test('choosing auto edit warns, and the other kinds do not', async () => {
  const t = await optionPanel();
  t.perm.button.click();
  t.perm.menu.children[1].click();
  await new Promise((r) => origSetTimeout(r, 25));
  assert.deepEqual(t.optionCalls, [['permission', 'plan']]);
  assert.match(t.texts(), /Izin sekarang: Rencana saja\./);
  assert.doesNotMatch(t.texts(), /Hati-hati/);

  t.perm.button.click();
  t.perm.menu.children[2].click();
  await new Promise((r) => origSetTimeout(r, 25));
  assert.deepEqual(t.optionCalls[1], ['permission', 'edit']);
  assert.equal(t.perm.name.textContent, 'Izin: Edit otomatis');
  assert.match(t.texts(), /Hati-hati, Rover: Claude sekarang boleh mengedit berkas/);
  delete window.AemeathI18n;
});

test('opening a folder or session menu closes the option menus, and a click elsewhere closes them', async () => {
  const t = await optionPanel();
  t.model.button.click();
  assert.equal(t.model.menu.classList.contains('hidden'), false);
  t.env.elements.get('chat-folder-btn').click();
  assert.equal(t.model.menu.classList.contains('hidden'), true);
  t.perm.button.click();
  t.sessionButton.click();
  assert.equal(t.perm.menu.classList.contains('hidden'), true);
  delete window.AemeathI18n;
});

test('the chips are hidden when the module is off, and the options are read again after a request', async () => {
  const off = await optionPanel(optionsState({ enabled: false }));
  assert.equal(off.model.bar.classList.contains('hidden'), true);
  assert.equal(off.perm.bar.classList.contains('hidden'), true);

  let reads = 0;
  const t = await optionPanel(null, { agentOptions: async () => (reads++, optionsState()) });
  const before = reads;
  await t.say('/claude halo');
  assert.ok(reads > before, 'options were read again');
  delete window.AemeathI18n;
});

// --- The terminal inside Claude mode: "!" lines go to the shell, never to Claude ---

async function shellPanel(handler, extra) {
  const calls = { shell: [], stop: 0 };
  const t = await agentPanel(
    Object.assign(
      {
        agentShell: async (text) => {
          calls.shell.push(text);
          return handler
            ? handler(text, calls)
            : { ok: true, started: calls.shell.length === 1, output: 'hasil ' + text, cwd: 'C:/kerja' };
        },
        agentShellStop: async () => {
          calls.stop++;
          return true;
        },
      },
      extra || {}
    )
  );
  t.calls = calls;
  await t.enter();
  return t;
}

const kinds = (t, kind) => t.log.children.filter((c) => c.classList.contains(kind)).map((c) => c.textContent);

test('a line with a leading ! goes to the shell, and Claude never sees it', async () => {
  const t = await shellPanel();
  await t.say('!git status');
  assert.deepEqual(t.calls.shell, ['git status']);
  assert.deepEqual(t.sent, [], 'nothing was sent as a Claude request or any other command');
  assert.deepEqual(kinds(t, 'term-in'), ['PS > git status']);
  assert.deepEqual(kinds(t, 'term-out'), ['hasil git status']);
  assert.match(t.texts(), /Terminal aktif di C:\/kerja/);
  assert.match(t.texts(), /Claude tidak melihat perintah maupun hasilnya/);
  delete window.AemeathI18n;
});

test('only the first line announces the terminal, and later prompts show the folder', async () => {
  const t = await shellPanel();
  await t.say('!dir');
  await t.say('!Get-Location');
  assert.equal(t.texts().split('Terminal aktif di').length - 1, 1);
  assert.deepEqual(kinds(t, 'term-in'), ['PS > dir', 'PS C:/kerja> Get-Location']);
  assert.deepEqual(t.calls.shell, ['dir', 'Get-Location']);
  delete window.AemeathI18n;
});

test('the spaces after ! are dropped, and the rest of the line is sent as typed', async () => {
  const t = await shellPanel();
  await t.say('!   Write-Output "a !b"  ');
  assert.deepEqual(t.calls.shell, ['Write-Output "a !b"']);
  delete window.AemeathI18n;
});

test('a bare ! explains how it works and calls nothing', async () => {
  const t = await shellPanel();
  await t.say('!');
  await t.say('!   ');
  assert.deepEqual(t.calls.shell, []);
  assert.match(t.texts(), /Tulis perintahnya setelah !/);
  delete window.AemeathI18n;
});

test('plain text still goes to Claude, and a ! in the middle is not the terminal', async () => {
  const t = await shellPanel();
  await t.say('jelaskan !important di CSS');
  assert.deepEqual(t.sent, ['/claude jelaskan !important di CSS']);
  assert.deepEqual(t.calls.shell, []);
  delete window.AemeathI18n;
});

test('there is no ! terminal outside Claude mode: the line is an ordinary chat message', async () => {
  const chatted = [];
  const t = await agentPanel({
    agentShell: async () => assert.fail('the shell must not be called outside Claude mode'),
    chatSend: async (input) => (chatted.push(input), { ok: true, text: 'balasan' }),
  });
  await t.say('!dir');
  assert.deepEqual(chatted, ['!dir'], 'it went to the chat like any other text');
  assert.deepEqual(t.sent, []);
  delete window.AemeathI18n;
});

test('a cancelled dialog and a declined Windows prompt are explained, and the next try asks the main process again', async () => {
  const answers = [{ ok: false, code: 'cancelled' }, { ok: false, code: 'declined' }, { ok: true, started: true, output: '', cwd: 'C:/kerja' }];
  const t = await shellPanel((text, calls) => answers[calls.shell.length - 1]);
  await t.say('!dir');
  assert.match(t.texts(), /Dibatalkan, tidak ada yang dijalankan/);
  await t.say('!dir');
  assert.match(t.texts(), /Izin admin ditolak, jadi terminal tidak dibuka/);
  await t.say('!dir');
  assert.equal(t.calls.shell.length, 3);
  assert.match(t.texts(), /Terminal aktif di C:\/kerja/);
  assert.equal(kinds(t, 'err').length, 2);
  delete window.AemeathI18n;
});

test('while the dialog and the Windows prompt are pending, the box says it is waiting', async () => {
  let release;
  const t = await shellPanel(() => new Promise((resolve) => (release = () => resolve({ ok: true, started: true, output: '', cwd: 'C:/kerja' }))));
  t.input.value = '!dir';
  t.env.elements.get('chat-form').dispatchEvent({ type: 'submit', preventDefault: () => {} });
  await new Promise((r) => origSetTimeout(r, 25));
  const pending = t.log.children.filter((c) => c.classList.contains('pending'));
  assert.equal(pending.length, 1);
  assert.match(pending[0].textContent, /Menunggu persetujuanmu dan izin Windows \(UAC\)/);
  release();
  await new Promise((r) => origSetTimeout(r, 25));
  assert.equal(t.log.children.filter((c) => c.classList.contains('pending')).length, 0, 'the waiting note goes away');
  delete window.AemeathI18n;
});

test('no waiting note once the shell is already open', async () => {
  const t = await shellPanel();
  await t.say('!dir');
  let sawPending = false;
  const original = t.log.appendChild.bind(t.log);
  t.log.appendChild = (child) => {
    if (child.classList.contains('pending')) sawPending = true;
    return original(child);
  };
  await t.say('!dir');
  assert.equal(sawPending, false);
  delete window.AemeathI18n;
});

test('!exit shows that the terminal closed, and the next line starts a new one', async () => {
  const t = await shellPanel((text, calls) =>
    text === 'exit' ? { ok: true, left: true, output: '', cwd: '' } : { ok: true, started: calls.shell.filter((x) => x !== 'exit').length === 1, output: '', cwd: 'C:/kerja' }
  );
  await t.say('!dir');
  await t.say('!exit');
  assert.deepEqual(t.calls.shell, ['dir', 'exit']);
  assert.match(t.texts(), /Terminal ditutup\. Kita tetap di mode Claude/);
  assert.equal(t.badge.classList.contains('hidden'), false, 'still in Claude mode');
  await t.say('!dir');
  assert.deepEqual(kinds(t, 'term-in').slice(-1), ['PS > dir'], 'the folder was forgotten');
  delete window.AemeathI18n;
});

test('a timeout and a dead shell are reported', async () => {
  const t = await shellPanel(() => ({ ok: true, started: false, output: 'sebagian', cwd: 'C:/kerja', timedOut: true, ended: true }));
  await t.say('!sleep 99');
  assert.match(t.texts(), /Perintah dihentikan karena terlalu lama/);
  assert.match(t.texts(), /Terminalnya berhenti/);
  delete window.AemeathI18n;
});

test('every refusal from the main process is shown as text in the active language', async () => {
  const codes = ['disabled', 'terminal_disabled', 'terminal_mode', 'not_active', 'cancelled', 'declined', 'timeout', 'unsupported', 'waiting', 'empty', 'multiline', 'too-long', 'control', 'busy', 'failed', 'brand-new-code'];
  const t = await shellPanel((text) => ({ ok: false, code: text }));
  // the log keeps only the newest messages, so read the answer after every line
  const errors = [];
  for (const code of codes) {
    await t.say('!' + code);
    errors.push(kinds(t, 'err').pop());
  }
  assert.equal(errors.length, codes.length);
  assert.ok(errors.every(Boolean), 'every code produced an error message');
  assert.equal(new Set(errors).size >= 12, true, 'the messages are told apart, not one generic text');
  for (const text of errors) {
    assert.ok(text.length > 5);
    assert.doesNotMatch(text, /^(chat|agent)\.|\{\w+\}/, 'a raw key or placeholder leaked: ' + text);
  }
  assert.equal(errors[errors.length - 1], 'Perintah tidak bisa dijalankan.', 'an unknown code reads as a plain failure');
  delete window.AemeathI18n;
});

test('a failing call to the main process does not break the box', async () => {
  const t = await shellPanel(() => {
    throw new Error('ipc gone');
  });
  await t.say('!dir');
  assert.match(t.texts(), /Perintah tidak bisa dijalankan/);
  await t.say('!dir');
  assert.equal(t.calls.shell.length, 2, 'the box still works');
  delete window.AemeathI18n;
});

test('leaving Claude mode closes the shell', async () => {
  const t = await shellPanel();
  await t.say('!dir');
  const before = t.calls.stop;
  await t.say('/claude-mode');
  assert.ok(t.calls.stop > before, 'the shell was told to stop');
  assert.equal(t.chat.classList.contains('claude'), false);
  delete window.AemeathI18n;
});

test('closing the chat box closes the shell', async () => {
  const t = await shellPanel();
  await t.say('!dir');
  const before = t.calls.stop;
  t.panel.close();
  assert.ok(t.calls.stop > before);
  delete window.AemeathI18n;
});

test('the full terminal mode is not available inside Claude mode, and Rover is pointed to !', async () => {
  const t = await shellPanel();
  t.sent.length = 0;
  await t.say('/change-mode');
  assert.deepEqual(t.sent, [], '/change-mode was not run');
  assert.match(t.texts(), /awali dengan ! untuk memakai terminal/);
  assert.equal(t.chat.classList.contains('terminal'), false);
  assert.equal(t.chat.classList.contains('claude'), true);
  delete window.AemeathI18n;
});

test('/change-mode-search is a different command and still works in Claude mode', async () => {
  const t = await shellPanel();
  t.sent.length = 0;
  await t.say('/change-mode-search');
  assert.deepEqual(t.sent, ['/change-mode-search']);
  delete window.AemeathI18n;
});

test('while a command waits for a yes, a line starting with ! is not sent to the terminal', async () => {
  const sent = [];
  const t = await shellPanel(null, {
    runCommand: async (text) => {
      sent.push(text);
      if (text === '/claude-mode') return { isCommand: true, ok: true, text: 'Mode Claude aktif', mode: 'claude' };
      if (text === '/matikan') return { isCommand: true, ok: true, text: 'Yakin?', awaitConfirm: true };
      return { isCommand: true, ok: true, text: 'dijawab: ' + text };
    },
  });
  await t.say('/matikan');
  await t.say('!dir');
  assert.deepEqual(t.calls.shell, []);
  assert.ok(sent.includes('!dir'), 'the line went to the command that was waiting');
  delete window.AemeathI18n;
});

test('the terminal hint is in the placeholder and the mode message, in both languages', async () => {
  const t = await shellPanel();
  assert.match(t.input.placeholder, /!perintah/);
  const id = require('../src/i18n').createI18n({ locale: 'id-ID' }).t;
  const en = require('../src/i18n').createI18n({ locale: 'en-US' }).t;
  assert.match(id('agent.mode_on', { name: 'x' }), /!perintah untuk terminal/);
  assert.match(en('agent.mode_on', { name: 'x' }), /!command for the terminal/);
  assert.match(en('chat.claude_placeholder'), /!command/);
  assert.ok(id('chat.claude_placeholder').length <= 42, 'short enough to fit the input');
  assert.ok(en('chat.claude_placeholder').length <= 42);
  delete window.AemeathI18n;
});

// --- "stop" works while Claude is working ---

test('in Claude mode "stop" ends a running request, and it is sent as /claude stop', async () => {
  let release;
  const sent = [];
  const t = await agentPanel({
    runCommand: async (text) => {
      sent.push(text);
      if (text === '/claude-mode') return { isCommand: true, ok: true, text: 'Mode Claude aktif', mode: 'claude' };
      if (text === '/claude kerjakan ini') return new Promise((resolve) => (release = () => resolve({ isCommand: true, ok: true, text: '' })));
      return { isCommand: true, ok: true, text: 'Permintaan dihentikan.' };
    },
  });
  await t.say('/claude-mode');
  t.input.value = 'kerjakan ini';
  t.env.elements.get('chat-form').dispatchEvent({ type: 'submit', preventDefault: () => {} });
  await new Promise((r) => origSetTimeout(r, 25));
  t.input.value = 'stop';
  t.env.elements.get('chat-form').dispatchEvent({ type: 'submit', preventDefault: () => {} });
  await new Promise((r) => origSetTimeout(r, 25));
  assert.ok(sent.includes('/claude stop'), 'stop reached the bridge while the request was running');
  assert.match(t.texts(), /Permintaan dihentikan/);
  release();
  delete window.AemeathI18n;
});

test('"stop" is ordinary text outside Claude mode, and /claude stop still works everywhere', async () => {
  let release;
  const sent = [];
  const t = await agentPanel({
    runCommand: async (text) => {
      sent.push(text);
      if (text === '/claude tugas') return new Promise((resolve) => (release = () => resolve({ isCommand: true, ok: true, text: '' })));
      return { isCommand: true, ok: true, text: 'ok' };
    },
  });
  t.input.value = '/claude tugas';
  t.env.elements.get('chat-form').dispatchEvent({ type: 'submit', preventDefault: () => {} });
  await new Promise((r) => origSetTimeout(r, 25));
  t.input.value = 'stop';
  t.env.elements.get('chat-form').dispatchEvent({ type: 'submit', preventDefault: () => {} });
  await new Promise((r) => origSetTimeout(r, 25));
  assert.equal(sent.includes('/claude stop'), false, 'plain stop outside Claude mode does nothing');
  t.input.value = '/claude stop';
  t.env.elements.get('chat-form').dispatchEvent({ type: 'submit', preventDefault: () => {} });
  await new Promise((r) => origSetTimeout(r, 25));
  assert.ok(sent.includes('/claude stop'));
  release();
  delete window.AemeathI18n;
});
