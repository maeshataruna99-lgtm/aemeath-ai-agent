'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { classify, describe, pageTitleOf, workContextOf } = require('../src/activity/classifier');
const { createActivityTracker } = require('../src/activity/activity-tracker');
const { createActivityWatcher, parseSample } = require('../src/activity/activity-watcher');
const { createActivityMonitor } = require('../src/activity/activity-monitor');
const { analyzeFrame, describeScreen, createScreenSampler } = require('../src/activity/screen-analyzer');
const {
  analyzeGitOutput,
  formatLocalEvaluation,
  createWorkReviewer,
  isSensitiveFile,
  sanitizeDiff,
} = require('../src/activity/work-reviewer');

const chrome = (title) => classify({ process: 'chrome', title: title + ' - Google Chrome' });

// ---- classifier ---------------------------------------------------------------

test('social sites and short video are recognised from the page title', () => {
  const cases = [
    ['(3) Facebook', 'Facebook'],
    ['Instagram', 'Instagram'],
    ['TikTok - Make Your Day', 'TikTok'],
    ['r/programming - Reddit', 'Reddit'],
    ['Home / X', 'X'],
    ['Someone on X: "hello"', 'X'],
    ['Funny cat #shorts - YouTube', 'YouTube Shorts'],
  ];
  for (const [title, site] of cases) {
    const info = chrome(title);
    assert.equal(info.category, 'social', title);
    assert.equal(info.social, true, title);
    assert.equal(info.site, site, title);
  }
});

test('video, chat and ordinary pages are not counted as scrolling', () => {
  assert.equal(chrome('Lecture 1 - YouTube').category, 'video');
  assert.equal(chrome('Lecture 1 - YouTube').social, false);
  assert.equal(chrome('WhatsApp').category, 'chat');
  assert.equal(chrome('GitHub - some/repo').category, 'browser');
  // a document that merely mentions a site is not that site
  assert.equal(chrome('Instagram marketing plan - Google Docs').category, 'browser');
  assert.equal(chrome('How to quit Facebook for good - Blog').category, 'browser');
});

test('private windows and sensitive apps are not read at all', () => {
  const ignored = [
    classify({ process: 'msedge', title: 'Instagram - [InPrivate] - Microsoft Edge' }),
    classify({ process: 'chrome', title: 'New Tab - Google Chrome (Incognito)' }),
    classify({ process: 'firefox', title: 'Facebook - Private Browsing - Mozilla Firefox' }),
    classify({ process: 'KeePassXC', title: 'Passwords' }),
    classify({ process: 'Bitwarden', title: 'Vault' }),
    classify({ process: 'LockApp', title: 'Windows Default Lock Screen' }),
    classify({ process: 'consent', title: 'User Account Control' }),
    classify({ process: 'electron', title: 'Aemeath' }),
    classify({ process: '', title: 'x' }),
    classify(null),
  ];
  for (const info of ignored) {
    assert.equal(info.category, 'ignored');
    assert.equal(info.social, false);
  }
});

