'use strict';

// Detects the current operating system and Linux distribution (with first-class
// support for Linux Mint / Cinnamon) and provides OS-specific helpers such as
// ~/.config/autostart/aemeath.desktop management on Linux.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AUTOSTART_FILE = 'aemeath.desktop';

function parseOsRelease(text) {
  const out = {};
  if (typeof text !== 'string') return out;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function detectPlatform(options) {
  const opts = options || {};
  const platform = opts.platform || process.platform;
  const env = opts.env || process.env;
  const readFileSync = opts.readFileSync || fs.readFileSync;

  const isWindows = platform === 'win32';
  const isLinux = platform === 'linux';
  const isMac = platform === 'darwin';

  let distroId = '';
  let distroName = isWindows ? 'Windows' : isMac ? 'macOS' : 'Linux';
  let prettyName = distroName;
  let isLinuxMint = false;
  const desktop = String(env.XDG_CURRENT_DESKTOP || env.DESKTOP_SESSION || '').trim();

  if (isLinux) {
    let raw = '';
    for (const candidate of ['/etc/os-release', '/usr/lib/os-release']) {
      try {
        raw = String(readFileSync(candidate, 'utf8'));
        if (raw) break;
      } catch {
        // try next
      }
    }
    const parsed = parseOsRelease(raw);
    distroId = String(parsed.ID || '').toLowerCase();
    const name = String(parsed.NAME || '').trim();
    const pretty = String(parsed.PRETTY_NAME || '').trim();
    if (pretty) prettyName = pretty;
    else if (name) prettyName = name;

    if (
      distroId === 'linuxmint' ||
      /linux\s*mint/i.test(name) ||
      /linux\s*mint/i.test(pretty) ||
      /\b(?:X-)?Cinnamon\b/i.test(desktop)
    ) {
      isLinuxMint = true;
      distroName = 'Linux Mint';
      if (!pretty) prettyName = 'Linux Mint';
    } else if (name) {
      distroName = name;
    }
  }

  return {
    id: platform,
    isWindows: isWindows,
    isLinux: isLinux,
    isLinuxMint: isLinuxMint,
    distroId: distroId,
    distroName: distroName,
    prettyName: prettyName,
    osLabel: isLinuxMint ? 'Linux Mint' : distroName,
    desktop: desktop,
    shellName: isLinux || isMac ? 'Bash' : 'PowerShell',
  };
}

function quoteExecArg(arg) {
  const s = String(arg || '');
  if (!/[\s"'\\]/.test(s)) return s;
  return '"' + s.replace(/(["\\])/g, '\\$1') + '"';
}

function buildDesktopEntry(options) {
  const opts = options || {};
  const execPath = opts.execPath || process.execPath;
  const args = Array.isArray(opts.args) ? opts.args : [];
  const execLine = [quoteExecArg(execPath)].concat(args.map(quoteExecArg)).join(' ');
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=Aemeath',
    'Comment=Aemeath desktop companion',
    'Exec=' + execLine,
    'Terminal=false',
    'StartupNotify=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

function autostartPath(homeDir, env) {
  const e = env || process.env;
  const configBase = e.XDG_CONFIG_HOME || path.join(homeDir || os.homedir(), '.config');
  return path.join(configBase, 'autostart', AUTOSTART_FILE);
}

function applyLinuxStartup(options) {
  const opts = options || {};
  const fsImpl = opts.fs || fs;
  const file = autostartPath(opts.homeDir, opts.env);
  if (!opts.enabled) {
    try {
      if (fsImpl.existsSync(file)) fsImpl.unlinkSync(file);
    } catch {
      // ignore
    }
    return false;
  }
  const args = opts.isPackaged ? [] : opts.appPath ? [opts.appPath] : [];
  const content = buildDesktopEntry({ execPath: opts.execPath, args: args });
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  fsImpl.writeFileSync(file, content, 'utf8');
  return true;
}

function getLinuxStartupStatus(options) {
  const opts = options || {};
  const fsImpl = opts.fs || fs;
  const wanted = opts.wanted !== false;
  const file = autostartPath(opts.homeDir, opts.env);
  try {
    if (!fsImpl.existsSync(file)) {
      return { wanted: wanted, registered: false, willLaunch: false };
    }
    const text = String(fsImpl.readFileSync(file, 'utf8'));
    const disabled = /^\s*(?:Hidden|X-GNOME-Autostart-enabled)\s*=\s*(?:true|false)\s*$/im;
    const isHidden = /^\s*Hidden\s*=\s*true\s*$/im.test(text);
    const isGnomeDisabled = /^\s*X-GNOME-Autostart-enabled\s*=\s*false\s*$/im.test(text);
    void disabled;
    return {
      wanted: wanted,
      registered: true,
      willLaunch: !isHidden && !isGnomeDisabled,
    };
  } catch {
    return { wanted: wanted, registered: false, willLaunch: false };
  }
}

module.exports = {
  parseOsRelease,
  detectPlatform,
  buildDesktopEntry,
  autostartPath,
  applyLinuxStartup,
  getLinuxStartupStatus,
};
