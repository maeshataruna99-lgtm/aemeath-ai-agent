'use strict';

// Local productivity tools (/timer, /todo, /note, /stats) that run entirely on
// this machine without calling the chat model or the network. Todos and notes
// are stored in productivity.json in the app data folder; timers and activity
// summaries live in memory only.

const fs = require('node:fs');
const path = require('node:path');
const { containsSecret } = require('../chat/chat-error');
const { formatDailyChronicle } = require('./daily-chronicle');

const FILE_NAME = 'productivity.json';
const MAX_ITEMS = 30;
const MAX_QUESTS = 3;
const MAX_TEXT = 240;
const MIN_TIMER_MS = 10 * 1000;
const MAX_TIMER_MS = 240 * 60 * 1000;
const POMODORO_MS = 25 * 60 * 1000;

function toDateKey(timestamp) {
  const d = new Date(timestamp);
  return d.toISOString().slice(0, 10);
}

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

function normalizeState(raw, nowMs) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const todos = Array.isArray(obj.todos)
    ? obj.todos
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const text = cleanText(item.text, MAX_TEXT);
          if (!text || containsSecret(text)) return null;
          return { text: text, done: Boolean(item.done) };
        })
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
    : [];
  const notes = Array.isArray(obj.notes)
    ? obj.notes
        .map((item) => {
          const text = cleanText(typeof item === 'string' ? item : item && item.text, MAX_TEXT);
          return text && !containsSecret(text) ? { text: text } : null;
        })
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
    : [];
  const questDate = typeof obj.questDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.questDate)
    ? obj.questDate
    : toDateKey(nowMs || Date.now());
  const quests = Array.isArray(obj.quests)
    ? obj.quests
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const text = cleanText(item.text, MAX_TEXT);
          if (!text || containsSecret(text)) return null;
          const q = {
            text: text,
            done: Boolean(item.done),
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : (nowMs || Date.now()),
          };
          if (item.todoText) {
            q.todoText = cleanText(item.todoText, MAX_TEXT);
          }
          return q;
        })
        .filter(Boolean)
        .slice(0, MAX_QUESTS)
    : [];
  const questHistory = Array.isArray(obj.questHistory)
    ? obj.questHistory
        .map((item) => {
          if (!item || typeof item !== 'object' || typeof item.date !== 'string') return null;
          const histQuests = Array.isArray(item.quests)
            ? item.quests
                .map((q) => {
                  if (!q || typeof q !== 'object') return null;
                  const text = cleanText(q.text, MAX_TEXT);
                  return text ? { text: text, done: Boolean(q.done) } : null;
                })
                .filter(Boolean)
            : [];
          return { date: item.date, quests: histQuests };
        })
        .filter(Boolean)
        .slice(-30)
    : [];
  return {
    todos: todos,
    notes: notes,
    quests: quests,
    questHistory: questHistory,
    questDate: questDate,
  };
}

