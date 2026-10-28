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
  ];

  ids.forEach((id) => {
    const tag = id.includes('input') ? 'input' : id.includes('button') || id.includes('attach') || id.includes('send') || id.includes('size') || id.includes('reset') || id.includes('close') || id.includes('settings') ? 'button' : 'div';
    const el = new FakeElement(tag, id);
    if (id === 'chat-attachments' || id === 'chat-attachments-disclosure' || id === 'chat-suggest' || id === 'chat-notice' || id === 'chat' || id === 'chat-mode') {
      el.className = 'hidden';
    }
    elements.set(id, el);
  });

  const fakeDocument = {
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
