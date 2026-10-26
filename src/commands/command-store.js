'use strict';

// Custom slash commands that open programs, folders or links. They live in
// their own file in the app data folder, away from the project and from the
// settings object the overlay window receives, and only the settings window may
// change them. Every entry is validated here so the runner can trust what it gets.

const fs = require('node:fs');
const path = require('node:path');

const FILE_NAME = 'commands.json';
const MAX_COMMANDS = 30;
const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const URL_PATTERN = /^https?:\/\/\S+$/i;
const ENV_PREFIX = /^%[A-Za-z0-9_]+%/;
const RESERVED = new Set(['help', 'bantuan']);
const MAX_TARGET = 500;
const MAX_ARGS = 300;
const MAX_DESCRIPTION = 60;

function isUrl(target) {
  return URL_PATTERN.test(target);
}

// Returns { commands, errors }. `errors` lists the rejected entries by index
// with a message the settings window can show next to the row.
function normalizeCommands(list) {
  const commands = [];
  const errors = [];
  const seen = new Set();
  const items = Array.isArray(list) ? list.slice(0, MAX_COMMANDS) : [];

  items.forEach((item, index) => {
    const fail = (message) => errors.push({ index: index, message: message });
    const source = item && typeof item === 'object' ? item : {};
    const name = String(source.name == null ? '' : source.name).trim().replace(/^\/+/, '').toLowerCase();
    const target = String(source.target == null ? '' : source.target).trim();
    const args = String(source.args == null ? '' : source.args).trim();
    const description = String(source.description == null ? '' : source.description).trim();

    if (!NAME_PATTERN.test(name)) {
      return fail('Nama hanya boleh huruf kecil, angka, - dan _ (maksimal 24 karakter).');
    }
    if (RESERVED.has(name)) return fail('Nama "' + name + '" sudah dipakai Aemeath.');
    if (seen.has(name)) return fail('Nama "' + name + '" dipakai dua kali.');
    if (!target) return fail('Isi program, folder, atau tautan yang mau dibuka.');
    if (target.length > MAX_TARGET) return fail('Jalur terlalu panjang.');
    if (!isUrl(target) && !ENV_PREFIX.test(target) && !path.isAbsolute(target)) {
      return fail('Tulis jalur lengkap (mis. C:\\Program Files\\...) atau tautan http/https.');
    }
    if (/[\u0000-\u001f]/.test(target + args)) return fail('Ada karakter yang tidak diizinkan.');
    if (args.length > MAX_ARGS) return fail('Argumen terlalu panjang.');

    seen.add(name);
    commands.push({
      name: name,
      target: target,
      args: isUrl(target) ? '' : args,
      description: description.slice(0, MAX_DESCRIPTION),
    });
  });
  return { commands, errors };
}

function createCommandStore(options) {
  const file = path.join(options.dir, FILE_NAME);
  let commands = [];

  try {
    commands = normalizeCommands(JSON.parse(fs.readFileSync(file, 'utf8'))).commands;
  } catch {
    commands = [];
  }

  // Saves the valid entries and reports the rejected ones.
  function save(list) {
    const result = normalizeCommands(list);
    commands = result.commands;
    try {
      fs.mkdirSync(options.dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(commands, null, 2));
    } catch {
      // best effort: the commands stay available for this run
    }
    return { saved: commands, errors: result.errors };
  }

  return { list: () => commands.slice(), save: save };
}

module.exports = { createCommandStore, normalizeCommands, isUrl, MAX_COMMANDS, FILE_NAME, RESERVED };
