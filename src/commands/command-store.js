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
const ENV_PREFIX = /^(?:%[A-Za-z0-9_]+%|~(?:[\\/]|$)|\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})(?:[\\/]|$))/;
// Names that belong to Aemeath: the help words and the built-in commands.
const BUILTIN_NAMES = ['change-mode', 'change-mode-search', 'search', 'timer', 'todo', 'note', 'stats', 'review'];
const RESERVED = new Set(['help', 'bantuan'].concat(BUILTIN_NAMES));
const MAX_TARGET = 500;
const MAX_ARGS = 300;
const MAX_DESCRIPTION = 60;
const MAX_SCRIPT = 500;
const MAX_WORKFLOW_TARGETS = 6;
const TYPES = ['open', 'powershell', 'workflow'];

// A PowerShell or Bash command always asks first when it can end the session, delete or
// format things, change accounts or boot settings, or download and run code.
const RISKY = new RegExp(
  '\\b(shutdown|restart-computer|stop-computer|logoff|reboot|poweroff|halt|format(?![-\\w])|format-volume|' +
    'diskpart|clear-disk|mkfs(?:\\.[a-z0-9]+)?|fdisk|parted|wipefs|dd|shred|unlink|remove-item|' +
    'rm|del|erase|rd|rmdir|cipher|bcdedit|reg\\s+delete|remove-itemproperty|net\\s+user|net1|set-executionpolicy|' +
    'invoke-expression|iex|downloadstring|downloadfile|invoke-webrequest|iwr|curl|wget|start-bitstransfer|' +
    'taskkill|stop-process|kill|pkill|killall|sc\\s+(stop|delete)|stop-service|set-service|systemctl\\s+(stop|disable|mask|poweroff|reboot)|' +
    'ufw|iptables|chmod|chown|apt|apt-get|dpkg|disable-|uninstall-|msiexec)\\b',
  'i',
);
// The terminal never runs elevated, so a command may not ask for it either.
const ELEVATION = /\brunas\b|\bsudo\b|\bgksudo\b|\bpkexec\b|\bdoas\b|\bsu\s+-|-verb\b/i;

function isUrl(target) {
  return URL_PATTERN.test(target);
}

function isAbsoluteTarget(target) {
  if (/^[A-Za-z]{2,}[A-Za-z0-9+.-]*:/.test(target)) return false;
  return path.isAbsolute(target) || path.win32.isAbsolute(target) || path.posix.isAbsolute(target);
}

function isRisky(script) {
  return RISKY.test(String(script == null ? '' : script));
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
    const type = String(source.type == null || source.type === '' ? 'open' : source.type).toLowerCase();
    const script = String(source.script == null ? '' : source.script).trim();

    if (!NAME_PATTERN.test(name)) {
      return fail('Nama hanya boleh huruf kecil, angka, - dan _ (maksimal 24 karakter).');
    }
    if (RESERVED.has(name)) return fail('Nama "' + name + '" sudah dipakai perintah bawaan Aemeath.');
    if (seen.has(name)) return fail('Nama "' + name + '" dipakai dua kali.');
    if (!TYPES.includes(type)) return fail('Jenis perintah tidak dikenal.');

    if (type === 'powershell') {
      if (!script) return fail('Isi perintah PowerShell yang mau dijalankan.');
      if (script.length > MAX_SCRIPT) return fail('Perintah PowerShell terlalu panjang (maksimal ' + MAX_SCRIPT + ' karakter).');
      if (/[\u0000-\u001f]/.test(script)) return fail('Tulis perintahnya dalam satu baris.');
      if (ELEVATION.test(script)) {
        return fail('Perintah tidak boleh meminta hak admin. Aemeath menjalankannya sebagai kamu, bukan admin.');
      }
      seen.add(name);
      commands.push({
        name: name,
        type: 'powershell',
        target: '',
        args: '',
        script: script,
        description: description.slice(0, MAX_DESCRIPTION),
        // Asking first is the default; risky scripts cannot opt out.
        confirm: source.confirm !== false || isRisky(script),
      });
      return undefined;
    }

    if (type === 'workflow') {
      const rawTargets = Array.isArray(source.targets)
        ? source.targets
        : String(source.target == null ? '' : source.target).split(/\r?\n/);
      const targets = rawTargets.map((t) => String(t == null ? '' : t).trim()).filter(Boolean);
      if (targets.length < 2) {
        return fail('Isi minimal 2 program, folder, atau tautan untuk paket kerja.');
      }
      if (targets.length > MAX_WORKFLOW_TARGETS) {
        return fail('Maksimal ' + MAX_WORKFLOW_TARGETS + ' tujuan dalam satu paket kerja.');
      }
      for (const t of targets) {
        if (t.length > MAX_TARGET) return fail('Jalur terlalu panjang.');
        if (!isUrl(t) && !ENV_PREFIX.test(t) && !isAbsoluteTarget(t)) {
          return fail('Tulis jalur lengkap (mis. C:\\Program Files\\... atau /usr/bin/...) atau tautan http/https.');
        }
        if (/[\u0000-\u001f]/.test(t)) return fail('Ada karakter yang tidak diizinkan.');
      }
      seen.add(name);
      commands.push({
        name: name,
        type: 'workflow',
        target: '',
        args: '',
        script: '',
        targets: targets,
        description: description.slice(0, MAX_DESCRIPTION),
        confirm: false,
      });
      return undefined;
    }

    if (!target) return fail('Isi program, folder, atau tautan yang mau dibuka.');
    if (target.length > MAX_TARGET) return fail('Jalur terlalu panjang.');
    if (!isUrl(target) && !ENV_PREFIX.test(target) && !isAbsoluteTarget(target)) {
      return fail('Tulis jalur lengkap (mis. C:\\Program Files\\... atau /usr/bin/...) atau tautan http/https.');
    }
    if (/[\u0000-\u001f]/.test(target + args)) return fail('Ada karakter yang tidak diizinkan.');
    if (args.length > MAX_ARGS) return fail('Argumen terlalu panjang.');

    seen.add(name);
    commands.push({
      name: name,
      type: 'open',
      target: target,
      args: isUrl(target) ? '' : args,
      script: '',
      description: description.slice(0, MAX_DESCRIPTION),
      confirm: false,
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

module.exports = {
  createCommandStore,
  normalizeCommands,
  isUrl,
  isRisky,
  MAX_SCRIPT,
  MAX_COMMANDS,
  MAX_WORKFLOW_TARGETS,
  FILE_NAME,
  RESERVED,
  BUILTIN_NAMES,
};
