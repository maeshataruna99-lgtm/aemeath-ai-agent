'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createTerminalController } = require('../src/terminal/terminal-controller');
const { checkLine, MAX_INPUT } = require('../src/terminal/terminal-session');
const { createShellBridge } = require('../src/agent/shell-bridge');
const { createI18n } = require('../src/i18n');

// ---- a controller with a fake gate and a fake shell, and a record of what happened -----------------

function rig(options) {
  const o = options || {};
  const events = [];
  const state = {
    claudeOn: o.claudeOn !== false,
    terminalOn: o.terminalOn !== false,
    answer: o.answer !== false,
    gate: o.gate || { granted: true },
  };
  const sessions = [];
  const controller = createTerminalController({
    gate: {
      request: async () => {
        events.push('gate');
        return typeof state.gate === 'function' ? state.gate() : state.gate;
      },
    },
    createSession: () => {
      const session = {
        stopped: false,
        lines: [],
        cwd: 'C:/kerja',
        start() {
          events.push('start');
        },
        async run(line) {
          events.push('run');
          session.lines.push(line);
          if (session.fail) throw new Error(session.fail);
          return { output: 'hasil: ' + line, cwd: 'C:/kerja', timedOut: false, ended: Boolean(session.dies) };
        },
        stop() {
          session.stopped = true;
          events.push('stop');
        },
      };
      sessions.push(session);
      return session;
    },
    isEnabled: () => state.terminalOn,
    setTimer: () => ({ unref() {} }),
    clearTimer: () => {},
  });
  const asked = [];
  const bridge = createShellBridge({
    terminal: controller,
    isEnabled: () => state.claudeOn,
    confirm: async (line) => {
      events.push('confirm');
      asked.push(line);
      if (o.confirmThrows) throw new Error('dialog broke');
      if (o.onConfirm) o.onConfirm(state);
      return state.answer;
    },
  });
  return { bridge, controller, events, asked, state, sessions };
}

// ---- the line check ------------------------------------------------------------------------------------

test('checkLine says why a line cannot be sent, without needing a session', () => {
  assert.equal(checkLine('Get-ChildItem'), '');
  assert.equal(checkLine('  dir  '), '');
  assert.equal(checkLine(''), 'empty');
  assert.equal(checkLine('   '), 'empty');
  assert.equal(checkLine(undefined), 'empty');
  assert.equal(checkLine('a\nb'), 'multiline');
  assert.equal(checkLine('a\r\nb'), 'multiline');
  assert.equal(checkLine('x'.repeat(MAX_INPUT + 1)), 'too-long');
  assert.equal(checkLine('x'.repeat(MAX_INPUT)), '');
  assert.equal(checkLine('a\u0007b'), 'control');
});

// ---- controller.begin() --------------------------------------------------------------------------------

test('begin asks the gate once, starts the shell, and keeps it for the next call', async () => {
  const r = rig();
  const first = await r.controller.begin();
  assert.deepEqual(first, { ok: true, cwd: 'C:/kerja' });
  assert.equal(r.controller.active, true);
  const second = await r.controller.begin();
  assert.equal(second.ok, true);
  assert.deepEqual(r.events, ['gate', 'start'], 'the second call asked nothing and started nothing');
});

test('begin reports why it could not start, and starts nothing', async () => {
  for (const reason of ['declined', 'timeout', 'unsupported', 'error']) {
    const r = rig({ gate: { granted: false, reason } });
    assert.deepEqual(await r.controller.begin(), { ok: false, reason });
    assert.equal(r.controller.active, false);
    assert.equal(r.sessions.length, 0);
  }
  const off = rig({ terminalOn: false });
  assert.deepEqual(await off.controller.begin(), { ok: false, reason: 'terminal_disabled' });
  assert.deepEqual(off.events, [], 'the gate is not even asked when terminal mode is off');
});

test('begin refuses a second request while the first still waits for Windows', async () => {
  let release;
  const r = rig({
    gate: () => new Promise((resolve) => (release = () => resolve({ granted: true }))),
  });
  const pending = r.controller.begin();
  assert.deepEqual(await r.controller.begin(), { ok: false, reason: 'waiting' });
  release();
  assert.equal((await pending).ok, true);
});

test('changeMode still gives the same texts after the refactor', async () => {
  const off = rig({ terminalOn: false });
  assert.deepEqual(await off.controller.changeMode(), {
    ok: false,
    mode: 'chat',
    text: 'Mode terminal dimatikan di Pengaturan, jadi aku tetap di mode obrolan.',
  });
  const declined = rig({ gate: { granted: false, reason: 'declined' } });
  assert.equal((await declined.controller.changeMode()).text, 'Izin admin ditolak, jadi aku tetap di mode obrolan.');
  const odd = rig({ gate: { granted: false, reason: 'error' } });
  assert.equal((await odd.controller.changeMode()).text, 'Izin admin tidak bisa diminta, jadi aku tetap di mode obrolan.');
  const ok = rig();
  const on = await ok.controller.changeMode();
  assert.equal(on.mode, 'terminal');
  assert.equal(on.cwd, 'C:/kerja');
  assert.match(on.text, /Mode terminal aktif/);
  assert.deepEqual(await ok.controller.changeMode(), { ok: true, mode: 'chat', text: 'Kembali ke mode obrolan, Rover~' });
  assert.equal(ok.controller.active, false);
});

