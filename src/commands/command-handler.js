'use strict';

// Turns a chat message that starts with "/" into a command run and Aemeath's
// reply. Handled entirely on this machine: the text never reaches the chat
// model, the search, or the conversation history.

const { RESERVED } = require('./command-store');

// getCommands() -> [{ name, target, args, description }]
// run(command) -> Promise<{ ok, code?, error? }>
// builtins: { [name]: { description, run() -> Promise<{ ok, text, mode? }> } }, for the
// commands Aemeath ships with. Their names are reserved, so a custom command can never
// shadow one.
function createCommandHandler(options) {
  const getCommands = options.getCommands;
  const run = options.run;
  const builtins = options.builtins || {};

  function builtinNote() {
    const names = Object.keys(builtins).map((name) => '/' + name);
    return names.length ? ' Bawaan: ' + names.join(', ') + '.' : '';
  }

  function helpText(commands) {
    if (commands.length === 0) {
      return 'Belum ada perintah kustom, Rover. Tambahkan di Pengaturan, tab Perintah kustom, lalu ketik / diikuti namanya, misalnya /invoice.' + builtinNote();
    }
    const names = commands.map((c) => '/' + c.name).join(', ');
    return 'Perintah yang kuhafal: ' + names + '. Tambah atau ubah di Pengaturan, ya.' + builtinNote();
  }

  // Returns { isCommand: false } for ordinary chat, otherwise { isCommand: true, ok, text }
  // (plus launched: true when something was actually opened).
  async function handle(rawText) {
    const text = String(rawText == null ? '' : rawText).trim();
    const match = /^\/(\S*)(?:\s[\s\S]*)?$/.exec(text);
    if (!match) return { isCommand: false };

    const name = match[1].toLowerCase();
    const commands = getCommands();
    if (Object.prototype.hasOwnProperty.call(builtins, name)) {
      const result = await builtins[name].run();
      return { isCommand: true, ok: result.ok, text: result.text, mode: result.mode, cwd: result.cwd };
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

    const label = command.description || '/' + command.name;
    const result = await run(command);
    if (result.ok) {
      return { isCommand: true, ok: true, launched: true, text: 'Siap, Rover! Membuka ' + label + '~' };
    }
    if (result.code === 'missing') {
      return {
        isCommand: true,
        ok: false,
        text: 'Hmm, aku tidak menemukan tujuan untuk /' + command.name + '. Mungkin sudah dipindah? Cek lagi di Pengaturan.',
      };
    }
    return {
      isCommand: true,
      ok: false,
      text: 'Aduh, /' + command.name + ' gagal dibuka' + (result.error ? ': ' + String(result.error).slice(0, 120) : '.'),
    };
  }

  return { handle: handle };
}

module.exports = { createCommandHandler };
