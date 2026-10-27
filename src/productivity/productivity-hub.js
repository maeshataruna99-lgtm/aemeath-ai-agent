'use strict';

// Local productivity tools (/timer, /todo, /note, /stats) that run entirely on
// this machine without calling the chat model or the network. Todos and notes
// are stored in productivity.json in the app data folder; timers and activity
// summaries live in memory only.

const fs = require('node:fs');
const path = require('node:path');

const FILE_NAME = 'productivity.json';
const MAX_ITEMS = 30;
const MAX_TEXT = 240;
const MIN_TIMER_MS = 10 * 1000;
const MAX_TIMER_MS = 240 * 60 * 1000;
const POMODORO_MS = 25 * 60 * 1000;

function cleanText(raw, maxLen) {
  return String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen || MAX_TEXT);
}

// Parses durations like "25", "25m", "90s", "1h30m", "1j 15m", "45 menit".
function parseDurationMs(text) {
  const input = String(text == null ? '' : text).trim();
  if (!input) return null;

  const plainMinutes = /^(\d+(?:[.,]\d+)?)\s*(?:m|menit|min)?(?:\s+(.*))?$/i.exec(input);
  if (plainMinutes) {
    const mins = parseFloat(plainMinutes[1].replace(',', '.'));
    if (!Number.isFinite(mins) || mins <= 0) return null;
    return {
      ms: Math.round(mins * 60 * 1000),
      label: cleanText(plainMinutes[2] || '', 80),
    };
  }

  const unitPattern = /^((?:\d+\s*(?:h|j|jam|m|menit|min|s|d|detik|sec)\s*)+)(.*)$/i.exec(input);
  if (!unitPattern) return null;

  const spec = unitPattern[1];
  const label = cleanText(unitPattern[2] || '', 80);
  let totalMs = 0;
  const tokenRegex = /(\d+)\s*(h|j|jam|m|menit|min|s|d|detik|sec)/gi;
  let match;
  while ((match = tokenRegex.exec(spec)) !== null) {
    const val = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (unit === 'h' || unit === 'j' || unit === 'jam') totalMs += val * 3600 * 1000;
    else if (unit === 'm' || unit === 'menit' || unit === 'min') totalMs += val * 60 * 1000;
    else totalMs += val * 1000;
  }
  if (totalMs <= 0) return null;
  return { ms: totalMs, label: label };
}

function formatDuration(ms) {
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts = [];
  if (hours > 0) parts.push(hours + ' jam');
  if (mins > 0) parts.push(mins + ' menit');
  if (secs > 0 && hours === 0) parts.push(secs + ' detik');
  return parts.join(' ');
}

function normalizeState(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const todos = Array.isArray(obj.todos)
    ? obj.todos
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const text = cleanText(item.text, MAX_TEXT);
          if (!text) return null;
          return { text: text, done: Boolean(item.done) };
        })
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
    : [];
  const notes = Array.isArray(obj.notes)
    ? obj.notes
        .map((item) => {
          const text = cleanText(typeof item === 'string' ? item : item && item.text, MAX_TEXT);
          return text ? { text: text } : null;
        })
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
    : [];
  return { todos: todos, notes: notes };
}

