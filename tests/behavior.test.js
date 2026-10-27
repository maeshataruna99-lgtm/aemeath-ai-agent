'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createBehaviorDirector,
  PRIORITY,
  KIND_PRIORITY,
  similarity,
} = require('../src/behavior/behavior-director');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function make(options) {
  let now = 0;
  const director = createBehaviorDirector(Object.assign({ now: () => now }, options));
  return {
    director,
    at() {
      return now;
    },
    advance(ms) {
      now += ms;
      return now;
    },
    chat(text) {
      return director.submit({ kind: 'chatter', text: text }, now);
    },
    activity(text, category) {
      return director.submit({ kind: 'activity-remark', text: text, category: category }, now);
    },
    decision(text) {
      return director.submit({ kind: 'decision-request', text: text || 'Sesi AI menunggu keputusanmu.' }, now);
    },
    failed(text) {
      return director.submit({ kind: 'session-failed', text: text || 'Sesi AI gagal: tes merah.' }, now);
    },
    timer(text) {
      return director.submit({ kind: 'timer-done', text: text || 'Timer fokus selesai.' }, now);
    },
  };
}

test('the event ladder matches the roadmap order', () => {
  assert.ok(PRIORITY.decision < PRIORITY.failure);
  assert.ok(PRIORITY.failure < PRIORITY.direct);
  assert.ok(PRIORITY.direct < PRIORITY.productivity);
  assert.ok(PRIORITY.productivity < PRIORITY.activity);
  assert.ok(PRIORITY.activity < PRIORITY.chatter);
  assert.equal(KIND_PRIORITY['decision-request'], PRIORITY.decision);
  assert.equal(KIND_PRIORITY['session-failed'], PRIORITY.failure);
  assert.equal(KIND_PRIORITY['timer-done'], PRIORITY.productivity);
  assert.equal(KIND_PRIORITY['activity-remark'], PRIORITY.activity);
  assert.equal(KIND_PRIORITY.chatter, PRIORITY.chatter);
  assert.equal(KIND_PRIORITY.trivia, PRIORITY.chatter);
});

test('a pending decision interrupts small talk', () => {
  const h = make({ mode: 'medium' });
  const first = h.chat('Rover, jangan kaget ya. Ini cuma aku.');
  assert.equal(first.action, 'show');

  const next = h.advance(2000) && h.decision();
  assert.equal(next.action, 'preempt');
  assert.equal(next.item.priority, PRIORITY.decision);
  assert.equal(next.interrupted.priority, PRIORITY.chatter);
  assert.equal(h.director.pendingCount, 0, 'interrupted chatter is dropped, not replayed');
  assert.equal(h.director.state().active.priority, PRIORITY.decision);
});

test('a failed session interrupts an activity remark but never a decision', () => {
  const h = make({ mode: 'full' });
  h.activity('Sudah 20 menit main Wuthering Waves, Rover.', 'game');
  h.advance(1000);
  const failed = h.failed();
  assert.equal(failed.action, 'preempt');
  assert.equal(failed.item.priority, PRIORITY.failure);

  h.advance(1000);
  const decision = h.decision();
  assert.equal(decision.action, 'preempt', 'a decision outranks a failure notice too');
  assert.equal(decision.item.priority, PRIORITY.decision);
  assert.equal(decision.interrupted.priority, PRIORITY.failure);
  h.advance(1000);
  assert.equal(h.timer().action, 'queue', 'a timer reminder waits behind a decision');
});

test('a timer still speaks while the pause switch is on, chatter does not', () => {
  const h = make({ mode: 'medium' });
  h.director.setPaused(true);
  assert.equal(h.chat('Halo Rover, aku di sini.').reason, 'paused');
  assert.equal(h.activity('Lagi ngoding ya, Rover?', 'coding').reason, 'paused');
  assert.equal(h.decision().action, 'show');
  h.advance(1000);
  assert.equal(h.timer().action, 'queue');
  h.advance(1000);
  assert.equal(h.failed().action, 'queue');
});

