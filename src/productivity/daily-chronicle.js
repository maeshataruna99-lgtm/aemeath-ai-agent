'use strict';

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

function formatDailyChronicle(data) {
  const d = data || {};
  if (d.enabled === false) {
    return {
      enabled: false,
      text: 'Daily Chronicle sedang nonaktif, Rover. Kamu bisa menyalakannya di Pengaturan atau dengan /chronicle aktif.',
    };
  }

  const lines = ['=== Daily Chronicle ==='];
  const todayDate = d.date || new Date().toISOString().slice(0, 10);
  lines.push('Tanggal: ' + todayDate);

  // 1. What was done & duration (strictly verified local facts)
  let hasWorkDone = false;
  const workLines = [];

  if (Array.isArray(d.sessions) && d.sessions.length > 0) {
    const totalFocusMs = d.sessions.reduce((acc, s) => acc + (s.elapsedMs || 0), 0);
    workLines.push('• Total sesi fokus (' + d.sessions.length + ' sesi): ' + formatDuration(totalFocusMs));
    for (const s of d.sessions.slice(-3)) {
      workLines.push('  - ' + s.task + ' (' + formatDuration(s.elapsedMs) + ')');
    }
    hasWorkDone = true;
  }

  if (d.activitySummary) {
    workLines.push('• Waktu aktivitas (Medium/Full): ' + d.activitySummary);
    hasWorkDone = true;
  }

  if (hasWorkDone) {
    lines.push('\n[Yang Dikerjakan Hari Ini]');
    lines.push(...workLines);
  } else {
    lines.push('\n[Yang Dikerjakan Hari Ini]');
    lines.push('• Belum ada sesi fokus atau rekaman aktivitas tercatat hari ini.');
  }

  // 2. What remains (Daily Quest & Todos)
  lines.push('\n[Yang Tersisa]');
  let hasPending = false;

  if (Array.isArray(d.quests)) {
    const pendingQuests = d.quests.filter((q) => !q.done);
    const doneQuests = d.quests.filter((q) => q.done);
    lines.push('• Daily Quest: ' + doneQuests.length + ' selesai, ' + pendingQuests.length + ' tersisa');
    for (const q of pendingQuests) {
      lines.push('  [ ] ' + q.text);
      hasPending = true;
    }
  }

  if (Array.isArray(d.todos)) {
    const pendingTodos = d.todos.filter((t) => !t.done);
    if (pendingTodos.length > 0) {
      lines.push('• Tugas tertunda (/todo): ' + pendingTodos.length + ' item');
      for (const t of pendingTodos.slice(0, 5)) {
        lines.push('  [ ] ' + t.text);
      }
      hasPending = true;
    }
  }

  if (!hasPending) {
    lines.push('• Semua prioritas hari ini sudah tuntas! Waktunya istirahat, Rover~');
  }

  return {
    enabled: true,
    text: lines.join('\n'),
    lines: lines,
  };
}

module.exports = { formatDailyChronicle };
