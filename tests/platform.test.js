'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseOsRelease,
  detectPlatform,
  applyLinuxStartup,
  getLinuxStartupStatus,
} = require('../src/platform');
const { normalizeCommands } = require('../src/commands/command-store');
const { createCommandRunner, expandEnv } = require('../src/commands/command-runner');
const { createUacGate } = require('../src/terminal/uac-gate');
const { createTerminalSession } = require('../src/terminal/terminal-session');
const { classify } = require('../src/activity/classifier');
const { createActivityWatcher } = require('../src/activity/activity-watcher');
const { createMediaWatcher } = require('../src/media-watcher');

test('detectPlatform identifies Linux Mint and Cinnamon desktop from /etc/os-release', () => {
  const mintRelease = [
    'NAME="Linux Mint"',
    'VERSION="22 (Wilma)"',
    'ID=linuxmint',
    'ID_LIKE="ubuntu debian"',
    'PRETTY_NAME="Linux Mint 22"',
  ].join('\n');

  const mint = detectPlatform({
    platform: 'linux',
    env: { XDG_CURRENT_DESKTOP: 'X-Cinnamon' },
    readFileSync: () => mintRelease,
  });

  assert.equal(mint.isLinux, true);
  assert.equal(mint.isWindows, false);
  assert.equal(mint.isLinuxMint, true);
  assert.equal(mint.osLabel, 'Linux Mint');
  assert.equal(mint.shellName, 'Bash');
  assert.equal(mint.desktop, 'X-Cinnamon');

  const win = detectPlatform({
    platform: 'win32',
    env: {},
    readFileSync: () => {
      throw new Error('no /etc/os-release');
    },
  });
  assert.equal(win.isWindows, true);
  assert.equal(win.isLinux, false);
  assert.equal(win.isLinuxMint, false);
  assert.equal(win.osLabel, 'Windows');
  assert.equal(win.shellName, 'PowerShell');
  assert.deepEqual(parseOsRelease(mintRelease).ID, 'linuxmint');
});

test('Linux autostart creates, reads, and removes ~/.config/autostart/aemeath.desktop', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-linux-home-'));
  assert.deepEqual(getLinuxStartupStatus({ homeDir, env: {}, wanted: true }), {
    wanted: true,
    registered: false,
    willLaunch: false,
  });

  applyLinuxStartup({
    enabled: true,
    homeDir,
    env: {},
    execPath: '/usr/bin/electron',
    appPath: '/home/rover/aemeth-ai-agent',
    isPackaged: false,
  });

  const desktopFile = path.join(homeDir, '.config', 'autostart', 'aemeath.desktop');
  assert.equal(fs.existsSync(desktopFile), true);
  const content = fs.readFileSync(desktopFile, 'utf8');
  assert.match(content, /Exec=\/usr\/bin\/electron \/home\/rover\/aemeth-ai-agent/);
  assert.deepEqual(getLinuxStartupStatus({ homeDir, env: {}, wanted: true }), {
    wanted: true,
    registered: true,
    willLaunch: true,
  });

  applyLinuxStartup({ enabled: false, homeDir, env: {} });
  assert.equal(fs.existsSync(desktopFile), false);
});

test('custom commands accept Linux paths, ~, $HOME, and enforce Linux elevation and risky rules', () => {
  const { commands, errors } = normalizeCommands([
    { name: 'gimp', target: '/usr/bin/gimp', args: '--no-splash', description: 'buka GIMP' },
    { name: 'dokumen', target: '~/Documents/Kerja', description: 'folder kerja' },
    { name: 'skrip', target: '$HOME/bin/start', description: 'skrip lokal' },
    {
      name: 'proses',
      type: 'powershell',
      script: 'ps -eo comm,%cpu,%mem --sort=-%cpu | head -n 6',
      confirm: false,
    },
    {
      name: 'matikan',
      type: 'powershell',
      script: 'shutdown -h +1 "Aemeath"',
      confirm: false, // risky command must force confirm: true
    },
  ]);

  assert.deepEqual(errors, []);
  assert.equal(commands.length, 5);
  assert.equal(commands[0].target, '/usr/bin/gimp');
  assert.equal(commands[0].args, '--no-splash');
  assert.equal(commands[1].target, '~/Documents/Kerja');
  assert.equal(commands[2].target, '$HOME/bin/start');
  assert.equal(commands[3].type, 'powershell');
  assert.equal(commands[3].confirm, false);
  assert.equal(commands[4].confirm, true, 'shutdown on Linux forces confirmation');

  // Elevation commands on Linux are rejected
  for (const bad of ['sudo apt update', 'pkexec rm /tmp/x', 'doas reboot']) {
    const res = normalizeCommands([{ name: 'rootcmd', type: 'powershell', script: bad }]);
    assert.equal(res.commands.length, 0, bad);
    assert.match(res.errors[0].message, /hak admin/);
  }
});

test('expandEnv expands ~, $VAR, and ${VAR} for Linux paths alongside %VAR%', () => {
  const env = { HOME: '/home/rover', WORK: '/srv/work' };
  assert.equal(expandEnv('~/Documents/catatan.txt', env), '/home/rover/Documents/catatan.txt');
  assert.equal(expandEnv('$HOME/bin/app', env), '/home/rover/bin/app');
  assert.equal(expandEnv('${WORK}/project', env), '/srv/work/project');
  assert.equal(expandEnv('$UNKNOWN/path', env), '$UNKNOWN/path');
});

