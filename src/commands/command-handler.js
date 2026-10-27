'use strict';

// Turns a chat message that starts with "/" into a command run and Aemeath's
// reply. Handled entirely on this machine: the text never reaches the chat
// model, the search, or the conversation history.
//
// PowerShell commands that can do damage (shutting down, deleting, downloading
// and running code) wait for a typed "ya" first, and so do all others unless
// their owner switched that off.

const { RESERVED, isRisky } = require('./command-store');

const CONFIRM_MS = 30000;
const YES = /^(ya|y|yes|ok|oke|lanjut|gas)$/i;
const MAX_REPLY_OUTPUT = 1500;

// getCommands() -> [{ name, type, target, args, script, description, confirm }]
// run(command) -> Promise<{ ok, code?, error?, output?, exitCode? }>
// builtins: { [name]: { description, run() -> Promise<{ ok, text, mode? }> } }, for the
// commands Aemeath ships with. Their names are reserved, so a custom command can never
// shadow one.
function createCommandHandler(options) {
  const getCommands = options.getCommands;
  const run = options.run;
  const builtins = options.builtins || {};
  const now = options.now || Date.now;

  let pending = null; // { name, until }: a command waiting for Rover to say yes

  function builtinNote() {
    const names = Object.keys(builtins).map((name) => '/' + name);
    return names.length ? ' Bawaan: ' + names.join(', ') + '.' : '';
  }

  function helpText(commands) {
    if (commands.length === 0) {
      return 'Belum ada perintah kustom, Rover. Tambahkan di Pengaturan, tab Perintah, lalu ketik / diikuti namanya, misalnya /invoice.' + builtinNote();
    }
    const names = commands.map((c) => '/' + c.name).join(', ');
    return 'Perintah yang kuhafal: ' + names + '. Tambah atau ubah di Pengaturan, ya.' + builtinNote();
  }

  function labelOf(command) {
    return command.description || '/' + command.name;
  }

  function trimOutput(output) {
    const text = String(output || '').trim();
    return text.length > MAX_REPLY_OUTPUT ? text.slice(0, MAX_REPLY_OUTPUT) + '\n[dipotong]' : text;
  }

  async function execute(command) {
    const label = labelOf(command);
    const result = await run(command);
    const base = { isCommand: true, output: trimOutput(result.output) };

    if (result.ok) {
      const verb = command.type === 'powershell' ? 'Menjalankan ' : 'Membuka ';
      return Object.assign(base, { ok: true, launched: true, text: 'Siap, Rover! ' + verb + label + '~' });
    }
    if (result.code === 'missing') {
      return Object.assign(base, {
        ok: false,
        text: 'Hmm, aku tidak menemukan tujuan untuk /' + command.name + '. Mungkin sudah dipindah? Cek lagi di Pengaturan.',
      });
    }
    if (result.code === 'timeout') {
      return Object.assign(base, { ok: false, text: '/' + command.name + ' kuhentikan karena lebih dari 30 detik tidak selesai.' });
    }
    if (result.code === 'exit') {
      return Object.assign(base, { ok: false, text: '/' + command.name + ' selesai dengan galat (kode ' + result.exitCode + ').' });
    }
    return Object.assign(base, {
      ok: false,
      text: 'Aduh, /' + command.name + ' gagal dibuka' + (result.error ? ': ' + String(result.error).slice(0, 120) : '.'),
    });
  }

  // Returns a reply, or null when the text is not an answer and should be handled as usual.
  async function answerPending(text) {
    const waiting = pending;
    pending = null;
    const expired = now() > waiting.until;
    if (!YES.test(text)) {
      // a new /command replaces the question, and a stale question never swallows ordinary text
      if (expired || text.startsWith('/')) return null;
      return { isCommand: true, ok: false, text: 'Oke, /' + waiting.name + ' dibatalkan.' };
    }
    if (expired) {
      return { isCommand: true, ok: false, text: 'Waktu konfirmasinya habis, jadi /' + waiting.name + ' tidak kujalankan. Ketik lagi kalau memang mau.' };
    }
    // look it up again: the definition may have changed while we waited
    const command = getCommands().find((c) => c.name === waiting.name);
    if (!command) return { isCommand: true, ok: false, text: 'Perintahnya sudah tidak ada, Rover.' };
    return execute(command);
  }

  // Returns { isCommand: false } for ordinary chat, otherwise { isCommand: true, ok, text }
  // (plus launched: true when something was run, output for what a PowerShell command printed,
  // and awaitConfirm: true when it is waiting for a yes).
  async function handle(rawText) {
    const text = String(rawText == null ? '' : rawText).trim();
    if (pending) {
      const answered = await answerPending(text);
      if (answered) return answered;
    }

    const match = /^\/(\S*)(?:\s+([\s\S]*))?$/.exec(text);
    if (!match) return { isCommand: false };

    const name = match[1].toLowerCase();
    const arg = (match[2] || '').trim();
    const commands = getCommands();
    if (Object.prototype.hasOwnProperty.call(builtins, name)) {
      const result = await builtins[name].run(arg, text);
      const out = { isCommand: true, ok: result.ok, text: result.text, mode: result.mode, cwd: result.cwd };
      if (result.output) out.output = trimOutput(result.output);
      return out;
    }
    if (name === '' || RESERVED.has(name)) {
      return { isCommand: true, ok: true, text: helpText(commands) };
    }

    const command = commands.find((c) => c.name === name);
    if (!command) {
      return {
        isCommand: true,
        ok: false,
        text: 'Perintah /' + name.slice(0, 24) + ' belum ada, Rover. Ketik / untuk melihat daftar, atau tambahkan di Pengaturan.',
      };
    }

    if (command.type === 'powershell' && (command.confirm || isRisky(command.script))) {
      pending = { name: command.name, until: now() + CONFIRM_MS };
      return {
        isCommand: true,
        ok: true,
        awaitConfirm: true,
        text: 'Yakin mau menjalankan ' + labelOf(command) + '? Ketik "ya" dalam 30 detik untuk lanjut, atau yang lain untuk membatalkan.',
      };
    }
    return execute(command);
  }

  return { handle: handle };
}

module.exports = { createCommandHandler, CONFIRM_MS };