// options: { dir, onTimerDone?({ label, durationMs, text }), getActivitySummary?() -> string|null,
//            now?() -> number, setTimer?(fn, ms), clearTimer?(id) }
function createProductivityHub(options) {
  const opts = options || {};
  const file = opts.dir ? path.join(opts.dir, FILE_NAME) : null;
  const now = opts.now || Date.now;
  const setTimer = opts.setTimer || setTimeout;
  const clearTimer = opts.clearTimer || clearTimeout;
  const onTimerDone = opts.onTimerDone || function () {};
  const getActivitySummary = opts.getActivitySummary || (() => null);

  let state = { todos: [], notes: [] };
  let activeTimer = null; // { handle, endsAt, durationMs, label }

  if (file) {
    try {
      state = normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      state = { todos: [], notes: [] };
    }
  }

  function persist() {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(state, null, 2));
    } catch {
      // best effort: keeps working in memory for this session
    }
  }

  function clearActiveTimer() {
    if (!activeTimer) return;
    clearTimer(activeTimer.handle);
    activeTimer = null;
  }

  function fireTimer() {
    if (!activeTimer) return;
    const finished = activeTimer;
    activeTimer = null;
    const suffix = finished.label ? ' (' + finished.label + ')' : '';
    const text =
      'Rover, waktu ' +
      formatDuration(finished.durationMs) +
      suffix +
      ' sudah selesai! Istirahat sebentar atau tarik napas dulu, ya~';
    onTimerDone({ label: finished.label, durationMs: finished.durationMs, text: text });
  }

  function runTimer(rawArg) {
    const arg = cleanText(rawArg, 120);
    if (!arg || /^(status|cek|lihat)$/i.test(arg)) {
      if (!activeTimer) {
        return {
          ok: true,
          text: 'Belum ada timer yang berjalan, Rover. Ketik misalnya /timer 25m Fokus ngoding atau /timer pomodoro.',
        };
      }
      const remaining = Math.max(0, activeTimer.endsAt - now());
      const note = activeTimer.label ? ' untuk "' + activeTimer.label + '"' : '';
      return {
        ok: true,
        text: 'Timer masih berjalan' + note + ': sisa ' + formatDuration(remaining) + '.',
      };
    }

    if (/^(batal|stop|cancel|reset|matikan)$/i.test(arg)) {
      if (!activeTimer) {
        return { ok: false, text: 'Tidak ada timer yang sedang berjalan, Rover.' };
      }
      const oldLabel = activeTimer.label;
      clearActiveTimer();
      return {
        ok: true,
        text: 'Oke, timer' + (oldLabel ? ' "' + oldLabel + '"' : '') + ' sudah kubatalkan.',
      };
    }

    let parsed = null;
    if (/^pomodoro(?:\s+(.*))?$/i.test(arg)) {
      const match = /^pomodoro(?:\s+(.*))?$/i.exec(arg);
      parsed = { ms: POMODORO_MS, label: cleanText((match && match[1]) || 'Pomodoro fokus', 80) };
    } else {
      parsed = parseDurationMs(arg);
    }

    if (!parsed) {
      return {
        ok: false,
        text: 'Format waktunya belum kupahami, Rover. Coba /timer 25m Fokus, /timer 90s, /timer pomodoro, atau /timer batal.',
      };
    }
    if (parsed.ms < MIN_TIMER_MS || parsed.ms > MAX_TIMER_MS) {
      return {
        ok: false,
        text: 'Durasi timer harus antara 10 detik dan 240 menit (4 jam), Rover.',
      };
    }

    clearActiveTimer();
    const endsAt = now() + parsed.ms;
    const handle = setTimer(fireTimer, parsed.ms);
    if (handle && typeof handle.unref === 'function') handle.unref();
    activeTimer = {
      handle: handle,
      endsAt: endsAt,
      durationMs: parsed.ms,
      label: parsed.label,
    };

    const labelNote = parsed.label ? ' untuk "' + parsed.label + '"' : '';
    return {
      ok: true,
      text: 'Siap, Rover! Timer ' + formatDuration(parsed.ms) + labelNote + ' dimulai. Nanti kupanggil kalau sudah selesai~',
    };
  }

  function formatTodoList() {
    if (state.todos.length === 0) return '';
    return state.todos
      .map((item, idx) => idx + 1 + '. [' + (item.done ? '\u2713' : ' ') + '] ' + item.text)
      .join('\n');
  }

  function runTodo(rawArg) {
    const arg = cleanText(rawArg, MAX_TEXT + 20);
    if (!arg || /^(list|daftar|lihat)$/i.test(arg)) {
      if (state.todos.length === 0) {
        return {
          ok: true,
          text: 'Daftar tugasmu masih kosong, Rover. Tambah dengan /todo tambah <tugas>.',
        };
      }
      const pendingCount = state.todos.filter((t) => !t.done).length;
      return {
        ok: true,
        text: 'Ini daftar tugasmu (' + pendingCount + ' belum selesai):',
        output: formatTodoList(),
      };
    }

    const doneMatch = /^(?:selesai|done|cek|centang)\s+(\d+)$/i.exec(arg);
    if (doneMatch) {
      const idx = parseInt(doneMatch[1], 10) - 1;
      if (idx < 0 || idx >= state.todos.length) {
        return { ok: false, text: 'Nomor tugas tidak ditemukan, Rover. Ketik /todo untuk melihat nomornya.' };
      }
      state.todos[idx].done = true;
      persist();
      return {
        ok: true,
        text: 'Mantap! Tugas #' + (idx + 1) + ' ("' + state.todos[idx].text + '") ditandai selesai~',
        output: formatTodoList(),
      };
    }

    const delMatch = /^(?:hapus|del|delete|rm)\s+(\d+)$/i.exec(arg);
    if (delMatch) {
      const idx = parseInt(delMatch[1], 10) - 1;
      if (idx < 0 || idx >= state.todos.length) {
        return { ok: false, text: 'Nomor tugas tidak ditemukan, Rover.' };
      }
      const removed = state.todos.splice(idx, 1)[0];
      persist();
      return {
        ok: true,
        text: 'Tugas "' + removed.text + '" sudah kuhapus.',
        output: formatTodoList(),
      };
    }

    if (/^(?:bersih|clear|reset)$/i.test(arg)) {
      const hadDone = state.todos.some((t) => t.done);
      state.todos = hadDone ? state.todos.filter((t) => !t.done) : [];
      persist();
      return {
        ok: true,
        text: hadDone
          ? 'Tugas yang sudah selesai kubersihkan, Rover.'
          : 'Semua daftar tugas sudah kubersihkan, Rover.',
        output: formatTodoList(),
      };
    }

    const text = cleanText(arg.replace(/^(?:tambah|add|baru)\s+/i, ''), MAX_TEXT);
    if (!text) {
      return { ok: false, text: 'Tulis isi tugasnya juga ya, misalnya /todo tambah Perbaiki bug login.' };
    }
    if (state.todos.length >= MAX_ITEMS) {
      return {
        ok: false,
        text: 'Daftar tugas penuh (maksimal ' + MAX_ITEMS + '). Hapus atau bersihkan dulu dengan /todo bersih.',
      };
    }
    state.todos.push({ text: text, done: false });
    persist();
    return {
      ok: true,
      text: 'Dicatat ke daftar tugas (#' + state.todos.length + '), Rover!',
      output: formatTodoList(),
    };
  }

  function formatNoteList() {
    if (state.notes.length === 0) return '';
    return state.notes.map((item, idx) => idx + 1 + '. ' + item.text).join('\n');
  }

  function runNote(rawArg) {
    const arg = cleanText(rawArg, MAX_TEXT + 20);
    if (!arg || /^(list|daftar|lihat)$/i.test(arg)) {
      if (state.notes.length === 0) {
        return {
          ok: true,
          text: 'Belum ada catatan cepat, Rover. Ketik /note <isi catatan> untuk menyimpan.',
        };
      }
      return {
        ok: true,
        text: 'Catatan yang kusimpan (' + state.notes.length + '):',
        output: formatNoteList(),
      };
    }

    const delMatch = /^(?:hapus|del|delete|rm)\s+(\d+)$/i.exec(arg);
    if (delMatch) {
      const idx = parseInt(delMatch[1], 10) - 1;
      if (idx < 0 || idx >= state.notes.length) {
        return { ok: false, text: 'Nomor catatan tidak ditemukan, Rover.' };
      }
      const removed = state.notes.splice(idx, 1)[0];
      persist();
      return {
        ok: true,
        text: 'Catatan "' + removed.text + '" sudah kuhapus.',
        output: formatNoteList(),
      };
    }

    if (/^(?:bersih|clear|reset)$/i.test(arg)) {
      state.notes = [];
      persist();
      return { ok: true, text: 'Semua catatan cepat sudah kubersihkan, Rover.' };
    }

    const text = cleanText(arg.replace(/^(?:tambah|add|baru)\s+/i, ''), MAX_TEXT);
    if (!text) {
      return { ok: false, text: 'Tulis isi catatannya ya, misalnya /note Cek ulang konfigurasi API.' };
    }
    if (state.notes.length >= MAX_ITEMS) {
      return {
        ok: false,
        text: 'Catatan penuh (maksimal ' + MAX_ITEMS + '). Hapus dulu dengan /note hapus <nomor> atau /note bersih.',
      };
    }
    state.notes.push({ text: text });
    persist();
    return {
      ok: true,
      text: 'Catatan #' + state.notes.length + ' tersimpan, Rover!',
      output: formatNoteList(),
    };
  }

  function runStats() {
    const pendingTodos = state.todos.filter((t) => !t.done).length;
    const doneTodos = state.todos.length - pendingTodos;
    const lines = [];

    if (activeTimer) {
      const remaining = Math.max(0, activeTimer.endsAt - now());
      const label = activeTimer.label ? ' (' + activeTimer.label + ')' : '';
      lines.push('Timer aktif: sisa ' + formatDuration(remaining) + label);
    } else {
      lines.push('Timer fokus: tidak ada yang berjalan');
    }

    lines.push('Tugas (/todo): ' + pendingTodos + ' belum selesai, ' + doneTodos + ' selesai');
    lines.push('Catatan (/note): ' + state.notes.length + ' tersimpan');

    const activitySummary = getActivitySummary();
    if (activitySummary) {
      lines.push('Aktivitas sesi ini (Medium): ' + activitySummary);
    } else {
      lines.push('Aktivitas sesi ini: nyalakan mode interaktif Medium di Pengaturan untuk melihat rekap waktu per kategori');
    }

    return {
      ok: true,
      text: 'Ini ringkasan produktivitasmu saat ini, Rover:',
      output: lines.join('\n'),
    };
  }

  function asBuiltins() {
    return {
      timer: {
        description: 'Pasang timer fokus atau Pomodoro (mis. /timer 25m Fokus)',
        run: async (arg) => runTimer(arg),
      },
      todo: {
        description: 'Kelola daftar tugas cepat (mis. /todo tambah ...)',
        run: async (arg) => runTodo(arg),
      },
      note: {
        description: 'Simpan atau lihat catatan cepat (mis. /note ...)',
        run: async (arg) => runNote(arg),
      },
      stats: {
        description: 'Lihat ringkasan fokus, timer, dan tugas',
        run: async () => runStats(),
      },
    };
  }

  return {
    runTimer: runTimer,
    runTodo: runTodo,
    runNote: runNote,
    runStats: runStats,
    asBuiltins: asBuiltins,
    stop: clearActiveTimer,
    get todos() {
      return state.todos.slice();
    },
    get notes() {
      return state.notes.slice();
    },
    get timerActive() {
      return activeTimer !== null;
    },
  };
}

module.exports = {
  createProductivityHub,
  parseDurationMs,
  formatDuration,
  FILE_NAME,
  MAX_ITEMS,
  MAX_TEXT,
};