test('games are named from the process, the install folder or the window title', () => {
  const game = (sample) => classify(sample).game;
  assert.equal(game({ process: 'RobloxPlayerBeta', title: 'Roblox' }), 'Roblox');
  assert.equal(game({ process: 'GenshinImpact', title: 'Genshin Impact' }), 'Genshin Impact');
  assert.equal(
    game({ process: 'Client-Win64-Shipping', title: '', path: 'D:\\Games\\Wuthering Waves Game\\Client\\Binaries\\Win64\\Client-Win64-Shipping.exe' }),
    'Wuthering Waves',
  );
  assert.equal(game({ process: 'Client-Win64-Shipping', title: 'Wuthering Waves' }), 'Wuthering Waves');
  assert.equal(
    game({ process: 'hades', title: 'Hades', path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hades\\x64\\Hades.exe' }),
    'Hades',
  );
  assert.equal(game({ process: 'javaw', title: 'Minecraft 1.21' }), 'Minecraft');

  // tools that live in Steam folders are not games, and launchers are not games either
  assert.equal(
    game({ process: 'wallpaper32', title: 'Wallpaper Engine', path: 'C:\\Steam\\steamapps\\common\\wallpaper_engine\\wallpaper32.exe' }),
    null,
  );
  assert.equal(classify({ process: 'steam', title: 'Steam' }).category, 'launcher');
  assert.equal(classify({ process: 'chrome', title: 'Wuthering Waves guide - Google Chrome' }).game, null, 'a browser tab is never a game');
});

test('apps are grouped into coding, work, chat, media and other', () => {
  assert.equal(classify({ process: 'Code', title: 'index.js - project - Visual Studio Code' }).category, 'coding');
  assert.equal(classify({ process: 'WindowsTerminal', title: 'PowerShell' }).category, 'coding');
  assert.equal(classify({ process: 'EXCEL', title: 'Book1' }).category, 'work');
  assert.equal(classify({ process: 'Discord', title: 'general' }).category, 'chat');
  assert.equal(classify({ process: 'Spotify', title: 'Song' }).category, 'media');
  const other = classify({ process: 'mystery', title: 'secret document name' });
  assert.deepEqual([other.category, other.app], ['other', 'Mystery']);
});

test('the result carries no window title, and the description never shows one', () => {
  const title = 'Quarterly salary review for Jane Doe - Google Docs';
  const infos = [classify({ process: 'chrome', title: title + ' - Google Chrome' }), classify({ process: 'WINWORD', title })];
  for (const info of infos) {
    assert.ok(!JSON.stringify(info).includes('salary'), JSON.stringify(info));
    assert.ok(!describe(info).includes('salary'));
  }
  assert.equal(describe(classify({ process: 'RobloxPlayerBeta', title: '' })), 'bermain Roblox');
  assert.match(describe(chrome('TikTok')), /^media sosial \(TikTok\)$/);
  assert.match(describe(classify({ process: 'LockApp', title: '' })), /tidak dibaca/);
  assert.equal(describe(null), 'belum ada');
  assert.equal(pageTitleOf('Page - Site - Mozilla Firefox'), 'Page - Site');
});

// ---- tracker ------------------------------------------------------------------

const SOCIAL = classify({ process: 'chrome', title: 'Instagram - Google Chrome' });
const NEWS = classify({ process: 'chrome', title: 'Berita hari ini - Google Chrome' });
const CODE = classify({ process: 'Code', title: 'x' });
const ROBLOX = classify({ process: 'RobloxPlayerBeta', title: '' });
const WUWA = classify({ process: 'x', title: 'Wuthering Waves' });

function clock() {
  const state = { t: 1000000 };
  return {
    // feeds a sample every 3 seconds for the given number of minutes
    run(tracker, info, minutes, idle) {
      const out = [];
      for (let i = 0; i < (minutes * 60) / 3; i++) {
        state.t += 3000;
        for (const remark of tracker.feed(info, state.t, idle || 0).remarks) out.push({ ...remark, at: state.t });
      }
      return out;
    },
    skip(ms) {
      state.t += ms;
    },
    get now() {
      return state.t;
    },
  };
}

function trackerWith(limit) {
  return createActivityTracker({ getLimitMin: () => limit || 20, rng: () => 0 });
}

test('doomscrolling is warned about at the limit and grows firmer after that', () => {
  const tracker = trackerWith(20);
  const time = clock();
  assert.deepEqual(time.run(tracker, SOCIAL, 19), [], 'nothing before the limit');

  const first = time.run(tracker, SOCIAL, 2);
  assert.equal(first.length, 1);
  assert.equal(first[0].kind, 'doomscroll');
  assert.match(first[0].text, /20 menit/);

  assert.deepEqual(time.run(tracker, SOCIAL, 18), [], 'no nagging in between');
  const second = time.run(tracker, SOCIAL, 3);
  assert.equal(second.length, 1);
  assert.match(second[0].text, /Aku mulai khawatir/);

  const third = time.run(tracker, SOCIAL, 20);
  assert.equal(third.length, 1);
  assert.match(third[0].text, /Tutup tabnya dulu/);
});

test('the limit comes from the setting', () => {
  const tracker = trackerWith(5);
  const remarks = clock().run(tracker, SOCIAL, 6);
  assert.equal(remarks.length, 1);
  assert.match(remarks[0].text, /5 menit/);
});

test('a short break keeps the session, a long one ends it', () => {
  const brief = trackerWith(20);
  const time = clock();
  time.run(brief, SOCIAL, 15);
  time.run(brief, NEWS, 2);
  assert.equal(time.run(brief, SOCIAL, 6).length, 1, '15 + 6 minutes of scrolling still adds up');

  const long = trackerWith(20);
  const time2 = clock();
  time2.run(long, SOCIAL, 15);
  time2.run(long, NEWS, 6);
  assert.equal(long.socialMinutes, 0);
  assert.deepEqual(time2.run(long, SOCIAL, 10), [], 'the count starts again after a real break');
});

test('time away from the keyboard is not counted and a long absence resets everything', () => {
  const tracker = trackerWith(20);
  const time = clock();
  assert.deepEqual(time.run(tracker, SOCIAL, 30, 150), [], 'idle for 2.5 minutes: paused, not scrolling');
  assert.deepEqual(time.run(tracker, SOCIAL, 15), []);

  time.skip(10 * 60 * 1000); // the computer slept
  assert.deepEqual(time.run(tracker, SOCIAL, 10), [], 'a gap in the samples starts a new session');
  time.run(tracker, SOCIAL, 8);
  assert.deepEqual(time.run(tracker, SOCIAL, 1, 400), []);
  assert.equal(tracker.socialMinutes, 0, 'five idle minutes forget the session');
});

test('private windows neither count nor interrupt a session', () => {
  const tracker = trackerWith(20);
  const time = clock();
  const hidden = classify({ process: 'chrome', title: 'x - Incognito - Google Chrome' });
  time.run(tracker, SOCIAL, 12);
  time.run(tracker, hidden, 30);
  assert.equal(tracker.socialMinutes, 12);
  assert.equal(time.run(tracker, SOCIAL, 9).length, 1);
});

test('a game start gets one friendly word, and a long session gets break reminders', () => {
  const tracker = trackerWith(20);
  const time = clock();
  const start = time.run(tracker, ROBLOX, 1);
  assert.equal(start.length, 1);
  assert.equal(start[0].kind, 'game-start');
  assert.match(start[0].text, /Roblox/);

  assert.deepEqual(time.run(tracker, ROBLOX, 60), [], 'quiet while playing');
  const reminder = time.run(tracker, ROBLOX, 35);
  assert.equal(reminder.length, 1);
  assert.equal(reminder[0].kind, 'game-long');
  assert.match(reminder[0].text, /Peregangan/);

  assert.deepEqual(time.run(tracker, ROBLOX, 50), []);
  assert.equal(time.run(tracker, ROBLOX, 15).length, 1, 'then once an hour');
});

test('Wuthering Waves gets its own greeting, and a new game or a return after a break speaks again', () => {
  const tracker = trackerWith(20);
  const time = clock();
  assert.match(time.run(tracker, WUWA, 1)[0].text, /Itu duniaku/);
  assert.equal(time.run(tracker, ROBLOX, 2)[0].kind, 'game-start', 'switching games');
  time.run(tracker, CODE, 7);
  assert.equal(time.run(tracker, ROBLOX, 2)[0].kind, 'game-start', 'coming back after a real break');
});

test('remarks respect a one minute cooldown and are delayed, not lost', () => {
  const tracker = trackerWith(5);
  const time = clock();
  // just past the limit, so the game starts only seconds after the warning
  const warn = time.run(tracker, SOCIAL, 5.1);
  assert.equal(warn[0].kind, 'doomscroll');

  const next = time.run(tracker, ROBLOX, 3);
  assert.equal(next.length, 1);
  assert.equal(next[0].kind, 'game-start');
  assert.ok(next[0].at - warn[0].at >= 60000, 'waited out the cooldown: ' + (next[0].at - warn[0].at));
});

test('nothing is said while Rover is away from the keyboard', () => {
  const tracker = trackerWith(20);
  const time = clock();
  assert.deepEqual(time.run(tracker, ROBLOX, 2, 130), [], 'a game that starts while he is away waits');
  const back = time.run(tracker, ROBLOX, 1, 0);
  assert.equal(back.length, 1, 'and is mentioned once he is back');
  assert.equal(back[0].kind, 'game-start');
});

test('ordinary activity makes no remark at all', () => {
  const tracker = trackerWith(20);
  const time = clock();
  assert.deepEqual(time.run(tracker, CODE, 120), []);
  assert.deepEqual(time.run(tracker, NEWS, 120), []);
});

// ---- watcher ------------------------------------------------------------------

test('samples are parsed leniently and bad lines are dropped', () => {
  assert.deepEqual(parseSample('{"process":"chrome","path":"C:\\\\x.exe","title":"Hi"}'), {
    process: 'chrome',
    path: 'C:\\x.exe',
    title: 'Hi',
  });
  assert.deepEqual(parseSample('{"process":"a"}'), { process: 'a', path: '', title: '' });
  for (const bad of ['', '   ', 'not json', '42', 'null', '[1]']) {
    const result = parseSample(bad);
    assert.ok(result === null || (typeof result === 'object' && !Array.isArray(result)), bad);
  }
  assert.equal(parseSample('not json'), null);
  assert.equal(parseSample(''), null);
});

function fakeSpawn() {
  const children = [];
  const spawn = (file, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.killed = false;
    child.kill = () => {
      child.killed = true;
    };
    children.push({ child, file, args, options });
    return child;
  };
  spawn.children = children;
  return spawn;
}

test('the watcher can be stopped and started again, which the music watcher cannot', () => {
  const spawn = fakeSpawn();
  const samples = [];
  const watcher = createActivityWatcher({ spawn, onSample: (s) => samples.push(s) });

  watcher.start();
  assert.equal(spawn.children.length, 1);
  const first = spawn.children[0];
  assert.equal(first.file, 'powershell.exe');
  assert.ok(first.args.includes('-File'));
  assert.equal(first.options.stdio[1], 'pipe');

  // a line split across two chunks is reassembled
  first.child.stdout.emit('data', '{"process":"chrome","title":"A"}\n{"process":"co');
  first.child.stdout.emit('data', 'de","title":"B"}\n');
  assert.deepEqual(samples.map((s) => s.process), ['chrome', 'code']);

  watcher.stop();
  assert.equal(first.child.killed, true);
  first.child.emit('exit'); // a late exit must not bring it back
  assert.equal(spawn.children.length, 1);

  watcher.start();
  assert.equal(spawn.children.length, 2, 'starting again launches a new shell');
  spawn.children[1].child.stdout.emit('data', '{"process":"again"}\n');
  assert.equal(samples[samples.length - 1].process, 'again');
  watcher.stop();
});

// ---- monitor ------------------------------------------------------------------

function monitorWith(overrides) {
  const remarks = [];
  const watchers = [];
  const tracker = createActivityTracker({ getLimitMin: () => 20, rng: () => 0 });
  let t = 1000000;
  const monitor = createActivityMonitor({
    createWatcher: (onSample) => {
      const w = { onSample, started: false, stopped: false, start() { w.started = true; }, stop() { w.stopped = true; } };
      watchers.push(w);
      return w;
    },
    tracker,
    getIdleSeconds: () => 0,
    onRemark: (remark) => remarks.push(remark),
    now: () => (t += 3000),
    ...overrides,
  });
  return { monitor, remarks, watchers, tracker };
}

test('the monitor only watches while it is running and forgets everything when stopped', () => {
  const { monitor, remarks, watchers } = monitorWith();
  assert.equal(monitor.describe(), null, 'not running: sees nothing');
  monitor.start();
  monitor.start();
  assert.equal(watchers.length, 1, 'starting twice does not double the watcher');
  assert.equal(watchers[0].started, true);

  watchers[0].onSample({ process: 'RobloxPlayerBeta', title: 'Roblox', path: '' });
  assert.equal(monitor.describe(), 'bermain Roblox');
  assert.equal(remarks.length, 1);
  assert.equal(remarks[0].kind, 'game-start');

  monitor.stop();
  assert.equal(watchers[0].stopped, true);
  assert.equal(monitor.running, false);
  assert.equal(monitor.describe(), null);
});

test('what the monitor reports and says never contains the window title', () => {
  const { monitor, remarks, watchers } = monitorWith();
  monitor.start();
  watchers[0].onSample({ process: 'RobloxPlayerBeta', title: 'TOPSECRETTITLE', path: 'C:\\Users\\someone\\game.exe' });
  const seen = JSON.stringify([monitor.describe(), monitor.summary(), remarks]);
  assert.ok(!seen.includes('TOPSECRETTITLE'));
  assert.ok(!seen.includes('someone'));
});

test('tracker and monitor report an in-memory category summary and forget it when stopped', () => {
  const { monitor, watchers } = monitorWith();
  assert.equal(monitor.summary(), null, 'not running: no summary');
  monitor.start();
  assert.equal(monitor.summary(), null, 'no samples yet: no summary');

  // First sample sets the baseline timestamp; subsequent samples accumulate time
  watchers[0].onSample({ process: 'Code', title: 'index.js - Visual Studio Code', path: '' });
  for (let i = 0; i < 20; i++) {
    watchers[0].onSample({ process: 'Code', title: 'index.js - Visual Studio Code', path: '' });
  }
  for (let i = 0; i < 5; i++) {
    watchers[0].onSample({ process: 'chrome', title: 'Instagram - Google Chrome', path: '' });
  }
  const sum = monitor.summary();
  assert.match(sum, /ngoding 1 menit/);
  assert.match(sum, /medsos <1 menit/);

  monitor.stop();
  assert.equal(monitor.summary(), null, 'stopping forgets the summary');
});

// ---- full mode & lightweight screen capture -----------------------------------

test('workContextOf extracts coarse coding language and test flag without keeping filenames or titles', () => {
  const ctx = workContextOf({ process: 'Code', title: 'secret-algorithm.test.js - MyProject - Visual Studio Code' });
  assert.deepEqual(ctx, { language: 'JavaScript', testing: true });
  assert.ok(!JSON.stringify(ctx).includes('secret-algorithm'));
  assert.deepEqual(workContextOf({ process: 'chrome', title: 'index.js - Google Chrome' }), {
    language: '',
    testing: false,
  });
});

test('analyzeFrame and createScreenSampler compute brightness and motion in memory and skip when disallowed', async () => {
  const darkBuf = Buffer.alloc(32 * 18 * 4, 20);
  const brightBuf = Buffer.alloc(32 * 18 * 4, 230);

  const first = analyzeFrame({ data: darkBuf, width: 32, height: 18 }, null);
  assert.equal(first.tone, 'dark');
  assert.equal(first.motion, 'active');

  const second = analyzeFrame({ data: darkBuf, width: 32, height: 18 }, first.signature);
  assert.equal(second.motion, 'static');
  assert.equal(second.motionScore, 0);
  assert.equal(describeScreen(second), 'tampilan gelap, layar diam');

  const third = analyzeFrame({ data: brightBuf, width: 32, height: 18 }, second.signature);
  assert.equal(third.tone, 'bright');
  assert.equal(third.motion, 'dynamic');

  let calls = 0;
  const sampler = createScreenSampler({
    captureFrame: async () => {
      calls += 1;
      return { data: darkBuf, width: 32, height: 18 };
    },
  });
  assert.equal(await sampler.sample(false), null, 'disallowed capture does not call captureFrame');
  assert.equal(calls, 0);
  const sampled = await sampler.sample(true);
  assert.equal(calls, 1);
  assert.equal(sampled.tone, 'dark');
  sampler.reset();
  assert.equal(sampler.latest, null);
});

test('Full mode remarks on coding start, test files, deep focus, screen stuck, bright night screen, and tab-hopping', () => {
  const tracker = createActivityTracker({
    getLimitMin: () => 20,
    getMode: () => 'full',
    rng: () => 0,
  });
  let t = 1000000;
  const step = (info, minutes, ctx) => {
    const out = [];
    for (let i = 0; i < (minutes * 60) / 3; i++) {
      t += 3000;
      for (const r of tracker.feed(info, t, 0, ctx).remarks) out.push(r);
    }
    return out;
  };

  // 1. Coding start with language
  const start = step(CODE, 1, { language: 'JavaScript', testing: false });
  assert.equal(start.length, 1);
  assert.equal(start[0].kind, 'coding-start');
  assert.match(start[0].text, /JavaScript/);

  // 2. Switching to a unit test file
  const testSwitch = step(CODE, 2, { language: 'JavaScript', testing: true });
  assert.equal(testSwitch.length, 1);
  assert.equal(testSwitch[0].kind, 'coding-test');

  // 3. Static screen for 10+ minutes while coding triggers screen-stuck
  const stuck = step(CODE, 11, {
    language: 'JavaScript',
    testing: true,
    screen: { tone: 'dark', motion: 'static' },
  });
  assert.ok(stuck.some((r) => r.kind === 'screen-stuck'));

  // 4. Bright screen late at night triggers screen-bright
  const nightBright = step(CODE, 2, {
    language: 'JavaScript',
    testing: true,
    screen: { tone: 'bright', motion: 'active' },
    hour: 23,
  });
  assert.ok(nightBright.some((r) => r.kind === 'screen-bright'));

  // 5. 45 minutes of coding triggers coding-focus
  const focus = step(CODE, 35, {
    language: 'JavaScript',
    testing: true,
    screen: { tone: 'dark', motion: 'active' },
  });
  assert.ok(focus.some((r) => r.kind === 'coding-focus'));

  // 6. Rapid category switching triggers context-switch
  const hopped = [];
  for (let i = 0; i < 4; i++) {
    t += 15000;
    for (const r of tracker.feed(NEWS, t, 0, {}).remarks) hopped.push(r);
    t += 15000;
    for (const r of tracker.feed(CODE, t, 0, {}).remarks) hopped.push(r);
  }
  assert.ok(hopped.some((r) => r.kind === 'context-switch'));
});

test('analyzeGitOutput and formatLocalEvaluation summarize work 100% locally and strip secrets', async () => {
  const status = [' M src/main.js', ' M tests/activity.test.js', '?? src/new.js'].join('\n');
  const diff = ['+const a = 1;', '+console.log(a);', '+// TODO: clean up', '-const old = 2;'].join('\n');
  const metrics = analyzeGitOutput(status, diff);
  assert.equal(metrics.totalFiles, 3);
  assert.equal(metrics.modified, 2);
  assert.equal(metrics.untracked, 1);
  assert.equal(metrics.testFiles, 1);
  assert.equal(metrics.addedLines, 3);
  assert.equal(metrics.removedLines, 1);
  assert.equal(metrics.debugLogs, 1);
  assert.equal(metrics.todoMarkers, 1);

  const local = formatLocalEvaluation(metrics);
  assert.match(local.summary, /2 diubah, 1 baru/);
  assert.match(local.summary, /console\.log/);

  const fakeGitSpawn = (_file, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdout.setEncoding = () => {};
    setImmediate(() => {
      child.stdout.emit('data', args[0] === 'status' ? status : diff);
      child.emit('close', 0);
    });
    return child;
  };
  const reviewer = createWorkReviewer({
    spawn: fakeGitSpawn,
  });

  const r1 = await reviewer.review();
  assert.equal(r1.ok, true);
  assert.match(r1.text, /progres kerjamu/);
  assert.match(r1.output, /2 diubah, 1 baru/);

  // Sensitive files (.env, chat-keys.json, *.key) and API keys (sk-...) are detected
  // and stripped so they never leave the machine even when AI review is enabled.
  assert.equal(isSensitiveFile('.env.local'), true);
  assert.equal(isSensitiveFile('config/chat-keys.json'), true);
  assert.equal(isSensitiveFile('certs/private.key'), true);
  assert.equal(isSensitiveFile('src/index.js'), false);

  const leakyStatus = [' M .env', ' M src/config.js'].join('\n');
  const leakyDiff = [
    'diff --git a/.env b/.env',
    '+DEEPSEEK_API_KEY=sk-secret99999999999999',
    'diff --git a/src/config.js b/src/config.js',
    '+const key = "sk-deepseeklive1234567890";',
  ].join('\n');
  const leakyMetrics = analyzeGitOutput(leakyStatus, leakyDiff);
  assert.ok(leakyMetrics.secretWarnings >= 2);
  const leakyEval = formatLocalEvaluation(leakyMetrics);
  assert.match(leakyEval.summary, /Peringatan keamanan/);
  const cleaned = sanitizeDiff(leakyDiff);
  assert.ok(!cleaned.includes('sk-secret99999999999999'), '.env diff block is completely removed');
  assert.ok(!cleaned.includes('sk-deepseeklive1234567890'), 'inline API key is redacted');
  assert.ok(cleaned.includes('[kunci disembunyikan]'));
});
