'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createSchedule, GRACE_MS, MAX_ENTRIES } = require('../src/productivity/schedule');
const { createI18n } = require('../src/i18n');

const tId = createI18n({ locale: 'id-ID' }).t;
const tEn = createI18n({ locale: 'en-US' }).t;

// Local time on 2026-11-03 (a Tuesday), so weekday checks do not depend on the machine's zone.
const at = (hh, mm, day) => new Date(2026, 10, day || 3, hh, mm, 0).getTime();

function make(opts) {
  const fired = [];
  const clock = { now: at(8, 0) };
  const schedule = createSchedule(
    Object.assign({ now: () => clock.now, getT: () => tId, onDue: (text) => fired.push(text) }, opts || {})
  );
  return { schedule, fired, clock };
}

test('adding, listing and deleting', () => {
  const { schedule } = make();
  assert.match(schedule.run('', tId).text, /Belum ada jadwal/);
  const added = schedule.run('tambah 8:30 harian Minum obat', tId);
  assert.equal(added.ok, true);
  assert.match(added.text, /08:30/);
  assert.match(added.text, /setiap hari/);
  schedule.run('tambah 09:00 senin,rabu Rapat', tId);
  const list = schedule.run('daftar', tId).text;
  assert.match(list, /1\. 08:30/);
  assert.match(list, /2\. 09:00 · Senin, Rabu · Rapat/);
  assert.equal(schedule.run('hapus 1', tId).ok, true);
  assert.equal(schedule.list().length, 1);
  assert.equal(schedule.run('hapus 9', tId).ok, false);
  assert.equal(schedule.run('hapus abc', tId).ok, false);
});

test('English words work and the reply follows the language', () => {
  const { schedule } = make();
  assert.match(schedule.run('add 07:15 daily Stretch', tEn).text, /every day/);
  assert.match(schedule.run('add 10:00 Monday,friday Review', tEn).text, /Monday, Friday/);
  assert.match(schedule.run('list', tEn).text, /Your reminders/);
  assert.match(schedule.run('delete 1', tEn).text, /deleted/);
});

test('bad input is refused with a reason', () => {
  const { schedule } = make();
  assert.match(schedule.run('tambah 25:00 harian x', tId).text, /HH:MM/);
  assert.match(schedule.run('tambah 08:30 kapanpun x', tId).text, /Harinya/);
  assert.match(schedule.run('tambah 08:30 harian', tId).text, /isi pengingat/);
  assert.match(schedule.run('tambah', tId).text, /\/jadwal tambah/);
  assert.match(schedule.run('nonsense', tId).text, /\/jadwal tambah/);
  assert.equal(schedule.list().length, 0);
});

test('a secret-looking text is not stored', () => {
  const { schedule } = make();
  const res = schedule.run('tambah 08:30 harian simpan sk-abcdefghijklmnopqrstuvwxyz123456', tId);
  assert.equal(res.ok, false);
  assert.equal(schedule.list().length, 0);
});

test('the schedule has a cap', () => {
  const { schedule } = make();
  for (let i = 0; i < MAX_ENTRIES; i++) assert.equal(schedule.run('tambah 08:30 harian n' + i, tId).ok, true);
  assert.equal(schedule.run('tambah 08:30 harian lagi', tId).ok, false);
});

test('a reminder is spoken once, on time, and not again that day', () => {
  const { schedule, fired, clock } = make();
  schedule.run('tambah 08:30 harian Minum obat', tId);
  clock.now = at(8, 29);
  assert.equal(schedule.tick(), 0);
  clock.now = at(8, 30);
  assert.equal(schedule.tick(), 1);
  assert.deepEqual(fired, ['Rover, waktunya: Minum obat']);
  clock.now = at(8, 31);
  assert.equal(schedule.tick(), 0);
  clock.now = at(8, 30, 4); // next day
  assert.equal(schedule.tick(), 1);
});

test('weekday reminders only fire on those days', () => {
  const { schedule, clock } = make();
  schedule.run('tambah 09:00 rabu Rapat', tId); // Wednesday
  clock.now = at(9, 0, 3); // Tuesday
  assert.equal(schedule.tick(), 0);
  clock.now = at(9, 0, 4); // Wednesday
  assert.equal(schedule.tick(), 1);
});

test('a reminder that came due while closed is skipped, not run late', () => {
  const { schedule, fired, clock } = make();
  schedule.run('tambah 08:30 harian Minum obat', tId);
  clock.now = at(8, 30) + GRACE_MS + 1000;
  assert.equal(schedule.tick(), 0);
  assert.deepEqual(fired, []);
  clock.now = at(8, 30, 4); // tomorrow still works
  assert.equal(schedule.tick(), 1);
});

test('a reminder just inside the grace window is still spoken', () => {
  const { schedule, clock } = make();
  schedule.run('tambah 08:30 harian Minum obat', tId);
  clock.now = at(8, 30) + GRACE_MS - 1000;
  assert.equal(schedule.tick(), 1);
});

test('entries and the fired mark survive a restart, so a reminder is not repeated', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aem-sched-'));
  const first = make({ dir });
  first.schedule.run('tambah 08:30 harian Minum obat', tId);
  first.clock.now = at(8, 30);
  assert.equal(first.schedule.tick(), 1);

  const second = make({ dir });
  second.clock.now = at(8, 31);
  assert.equal(second.schedule.list().length, 1);
  assert.equal(second.schedule.tick(), 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'schedule.json'), 'utf8')).version, 1);
});

test('a corrupt file is moved aside and the schedule starts empty', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aem-sched-'));
  fs.writeFileSync(path.join(dir, 'schedule.json'), '{not json');
  const { schedule } = make({ dir, now: () => 7 });
  assert.equal(schedule.list().length, 0);
  assert.equal(fs.existsSync(path.join(dir, 'schedule.corrupt-7.json')), true);
});

test('hand-edited bad entries are dropped on load', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aem-sched-'));
  const good = { time: '08:30', days: 'daily', text: 'ok', lastFired: null };
  fs.writeFileSync(
    path.join(dir, 'schedule.json'),
    JSON.stringify({
      version: 1,
      entries: [good, { time: '99:99', days: 'daily', text: 'x' }, { time: '08:30', days: [9], text: 'x' }, 'junk'],
    })
  );
  assert.equal(make({ dir }).schedule.list().length, 1);
});

test('start and stop drive the tick with the given timer', () => {
  let handler = null;
  let cleared = false;
  const { schedule } = make({
    setTimer: (fn) => {
      handler = fn;
      return { unref() {} };
    },
    clearTimer: () => {
      cleared = true;
    },
  });
  schedule.start();
  schedule.start();
  assert.equal(typeof handler, 'function');
  schedule.stop();
  assert.equal(cleared, true);
});

test('the schedule texts exist in both languages', () => {
  const keys = [
    'usage', 'added', 'list_header', 'list_row', 'none', 'deleted', 'not_found', 'full',
    'bad_time', 'bad_when', 'empty_text', 'secret', 'due', 'daily_label', 'day_0', 'day_6',
  ];
  for (const t of [tId, tEn]) {
    for (const key of keys) assert.notEqual(t('schedule.' + key), 'schedule.' + key, key);
  }
});