test('pausing clears lines that were already waiting', () => {
  const h = make({ mode: 'medium' });
  h.decision();
  h.advance(100);
  assert.equal(h.activity('Game baru dimulai, Rover!', 'game').action, 'queue');
  assert.equal(h.director.pendingCount, 1);
  h.director.setPaused(true);
  assert.equal(h.director.pendingCount, 0);
  h.advance(1000);
  assert.equal(h.director.finish(), null, 'nothing light is left to say');
});

test('several events at once are shown one by one, most important first', () => {
  const h = make({ mode: 'full' });
  h.director.setLimits({ cooldownMs: 0 });
  // A decision is on screen while three events land in the same second.
  h.decision('Sesi AI menunggu keputusanmu.');
  h.advance(10);
  const a = h.activity('Kamu pindah-pindah jendela terus, Rover.', 'context-switch');
  h.advance(10);
  const b = h.activity('Sudah 45 menit ngoding, Rover!', 'coding');
  h.advance(10);
  const c = h.timer('Timer fokus 25 menit selesai.');
  assert.equal(a.action, 'queue');
  assert.equal(b.action, 'queue');
  assert.equal(c.action, 'queue');
  assert.equal(h.director.pendingCount, 3);

  // The decision is read: the timer (priority 4) goes next, then the remarks
  // oldest first within the same priority.
  const first = h.director.finish();
  assert.equal(first.item.kind, 'timer-done');
  const second = h.director.finish();
  assert.equal(second.item.category, 'context-switch');
  const third = h.director.finish();
  assert.equal(third.item.category, 'coding');
  assert.equal(h.director.finish(), null);
});

test('a desktop remark interrupts trivia but waits behind a decision', () => {
  const h = make({ mode: 'medium' });
  h.director.setLimits({ cooldownMs: 0 });
  h.chat('Trivia: Solaris-3 punya tiga wilayah besar.');
  h.advance(1000);
  const remark = h.activity('Kamu sedang ngoding, Rover.', 'coding');
  assert.equal(remark.action, 'preempt');
  assert.equal(remark.interrupted.kind, 'chatter');
  h.advance(1000);
  assert.equal(h.chat('Trivia lain tentang Aemeath.').action, 'queue');
});

test('the same activity category is merged instead of repeated', () => {
  const h = make({ mode: 'medium' });
  h.decision();
  h.advance(10);
  h.activity('Sudah 20 menit main Roblox, Rover.', 'game');
  h.advance(10);
  h.activity('Sudah 21 menit main Roblox, Rover.', 'game');
  h.advance(10);
  h.activity('Sudah 22 menit main Roblox, Rover.', 'game');
  assert.equal(h.director.pendingCount, 1, 'one game remark waits, not three');
  h.advance(10);
  const next = h.director.finish();
  assert.match(next.item.text, /22 menit/);
});

test('identical and near-identical lines are suppressed, then allowed again later', () => {
  const h = make({ mode: 'medium' });
  h.director.setLimits({ cooldownMs: 0 });
  h.chat('Kamu sudah minum air hari ini? Aku cuma bisa mengingatkan.');
  h.advance(1000);
  h.director.finish();
  assert.equal(h.chat('Kamu sudah minum air hari ini? Aku cuma bisa mengingatkan.').reason, 'duplicate');
  assert.equal(
    h.chat('Kamu sudah minum air hari ini? Aku cuma bisa mengingatkan ya.').reason,
    'duplicate',
    'a word more or less is still the same line',
  );
  h.advance(31 * MIN);
  assert.equal(h.chat('Kamu sudah minum air hari ini? Aku cuma bisa mengingatkan.').action, 'show');
});

test('a duplicate is caught across sources, not just inside one', () => {
  const h = make({ mode: 'full' });
  h.director.setLimits({ cooldownMs: 0 });
  h.activity('Semangat ngoding, Rover!', 'coding');
  h.advance(1000);
  h.director.finish();
  assert.equal(h.chat('Semangat ngoding, Rover!').reason, 'duplicate');
});