// options: { dir, onTimerDone?({ label, durationMs, text }), getActivitySummary?() -> string|null,
//            now?() -> number, setTimer?(fn, ms), clearTimer?(id), workSession? }
function createProductivityHub(options) {
  const opts = options || {};
  const file = opts.dir ? path.join(opts.dir, FILE_NAME) : null;
  const now = opts.now || Date.now;
  const setTimer = opts.setTimer || setTimeout;
  const clearTimer = opts.clearTimer || clearTimeout;
  const onTimerDone = opts.onTimerDone || function () {};
  const onQuestDone = typeof opts.onQuestDone === 'function' ? opts.onQuestDone : function () {};
  const getActivitySummary = opts.getActivitySummary || (() => null);
  const getChronicleEnabled = typeof opts.getChronicleEnabled === 'function' ? opts.getChronicleEnabled : (() => false);
  const setChronicleEnabled = typeof opts.setChronicleEnabled === 'function' ? opts.setChronicleEnabled : (() => {});
  const workSession = opts.workSession || null;

  let state = {
    todos: [],
    notes: [],
    quests: [],
    questHistory: [],
    questDate: toDateKey(now()),
  };
  let activeTimer = null; // { handle, endsAt, durationMs, label }

  if (file) {
    try {
      state = normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')), now());
    } catch {
      state = {
        todos: [],
        notes: [],
        quests: [],
        questHistory: [],
        questDate: toDateKey(now()),
      };
    }
  }

  function rolloverQuestsIfNeeded() {
    const today = toDateKey(now());
    if (state.questDate !== today) {
      if (state.quests.length > 0) {
        state.questHistory.push({
          date: state.questDate,
          quests: state.quests.map((q) => ({ text: q.text, done: Boolean(q.done) })),
        });
        if (state.questHistory.length > 30) {
          state.questHistory = state.questHistory.slice(-30);
        }
      }
      state.quests = state.quests.filter((q) => !q.done);
      state.questDate = today;
      persist();
    }
  }

  rolloverQuestsIfNeeded();

  function persist() {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
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
    if (workSession) workSession.finish();
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
      if (workSession) workSession.cancel();
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
    if (workSession) {
      workSession.start({ task: parsed.label || 'Sesi fokus timer', durationMs: parsed.ms });
    }

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

    const allDoneMatch = /^(?:selesai|done|cek|centang)\s+(?:semua|all)$/i.test(arg);
    if (allDoneMatch) {
      if (state.todos.length === 0) {
        return { ok: false, text: 'Daftar tugasmu masih kosong, Rover.' };
      }
      for (const t of state.todos) {
        t.done = true;
      }
      for (const q of state.quests) {
        for (const t of state.todos) {
          if (!q.done && (q.todoText === t.text || q.text === t.text)) {
            q.done = true;
            onQuestDone(q);
          }
        }
      }
      persist();
      return {
        ok: true,
        text: 'Luar biasa, Rover! Semua tugas di daftar sudah ditandai selesai~',
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
      for (const q of state.quests) {
        if (!q.done && (q.todoText === state.todos[idx].text || q.text === state.todos[idx].text)) {
          q.done = true;
          onQuestDone(q);
        }
      }
      persist();
      return {
        ok: true,
        text: 'Mantap! Tugas #' + (idx + 1) + ' ("' + state.todos[idx].text + '") ditandai selesai~',
        output: formatTodoList(),
      };
    }

    const focusMatch = /^(?:fokus|focus|mulai|start)\s+(\d+)$/i.exec(arg);
    if (focusMatch) {
      const idx = parseInt(focusMatch[1], 10) - 1;
      if (idx < 0 || idx >= state.todos.length) {
        return { ok: false, text: 'Nomor tugas tidak ditemukan, Rover. Ketik /todo untuk melihat nomornya.' };
      }
      const todo = state.todos[idx];
      clearActiveTimer();
      const durationMs = POMODORO_MS;
      const endsAt = now() + durationMs;
      const handle = setTimer(fireTimer, durationMs);
      if (handle && typeof handle.unref === 'function') handle.unref();
      activeTimer = {
        handle: handle,
        endsAt: endsAt,
        durationMs: durationMs,
        label: todo.text,
      };
      if (workSession) {
        workSession.start({ task: todo.text, durationMs: durationMs });
      }
      return {
        ok: true,
        text: 'Sesi fokus dimulai untuk tugas #' + (idx + 1) + ' ("' + todo.text + '") selama 25 menit. Semangat, Rover~',
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
    if (containsSecret(text)) {
      return {
        ok: false,
        text: 'Jangan simpan API key atau kunci rahasia di daftar tugas ya, Rover! Simpan kunci di Pengaturan → Chatbot agar dienkripsi dengan aman.',
      };
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
    if (containsSecret(text)) {
      return {
        ok: false,
        text: 'Jangan simpan API key atau kunci rahasia di catatan teks biasa ya, Rover! Simpan kunci di Pengaturan → Chatbot agar dienkripsi dengan aman.',
      };
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
    rolloverQuestsIfNeeded();
    const pendingTodos = state.todos.filter((t) => !t.done).length;
    const doneTodos = state.todos.length - pendingTodos;
    const pendingQuests = state.quests.filter((q) => !q.done).length;
    const doneQuests = state.quests.length - pendingQuests;
    const lines = [];

    if (activeTimer) {
      const remaining = Math.max(0, activeTimer.endsAt - now());
      const label = activeTimer.label ? ' (' + activeTimer.label + ')' : '';
      lines.push('Timer aktif: sisa ' + formatDuration(remaining) + label);
    } else {
      lines.push('Timer fokus: tidak ada yang berjalan');
    }

    lines.push('Daily Quest (/quest): ' + doneQuests + '/' + state.quests.length + ' selesai');
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

  function formatQuestList() {
    if (state.quests.length === 0) return '';
    return state.quests
      .map((item, idx) => {
        const check = item.done ? '\u2713' : ' ';
        const link = item.todoText ? ' (ditautkan ke /todo)' : '';
        return idx + 1 + '. [' + check + '] ' + item.text + link;
      })
      .join('\n');
  }

  function runQuest(rawArg) {
    rolloverQuestsIfNeeded();
    const arg = cleanText(rawArg, MAX_TEXT + 20);

    if (!arg || /^(list|daftar|lihat)$/i.test(arg)) {
      if (state.quests.length === 0) {
        return {
          ok: true,
          text: 'Belum ada daily quest untuk hari ini, Rover. Tambahkan maksimal 3 prioritas dengan /quest tambah <tugas> atau /quest todo <nomor>.',
        };
      }
      const pendingCount = state.quests.filter((q) => !q.done).length;
      return {
        ok: true,
        text: 'Ini 3 prioritas utamamu hari ini (' + pendingCount + ' belum selesai):',
        output: formatQuestList(),
      };
    }

    const allQuestDoneMatch = /^(?:selesai|done|cek|centang)\s+(?:semua|all)$/i.test(arg);
    if (allQuestDoneMatch) {
      if (state.quests.length === 0) {
        return { ok: false, text: 'Belum ada daily quest untuk hari ini, Rover.' };
      }
      for (const q of state.quests) {
        if (!q.done) {
          q.done = true;
          onQuestDone(q);
        }
      }
      persist();
      return {
        ok: true,
        text: 'Hebat banget, Rover! Semua daily quest hari ini sudah selesai~',
        output: formatQuestList(),
      };
    }

    const doneMatch = /^(?:selesai|done|cek|centang)\s+(\d+)$/i.exec(arg);
    if (doneMatch) {
      const idx = parseInt(doneMatch[1], 10) - 1;
      if (idx < 0 || idx >= state.quests.length) {
        return { ok: false, text: 'Nomor daily quest tidak ditemukan, Rover. Ketik /quest untuk melihat daftar prioritasmu.' };
      }
      state.quests[idx].done = true;
      onQuestDone(state.quests[idx]);
      persist();
      return {
        ok: true,
        text: 'Hebat, Rover! Daily quest #' + (idx + 1) + ' ("' + state.quests[idx].text + '") sudah selesai~ Fokusmu luar biasa!',
        output: formatQuestList(),
      };
    }

    const todoMatch = /^(?:todo)\s+(\d+)$/i.exec(arg);
    if (todoMatch) {
      const todoIdx = parseInt(todoMatch[1], 10) - 1;
      if (todoIdx < 0 || todoIdx >= state.todos.length) {
        return { ok: false, text: 'Nomor tugas /todo tidak ditemukan, Rover. Cek nomor dengan /todo dulu ya.' };
      }
      if (state.quests.length >= MAX_QUESTS) {
        return {
          ok: false,
          text: 'Daily quest sudah mencapai batas 3 prioritas hari ini, Rover. Batas 3 item ini untuk menjaga fokusmu agar tidak kewalahan!',
        };
      }
      const targetTodo = state.todos[todoIdx];
      state.quests.push({
        text: targetTodo.text,
        done: targetTodo.done,
        todoText: targetTodo.text,
        createdAt: now(),
      });
      persist();
      return {
        ok: true,
        text: 'Tugas #' + (todoIdx + 1) + ' ("' + targetTodo.text + '") ditautkan ke daily quest hari ini!',
        output: formatQuestList(),
      };
    }

    const delMatch = /^(?:hapus|del|delete|rm)\s+(\d+)$/i.exec(arg);
    if (delMatch) {
      const idx = parseInt(delMatch[1], 10) - 1;
      if (idx < 0 || idx >= state.quests.length) {
        return { ok: false, text: 'Nomor daily quest tidak ditemukan, Rover.' };
      }
      const removed = state.quests.splice(idx, 1)[0];
      persist();
      return {
        ok: true,
        text: 'Daily quest "' + removed.text + '" sudah kuhapus.',
        output: formatQuestList(),
      };
    }

    if (/^(?:riwayat|history)$/i.test(arg)) {
      if (state.questHistory.length === 0) {
        return { ok: true, text: 'Belum ada riwayat daily quest hari sebelumnya, Rover.' };
      }
      const histText = state.questHistory
        .map((h) => {
          const lines = h.quests.map((q) => '  [' + (q.done ? '\u2713' : ' ') + '] ' + q.text);
          return h.date + ':\n' + lines.join('\n');
        })
        .join('\n\n');
      return {
        ok: true,
        text: 'Riwayat daily quest hari-hari sebelumnya:',
        output: histText,
      };
    }

    if (/^(?:bersih|clear|reset)$/i.test(arg)) {
      const hadDone = state.quests.some((q) => q.done);
      state.quests = hadDone ? state.quests.filter((q) => !q.done) : [];
      persist();
      return {
        ok: true,
        text: hadDone
          ? 'Daily quest yang sudah selesai kubersihkan dari daftar hari ini, Rover.'
          : 'Daftar daily quest hari ini sudah kubersihkan, Rover.',
        output: formatQuestList(),
      };
    }

    const text = cleanText(arg.replace(/^(?:tambah|add|baru)\s+/i, ''), MAX_TEXT);
    if (!text) {
      return { ok: false, text: 'Tulis isi daily quest-nya juga ya, misalnya /quest tambah Selesaikan modul auth.' };
    }
    if (containsSecret(text)) {
      return {
        ok: false,
        text: 'Jangan simpan kunci rahasia di daily quest ya, Rover!',
      };
    }
    if (state.quests.length >= MAX_QUESTS) {
      return {
        ok: false,
        text: 'Daily quest sudah mencapai batas maksimal 3 prioritas hari ini, Rover. Fokus pada hal penting tanpa membebani dirimu~',
      };
    }
    state.quests.push({ text: text, done: false, createdAt: now() });
    persist();
    return {
      ok: true,
      text: 'Prioritas #' + state.quests.length + ' dicatat ke Daily Quest hari ini!',
      output: formatQuestList(),
    };
  }

  function runFocus(rawArg) {
    const arg = cleanText(rawArg, 120);

    if (!arg || /^(status|cek|lihat)$/i.test(arg)) {
      if (!workSession || !workSession.active) {
        return {
          ok: true,
          text: 'Belum ada sesi fokus aktif, Rover. Mulai dengan /focus 25m <tugas> atau /todo fokus <nomor>.',
        };
      }
      const cur = workSession.current();
      const rem = cur && cur.endsAt ? Math.max(0, cur.endsAt - now()) : null;
      const remText = rem ? ': sisa ' + formatDuration(rem) : '';
      return {
        ok: true,
        text: 'Sesi fokus aktif untuk "' + (cur && cur.task ? cur.task : 'tanpa label') + '"' + remText + '.',
      };
    }

    if (/^(selesai|finish|done)$/i.test(arg)) {
      if (!workSession || !workSession.active) {
        return { ok: false, text: 'Tidak ada sesi fokus yang sedang berjalan, Rover.' };
      }
      clearActiveTimer();
      const finished = workSession.finish();
      return {
        ok: true,
        text: finished ? finished.summaryText : 'Sesi fokus selesai.',
      };
    }

    if (/^(batal|stop|cancel|reset)$/i.test(arg)) {
      if (!workSession || !workSession.active) {
        return { ok: false, text: 'Tidak ada sesi fokus yang sedang berjalan, Rover.' };
      }
      clearActiveTimer();
      workSession.cancel();
      return { ok: true, text: 'Sesi fokus dibatalkan, Rover.' };
    }

    // Starting a new focus session directly: e.g. /focus 25m Kerjakan API
    const parsed = parseDurationMs(arg);
    const durationMs = parsed ? parsed.ms : POMODORO_MS;
    const task = parsed && parsed.label ? parsed.label : arg;

    clearActiveTimer();
    const endsAt = now() + durationMs;
    const handle = setTimer(fireTimer, durationMs);
    if (handle && typeof handle.unref === 'function') handle.unref();
    activeTimer = {
      handle: handle,
      endsAt: endsAt,
      durationMs: durationMs,
      label: task,
    };
    if (workSession) {
      workSession.start({ task: task, durationMs: durationMs });
    }
    return {
      ok: true,
      text: 'Sesi fokus dimulai: "' + task + '" (' + formatDuration(durationMs) + '). Semangat, Rover~',
    };
  }

  function runChronicle(rawArg) {
    rolloverQuestsIfNeeded();
    const arg = cleanText(rawArg, 40).toLowerCase();

    if (arg === 'aktif' || arg === 'on' || arg === 'enable') {
      setChronicleEnabled(true);
      return { ok: true, text: 'Daily Chronicle telah diaktifkan, Rover! Ketik /chronicle untuk melihat ringkasan harimu.' };
    }

    if (arg === 'nonaktif' || arg === 'off' || arg === 'disable') {
      setChronicleEnabled(false);
      return { ok: true, text: 'Daily Chronicle telah dinonaktifkan, Rover.' };
    }

    const isEnabled = getChronicleEnabled();
    const chronicle = formatDailyChronicle({
      enabled: isEnabled,
      date: state.questDate,
      activitySummary: getActivitySummary(),
      sessions: workSession ? workSession.history : [],
      quests: state.quests,
      todos: state.todos,
    });

    if (!chronicle.enabled) {
      return {
        ok: true,
        text: chronicle.text,
      };
    }

    return {
      ok: true,
      text: 'Ini Daily Chronicle harimu, Rover:',
      output: chronicle.text,
    };
  }

  function asBuiltins() {
    return {
      timer: {
        description: 'Pasang timer fokus atau Pomodoro (mis. /timer 25m Fokus)',
        run: async (arg) => runTimer(arg),
      },
      todo: {
        description: 'Kelola daftar tugas cepat (mis. /todo tambah ..., /todo fokus <nomor>)',
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
      focus: {
        description: 'Kelola sesi fokus terorkestrasi (mis. /focus 25m <tugas>, /focus selesai, /focus status)',
        run: async (arg) => runFocus(arg),
      },
      quest: {
        description: 'Kelola prioritas harian/daily quest (maks. 3) (mis. /quest tambah ..., /quest todo <nomor>)',
        run: async (arg) => runQuest(arg),
      },
      daily: {
        description: 'Kelola prioritas harian/daily quest (alias untuk /quest)',
        run: async (arg) => runQuest(arg),
      },
      chronicle: {
        description: 'Lihat atau atur ringkasan harian (mis. /chronicle, /chronicle aktif|nonaktif)',
        run: async (arg) => runChronicle(arg),
      },
    };
  }

  return {
    runTimer: runTimer,
    runTodo: runTodo,
    runNote: runNote,
    runStats: runStats,
    runFocus: runFocus,
    runQuest: runQuest,
    runChronicle: runChronicle,
    asBuiltins: asBuiltins,
    stop: clearActiveTimer,
    get todos() {
      return state.todos.slice();
    },
    get notes() {
      return state.notes.slice();
    },
    get quests() {
      rolloverQuestsIfNeeded();
      return state.quests.slice();
    },
    get questHistory() {
      rolloverQuestsIfNeeded();
      return state.questHistory.slice();
    },
    get timerActive() {
      return activeTimer !== null;
    },
    get workSession() {
      return workSession;
    },
  };
}

module.exports = {
  createProductivityHub,
  parseDurationMs,
  formatDuration,
  FILE_NAME,
  MAX_ITEMS,
  MAX_QUESTS,
  MAX_TEXT,
};