test('run failures carry a code next to the text', async () => {
  const r = rig();
  assert.deepEqual(await r.controller.run('x'), { ok: false, mode: 'chat', code: 'not_active', error: 'Mode terminal belum aktif.' });
  await r.controller.begin();
  r.sessions[0].fail = 'multiline';
  const bad = await r.controller.run('x');
  assert.equal(bad.code, 'multiline');
  assert.equal(bad.error, 'Satu baris saja per perintah, ya.');
  r.sessions[0].fail = 'mystery';
  assert.equal((await r.controller.run('x')).code, 'failed');
  r.state.terminalOn = false;
  assert.equal((await r.controller.run('x')).code, 'terminal_disabled');
  assert.equal(r.controller.active, false);
});

// ---- the shell bridge ----------------------------------------------------------------------------------

test('the first line shows the dialog, then the Windows gate, then runs, in that order', async () => {
  const r = rig();
  const res = await r.bridge.run('  git status  ');
  assert.deepEqual(r.events, ['confirm', 'gate', 'start', 'run']);
  assert.deepEqual(r.asked, ['git status'], 'the dialog shows the exact line');
  assert.deepEqual(res, { ok: true, started: true, output: 'hasil: git status', cwd: 'C:/kerja', timedOut: false, ended: false });
  assert.equal(r.bridge.active, true);
  assert.deepEqual(r.sessions[0].lines, ['git status'], 'the shell got the line as typed, nothing added');
});

test('later lines run at once, with no dialog and no Windows prompt', async () => {
  const r = rig();
  await r.bridge.run('dir');
  r.events.length = 0;
  const res = await r.bridge.run('Get-Location');
  assert.deepEqual(r.events, ['run']);
  assert.equal(res.started, false);
  assert.equal(res.ok, true);
});

test('answering no in the dialog stops everything: no gate, no shell', async () => {
  const r = rig({ answer: false });
  assert.deepEqual(await r.bridge.run('dir'), { ok: false, code: 'cancelled' });
  assert.deepEqual(r.events, ['confirm']);
  assert.equal(r.controller.active, false);
  assert.equal(r.sessions.length, 0);
});

test('a dialog that breaks counts as no', async () => {
  const r = rig({ confirmThrows: true });
  assert.deepEqual(await r.bridge.run('dir'), { ok: false, code: 'cancelled' });
  assert.deepEqual(r.events, ['confirm']);
});

test('a dialog answer that is not exactly true counts as no', async () => {
  for (const answer of [undefined, null, 'yes', 1, {}]) {
    const r = rig();
    r.state.answer = answer;
    assert.deepEqual(await r.bridge.run('dir'), { ok: false, code: 'cancelled' }, String(answer));
    assert.equal(r.sessions.length, 0);
  }
});

test('the dialog is only a step before Windows, never a replacement for it', async () => {
  const r = rig({ gate: { granted: false, reason: 'declined' } });
  const res = await r.bridge.run('dir');
  assert.deepEqual(res, { ok: false, code: 'declined' });
  assert.deepEqual(r.events, ['confirm', 'gate'], 'agreeing in the dialog still needs Windows');
  assert.equal(r.controller.active, false);
  assert.equal(r.sessions.length, 0);
  r.state.gate = { granted: true };
  r.events.length = 0;
  assert.equal((await r.bridge.run('dir')).ok, true);
  assert.deepEqual(r.events.slice(0, 2), ['confirm', 'gate'], 'and it asks again');
});

test('every reason Windows gives is passed on', async () => {
  for (const reason of ['declined', 'timeout', 'unsupported', 'error']) {
    const r = rig({ gate: { granted: false, reason } });
    assert.deepEqual(await r.bridge.run('dir'), { ok: false, code: reason });
  }
});

test('with the Claude module off nothing is shown and nothing runs', async () => {
  const r = rig({ claudeOn: false });
  assert.deepEqual(await r.bridge.run('dir'), { ok: false, code: 'disabled' });
  assert.deepEqual(r.events, []);
});

test('turning the module off while the dialog is open stops the start before Windows is asked', async () => {
  const r = rig({ onConfirm: (state) => (state.claudeOn = false) });
  assert.deepEqual(await r.bridge.run('dir'), { ok: false, code: 'disabled' });
  assert.deepEqual(r.events, ['confirm']);
});

test('with terminal mode off in Settings the owner is told before any dialog', async () => {
  const r = rig({ terminalOn: false });
  assert.deepEqual(await r.bridge.run('dir'), { ok: false, code: 'terminal_disabled' });
  assert.deepEqual(r.events, []);
});

test('a line that cannot be sent is refused before the owner is asked anything', async () => {
  const r = rig();
  const long = 'x'.repeat(MAX_INPUT + 1);
  for (const [line, code] of [['', 'empty'], ['   ', 'empty'], ['a\nb', 'multiline'], [long, 'too-long'], ['a\u0007b', 'control']]) {
    assert.deepEqual(await r.bridge.run(line), { ok: false, code }, code);
  }
  assert.deepEqual(r.events, []);
});