test('one remark per category per cooldown window', () => {
  const h = make({ mode: 'medium' });
  h.activity('Media sosial 20 menit, Rover.', 'social');
  h.advance(1000);
  h.director.finish();
  assert.equal(h.activity('Media sosial 25 menit, Rover.', 'social').reason, 'cooldown');
  assert.equal(h.activity('Game baru dimulai, Rover!', 'game').action, 'show');
  h.advance(1000);
  h.director.finish();
  h.advance(10 * MIN);
  assert.equal(h.activity('Media sosial 40 menit, Rover.', 'social').action, 'show');
});

test('the hourly cap stops event-driven remarks without silencing important ones', () => {
  const h = make({ mode: 'full' });
  h.director.setLimits({ maxPerHour: 3, cooldownMs: 0 });
  const categories = ['social', 'game', 'coding', 'video', 'work'];
  const shown = [];
  for (let i = 0; i < 5; i += 1) {
    const result = h.activity('Catatan aktivitas nomor ' + i + ' untuk Rover.', categories[i]);
    if (result.action === 'show') shown.push(i);
    h.advance(1000);
    h.director.finish();
  }
  assert.deepEqual(shown, [0, 1, 2]);
  assert.equal(h.activity('Catatan aktivitas lain lagi untuk Rover.', 'other').reason, 'budget');
  assert.equal(h.decision().action, 'show', 'a decision is never capped');
  h.advance(1000);
  h.director.finish();
  assert.equal(h.timer().action, 'show', 'a timer is never capped');
  h.advance(HOUR);
  h.director.finish();
  assert.equal(h.activity('Sesi baru: kamu main lagi, Rover.', 'game').action, 'show');
});

test('low mode keeps chatter but drops desktop remarks', () => {
  const h = make({ mode: 'low' });
  assert.equal(h.activity('Kamu sedang ngoding, Rover.', 'coding').reason, 'mode');
  assert.equal(h.chat('Halo Rover, aku di sini.').action, 'show');
  h.advance(1000);
  h.director.finish();
  assert.equal(h.decision().action, 'show', 'the important event still gets through');
});

test('medium and full allow desktop remarks; focus holds them back', () => {
  for (const mode of ['medium', 'full']) {
    const h = make({ mode: mode });
    assert.equal(h.activity('Kamu sedang ngoding, Rover.', 'coding').action, 'show');
  }

  const focused = make({ mode: 'full' });
  focused.director.setFocus(true);
  assert.equal(focused.chat('Halo Rover.').reason, 'focus');
  assert.equal(focused.activity('Kamu sedang ngoding.', 'coding').reason, 'focus');
  assert.equal(focused.decision().action, 'show');
  focused.advance(1000);
  assert.equal(focused.timer().action, 'queue');
});

test('an idle desktop defers chatter until Rover is back', () => {
  const h = make({ mode: 'medium' });
  h.director.setIdle(true);
  assert.equal(h.chat('Halo Rover, aku di sini.').reason, 'idle');
  assert.equal(h.activity('Kamu sedang ngoding.', 'coding').reason, 'idle');
  assert.equal(h.decision().action, 'show');
  h.director.setIdle(false);
  h.advance(1000);
  h.director.finish();
  assert.equal(h.chat('Halo Rover, aku di sini.').action, 'show');
});

test('an open chat box holds lines until it closes', () => {
  const h = make({ mode: 'medium' });
  h.director.setChatOpen(true);
  const held = h.chat('Halo Rover, aku di sini.');
  assert.equal(held.action, 'queue');
  h.director.setChatOpen(false);
  const next = h.director.tick();
  assert.equal(next.item.text, 'Halo Rover, aku di sini.');
});

