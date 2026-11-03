'use strict';

// Recurring text reminders: /jadwal. Each entry is a time of day, either every day
// or on chosen weekdays, and a short line Aemeath says when the time comes.
//
// Local only: no model, no network. A reminder is spoken only while Aemeath is
// running. One that came due while she was closed (or the computer slept past the
// grace window) is skipped and the next day's still happens, so nothing runs
// quietly after a long absence.
//
// Stored as one small versioned JSON file in the app data folder. Without `dir`
// the schedule lives in memory only (tests).

const fs = require('node:fs');
const path = require('node:path');
const { containsSecret } = require('../chat/chat-error');

const FILE_NAME = 'schedule.json';
const VERSION = 1;
const MAX_ENTRIES = 20;
const MAX_TEXT = 120;
const TICK_MS = 20000;
// How late a reminder may still be spoken. Past this it counts as missed.
const GRACE_MS = 2 * 60 * 1000;

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DAY_NAMES = {
  0: ['minggu', 'sunday', 'sun'],
  1: ['senin', 'monday', 'mon'],
  2: ['selasa', 'tuesday', 'tue'],
  3: ['rabu', 'wednesday', 'wed'],
  4: ['kamis', 'thursday', 'thu'],
  5: ['jumat', 'friday', 'fri'],
  6: ['sabtu', 'saturday', 'sat'],
};

function cleanText(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function dateKey(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

// "harian" | "senin,rabu" -> 'daily' | [1, 3] | null
function parseWhen(raw) {
  const word = String(raw || '').toLowerCase();
  if (word === 'harian' || word === 'daily') return 'daily';
  const days = [];
  for (const part of word.split(',')) {
    const index = Object.keys(DAY_NAMES).find((k) => DAY_NAMES[k].includes(part));
    if (index === undefined) return null;
    if (!days.includes(Number(index))) days.push(Number(index));
  }
  return days.length ? days.sort() : null;
}

function validEntry(e) {
  return (
    e &&
    typeof e.text === 'string' &&
    TIME.test(String(e.time)) &&
    (e.days === 'daily' || (Array.isArray(e.days) && e.days.length > 0 && e.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)))
  );
}

// options: { dir?, now?() -> number, getT() -> t(key, params), onDue(text), setTimer?, clearTimer? }
function createSchedule(options) {
  const opts = options || {};
  const now = opts.now || Date.now;
  const getT = opts.getT;
  const onDue = opts.onDue || function () {};
  const setTimer = opts.setTimer || setInterval;
  const clearTimer = opts.clearTimer || clearInterval;
  const file = opts.dir ? path.join(opts.dir, FILE_NAME) : null;
  let entries = [];
  let timer = null;

  function save() {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: VERSION, entries }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  function load() {
    if (!file || !fs.existsSync(file)) return;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && data.version === VERSION && Array.isArray(data.entries)) {
        entries = data.entries.filter(validEntry).slice(0, MAX_ENTRIES);
        return;
      }
    } catch {
      // fall through: an unreadable file is set aside below
    }
    fs.renameSync(file, path.join(path.dirname(file), 'schedule.corrupt-' + now() + '.json'));
  }

  function whenText(t, entry) {
    if (entry.days === 'daily') return t('schedule.daily_label');
    return entry.days.map((d) => t('schedule.day_' + d)).join(', ');
  }

  function add(t, rest) {
    const m = rest.match(/^(\S+)\s+(\S+)\s+([\s\S]+)$/);
    if (!m) {
      const probe = rest.split(/\s+/);
      if (probe[0] && !TIME.test(probe[0])) return { ok: false, text: t('schedule.bad_time') };
      if (probe[1] && !parseWhen(probe[1])) return { ok: false, text: t('schedule.bad_when') };
      return { ok: false, text: probe.length >= 2 ? t('schedule.empty_text') : t('schedule.usage') };
    }
    const time = m[1].match(TIME);
    if (!time) return { ok: false, text: t('schedule.bad_time') };
    const days = parseWhen(m[2]);
    if (!days) return { ok: false, text: t('schedule.bad_when') };
    const text = cleanText(m[3]);
    if (!text) return { ok: false, text: t('schedule.empty_text') };
    if (containsSecret(text)) return { ok: false, text: t('schedule.secret') };
    if (entries.length >= MAX_ENTRIES) return { ok: false, text: t('schedule.full', { max: MAX_ENTRIES }) };
    const entry = { time: pad(Number(time[1])) + ':' + time[2], days, text, lastFired: null };
    entries.push(entry);
    save();
    return { ok: true, text: t('schedule.added', { time: entry.time, when: whenText(t, entry), text: entry.text }) };
  }

  function list(t) {
    if (entries.length === 0) return { ok: true, text: t('schedule.none') };
    const rows = entries.map((e, i) => t('schedule.list_row', { n: i + 1, time: e.time, when: whenText(t, e), text: e.text }));
    return { ok: true, text: [t('schedule.list_header')].concat(rows).join('\n') };
  }

  function remove(t, rest) {
    const n = Number(rest);
    if (!Number.isInteger(n) || n < 1 || n > entries.length) return { ok: false, text: t('schedule.not_found') };
    entries.splice(n - 1, 1);
    save();
    return { ok: true, text: t('schedule.deleted', { n: n }) };
  }

  // arg is whatever follows /jadwal; t is the translator for the active language.
  function run(arg, t) {
    const text = String(arg == null ? '' : arg).trim();
    if (!text) return list(t);
    const space = text.search(/\s/);
    const word = (space === -1 ? text : text.slice(0, space)).toLowerCase();
    const rest = space === -1 ? '' : text.slice(space).trim();
    if (word === 'tambah' || word === 'add') return add(t, rest);
    if (word === 'hapus' || word === 'delete') return remove(t, rest);
    if (word === 'daftar' || word === 'list') return list(t);
    return { ok: false, text: t('schedule.usage') };
  }

  // Speaks every reminder that came due within the grace window. Returns how many.
  function tick() {
    const nowMs = now();
    const date = new Date(nowMs);
    const key = dateKey(date);
    let fired = 0;
    for (const entry of entries) {
      if (entry.lastFired === key) continue;
      if (entry.days !== 'daily' && !entry.days.includes(date.getDay())) continue;
      const [hh, mm] = entry.time.split(':').map(Number);
      const due = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hh, mm).getTime();
      if (nowMs < due || nowMs - due > GRACE_MS) continue;
      entry.lastFired = key;
      fired++;
      onDue(getT()('schedule.due', { text: entry.text }));
    }
    if (fired) save();
    return fired;
  }

  function start() {
    if (timer) return;
    timer = setTimer(tick, TICK_MS);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  function stop() {
    if (timer) clearTimer(timer);
    timer = null;
  }

  load();
  return { run, tick, start, stop, list: () => entries.map((e) => Object.assign({}, e)) };
}

module.exports = { createSchedule, parseWhen, GRACE_MS, MAX_ENTRIES };