test('a second line while the dialog is open waits instead of opening another', async () => {
  let release;
  const events = [];
  const r = rig();
  const slow = createShellBridge({
    terminal: r.controller,
    isEnabled: () => true,
    confirm: () =>
      new Promise((resolve) => {
        events.push('confirm');
        release = () => resolve(true);
      }),
  });
  const first = slow.run('one');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await slow.run('two'), { ok: false, code: 'waiting' });
  release();
  assert.equal((await first).ok, true);
  assert.deepEqual(events, ['confirm'], 'one dialog only');
});

test('exit closes the shell, and the next line asks again', async () => {
  const r = rig();
  await r.bridge.run('dir');
  assert.deepEqual(await r.bridge.run('exit'), { ok: true, left: true });
  assert.equal(r.controller.active, false);
  assert.equal(r.sessions[0].stopped, true);
  r.events.length = 0;
  await r.bridge.run('dir');
  assert.deepEqual(r.events.slice(0, 2), ['confirm', 'gate']);
  for (const word of ['quit', 'keluar', 'EXIT']) {
    assert.equal((await r.bridge.run(word)).left, true, word);
    await r.bridge.run('dir');
  }
});

test('exit with no shell open says so and opens nothing', async () => {
  const r = rig();
  assert.deepEqual(await r.bridge.run('exit'), { ok: false, code: 'not_active' });
  assert.deepEqual(r.events, []);
});

test('a shell that died is reported as ended and closed', async () => {
  const r = rig();
  await r.bridge.run('dir');
  r.sessions[0].dies = true;
  const res = await r.bridge.run('Stop-Process -Id $PID');
  assert.equal(res.ended, true);
  assert.equal(r.controller.active, false);
  assert.equal(r.bridge.active, false);
});

test('a shell that idled out is not mistaken for a live one', async () => {
  const r = rig();
  await r.bridge.run('dir');
  r.controller.stop();
  r.events.length = 0;
  const res = await r.bridge.run('dir');
  assert.equal(res.started, true);
  assert.deepEqual(r.events.slice(0, 2), ['confirm', 'gate']);
});

test('stop closes a shell the bridge started, and only that one', async () => {
  const r = rig();
  await r.bridge.run('dir');
  r.bridge.stop();
  assert.equal(r.controller.active, false);
  assert.equal(r.bridge.active, false);

  const other = rig();
  await other.controller.changeMode(); // the owner's own terminal mode
  other.bridge.stop();
  assert.equal(other.controller.active, true, "the owner's terminal session is left alone");
});

test('while the owner is in terminal mode the bridge neither uses nor touches that shell', async () => {
  const r = rig();
  await r.controller.changeMode();
  r.events.length = 0;
  assert.deepEqual(await r.bridge.run('dir'), { ok: false, code: 'terminal_mode' });
  assert.deepEqual(await r.bridge.run('exit'), { ok: false, code: 'terminal_mode' });
  assert.deepEqual(r.events, []);
  assert.equal(r.controller.active, true);
  assert.equal(r.sessions[0].stopped, false);
});

test('a failure from the shell is passed on as a code', async () => {
  const r = rig();
  await r.bridge.run('dir');
  r.sessions[0].fail = 'busy';
  assert.deepEqual(await r.bridge.run('dir'), { ok: false, code: 'busy' });
  r.sessions[0].fail = 'mystery';
  assert.deepEqual(await r.bridge.run('dir'), { ok: false, code: 'failed' });
});

test('every refusal code the bridge can return has text in both languages', () => {
  const keys = [
    'shell_usage', 'shell_waiting', 'shell_started', 'shell_left', 'shell_ended', 'shell_timed_out',
    'shell_cancelled', 'shell_declined', 'shell_timeout', 'shell_unsupported', 'shell_terminal_disabled',
    'shell_terminal_mode', 'shell_not_active', 'shell_waiting_busy', 'shell_multiline', 'shell_too_long',
    'shell_control', 'shell_busy', 'shell_failed', 'shell_use_bang',
  ];
  for (const locale of ['id-ID', 'en-US']) {
    const t = createI18n({ locale }).t;
    for (const key of keys) assert.notEqual(t('chat.' + key, { cwd: 'C:/x' }), 'chat.' + key, locale + ' ' + key);
    assert.match(t('chat.shell_started', { cwd: 'C:/kerja' }), /C:\/kerja/);
    for (const key of ['shell_dialog_title', 'shell_dialog_message', 'shell_dialog_detail', 'shell_dialog_ok', 'shell_dialog_cancel']) {
      assert.notEqual(t('agent.' + key, { command: 'dir' }), 'agent.' + key, locale + ' ' + key);
    }
    const detail = t('agent.shell_dialog_detail', { command: 'git status' });
    assert.match(detail, /git status/);
    assert.match(detail, /UAC/, 'the dialog says Windows will still ask');
    assert.match(detail, /Claude/, 'and that Claude does not run it');
  }
});