test('a held line nobody read in time is thrown away, not shown late', () => {
  const h = make({ mode: 'medium' });
  h.director.setChatOpen(true);
  h.chat('Halo Rover, aku di sini.');
  h.advance(21 * 1000);
  h.director.setChatOpen(false);
  assert.equal(h.director.tick(), null);
  assert.equal(h.director.state().stats.expired, 1);
});

test('the waiting list is capped and drops its least important line first', () => {
  const h = make({ mode: 'full' });
  h.director.setLimits({ cooldownMs: 0, maxPerHour: 60 });
  h.decision();
  h.advance(10);
  for (let i = 0; i < 7; i += 1) {
    h.activity('Catatan aktivitas nomor ' + i + ' untuk Rover.', 'cat-' + i);
    h.advance(10);
  }
  assert.equal(h.director.pendingCount, 6, 'the queue never grows past six');
  assert.ok(h.director.state().stats.evicted >= 1);
  assert.equal(h.director.state().active.priority, PRIORITY.decision);
});

test('equal priorities keep their arrival order', () => {
  const h = make({ mode: 'medium' });
  h.decision();
  h.advance(10);
  h.activity('Pertama untuk Rover.', 'a');
  h.advance(10);
  h.activity('Kedua untuk Rover.', 'b');
  assert.equal(h.director.finish().item.text, 'Pertama untuk Rover.');
  assert.equal(h.director.finish().item.text, 'Kedua untuk Rover.');
});

test('switching back to low drops waiting desktop remarks', () => {
  const h = make({ mode: 'full' });
  h.decision();
  h.advance(10);
  h.activity('Kamu sedang ngoding, Rover.', 'coding');
  assert.equal(h.director.pendingCount, 1);
  h.director.setMode('low');
  assert.equal(h.director.pendingCount, 0);
  assert.equal(h.director.state().mode, 'low');
});

test('a mode the app does not know is ignored', () => {
  const h = make({ mode: 'medium' });
  assert.equal(h.director.setMode('turbo'), 'medium');
  assert.equal(h.director.state().mode, 'medium');
});

test('a malformed event never throws and never shows an empty bubble', () => {
  const h = make();
  assert.equal(h.director.submit(null).reason, 'empty');
  assert.equal(h.director.submit({}).reason, 'empty');
  assert.equal(h.director.submit({ kind: 'chatter', text: '   ' }).reason, 'empty');
  const odd = h.director.submit({ kind: 'mystery', text: 'Halo?', priority: 99, category: 5 });
  assert.equal(odd.item.priority, PRIORITY.chatter, 'an unknown kind falls back to the lowest rung');
  assert.equal(odd.action, 'show');
});

test('the chatter switch keeps its old meaning', () => {
  const h = make({ mode: 'medium' });
  h.director.setChatterEnabled(false);
  assert.equal(h.chat('Halo Rover.').reason, 'off');
  assert.equal(h.activity('Kamu sedang ngoding.', 'coding').action, 'show');
  h.director.setChatterEnabled(true);
  h.advance(1000);
  h.director.finish();
  assert.equal(h.chat('Halo Rover.').action, 'show');
});

test('similarity compares words, not letters', () => {
  assert.equal(similarity('Halo Rover!', 'Halo Rover!'), 1);
  assert.equal(similarity('Halo Rover!', 'Halo, Rover!'), 1);
  assert.ok(similarity('Timer fokus selesai ya', 'Timer fokus sudah selesai ya') > 0.6);
  assert.ok(similarity('Timer fokus selesai ya', 'Game Roblox dimulai') < 0.2);
  assert.equal(similarity('', 'Halo'), 0);
});

test('state() reports enough to explain why she is quiet', () => {
  const h = make({ mode: 'medium' });
  h.director.setLimits({ maxPerHour: 2, cooldownMs: 5 * MIN });
  const state = h.director.state();
  assert.equal(state.mode, 'medium');
  assert.equal(state.maxPerHour, 2);
  assert.equal(state.cooldownMin, 5);
  assert.equal(state.active, null);
  assert.deepEqual(state.pending, []);
  assert.equal(state.stats.shown, 0);
});