test('commandRunner on Linux runs bash scripts and spawns Linux binaries with arguments directly', async () => {
  const calls = [];
  const spawn = (file, args, options) => {
    calls.push({ file, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.unref = () => {};
    process.nextTick(() => {
      if (file === 'bash') {
        child.stdout.emit('data', 'linux-mint-ok\n');
        child.emit('close', 0);
      } else {
        child.emit('spawn');
      }
    });
    return child;
  };

  const runner = createCommandRunner({
    platform: 'linux',
    shell: { openPath: async () => '', openExternal: async () => {} },
    spawn,
    exists: () => true,
    env: { HOME: '/home/rover' },
  });

  const binRes = await runner.run({
    name: 'gimp',
    type: 'open',
    target: '~/bin/gimp',
    args: '--new-instance "berkas gambar.png"',
  });
  assert.deepEqual(binRes, { ok: true });
  assert.equal(calls[0].file, '/home/rover/bin/gimp');
  assert.deepEqual(calls[0].args, ['--new-instance', 'berkas gambar.png']);
  assert.equal(calls[0].options.shell, false);

  const shRes = await runner.run({
    name: 'proses',
    type: 'powershell',
    script: 'ps -eo comm,%cpu --sort=-%cpu | head -n 6',
  });
  assert.equal(shRes.ok, true);
  assert.equal(shRes.output, 'linux-mint-ok');
  assert.equal(calls[1].file, 'bash');
  assert.deepEqual(calls[1].args, [
    '--noprofile',
    '--norc',
    '-c',
    'ps -eo comm,%cpu --sort=-%cpu | head -n 6',
  ]);
});

test('Linux Polkit gate and Bash terminal session use pkexec and bash', async () => {
  const gateCalls = [];
  const gate = createUacGate({
    platform: 'linux',
    polkit: true,
    spawn: (file, args, options) => {
      gateCalls.push({ file, args, options });
      const child = new EventEmitter();
      process.nextTick(() => child.emit('exit', 0));
      return child;
    },
  });
  assert.deepEqual(await gate.request(), { granted: true });
  assert.equal(gateCalls[0].file, 'pkexec');
  assert.deepEqual(gateCalls[0].args, ['/bin/true']);

  const sessionCalls = [];
  const session = createTerminalSession({
    platform: 'linux',
    cwd: '/home/rover',
    spawn: (file, args) => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdout.setEncoding = () => {};
      child.stderr.setEncoding = () => {};
      child.stdin = new EventEmitter();
      child.stdin.write = (line) => {
        sessionCalls.push({ file, args, line });
        const match = /printf "(AEM[a-f0-9]+)\|/.exec(line);
        if (match) {
          process.nextTick(() => {
            child.stdout.emit('data', 'halo linux mint\n' + match[1] + '|/home/rover/Documents|\n');
          });
        }
      };
      return child;
    },
  });

  session.start();
  const out = await session.run('echo "halo linux mint"');
  assert.equal(out.output, 'halo linux mint');
  assert.equal(out.cwd, '/home/rover/Documents');
  assert.equal(sessionCalls[0].file, 'bash');
  assert.deepEqual(sessionCalls[0].args, ['--noprofile', '--norc']);
});

test('Linux classifier and watchers recognise Linux Mint apps, screensaver, and MPRIS media', () => {
  assert.equal(classify({ process: 'cinnamon-screensaver', title: '' }).category, 'ignored');
  assert.equal(classify({ process: 'firefox-esr', title: 'YouTube - Mozilla Firefox' }).category, 'video');
  assert.equal(classify({ process: 'gnome-terminal-server', title: 'rover@mint: ~/code' }).category, 'coding');
  assert.equal(classify({ process: 'xed', title: 'catatan.txt' }).category, 'work');
  assert.equal(classify({ process: 'rhythmbox', title: 'Lagu' }).category, 'media');
  assert.equal(
    classify({
      process: 'game.x86_64',
      path: '/home/rover/.local/share/Steam/steamapps/common/Hollow Knight/hollow_knight.x86_64',
      title: 'Hollow Knight',
    }).game,
    'Hollow Knight',
  );

  const samples = [];
  const aw = createActivityWatcher({
    platform: 'linux',
    onSample: (s) => samples.push(s),
    spawn: (file, args) => {
      assert.equal(file, 'bash');
      assert.equal(args[0], '--noprofile');
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stdout.setEncoding = () => {};
      child.kill = () => {};
      process.nextTick(() => {
        child.stdout.emit('data', '{"process":"code","path":"/usr/share/code/code","title":"main.js"}\n');
      });
      return child;
    },
  });
  aw.start();
  aw.stop();

  const statuses = [];
  const mw = createMediaWatcher({
    platform: 'linux',
    onStatus: (s) => statuses.push(s),
    spawn: (file) => {
      assert.equal(file, 'bash');
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stdout.setEncoding = () => {};
      child.kill = () => {};
      process.nextTick(() => {
        child.stdout.emit('data', '[{"status":"Playing","title":"Saving Light","artist":"Aemeath","app":"rhythmbox"}]\n');
      });
      return child;
    },
  });
  mw.start();
  mw.stop();
});
