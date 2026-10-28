'use strict';

// Orchestrated work session manager: unifies /timer, /todo, AI events, and local /review
// into an explicit session lifecycle.
//
// Key rule: session summaries strictly report available facts and explicitly mark
// unavailable data, NEVER inventing test results or commit status.

const { formatDuration } = require('./productivity-hub');

const MAX_TASK_LEN = 120;
const MAX_PROJECT_LEN = 60;
const MAX_HISTORY = 20;

function cleanText(raw, maxLen) {
  return String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen || MAX_TASK_LEN);
}

function formatSessionSummary(session, endedAt) {
  if (!session) return '';
  const elapsed = Math.max(0, (endedAt || Date.now()) - session.startedAt);
  const durationText = formatDuration(elapsed);

  const lines = [
    '=== Ringkasan Sesi Kerja ===',
    session.task ? 'Tugas: ' + session.task : '[Tugas: tidak ditentukan]',
    'Waktu fokus: ' + durationText,
  ];

  if (session.project) {
    lines.push('Proyek: ' + session.project);
  }

  // AI Events
  if (session.aiEvents && session.aiEvents.length > 0) {
    const eventSummaries = session.aiEvents
      .map((ev) => (ev.summary ? ev.summary : ev.type || 'turn'))
      .slice(-3)
      .join(', ');
    lines.push('Aktivitas AI: ' + session.aiEvents.length + ' event (' + eventSummaries + ')');
  } else {
    lines.push('[Sesi AI: tidak ada aktivitas]');
  }

  // Local Review
  if (session.review && session.review.summary) {
    lines.push('Review koding: ' + session.review.summary);
  } else {
    lines.push('[Review git: belum dijalankan]');
  }

  // Factual verification markers - explicitly stated if no verification tool ran
  lines.push('[Hasil tes: tidak ada data tes terverifikasi]');
  lines.push('[Status commit: tidak ada commit terverifikasi]');

  return lines.join('\n');
}

// options: { now?() -> number, onSessionFinished?(summary) }
function createWorkSessionManager(options) {
  const opts = options || {};
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const onSessionFinished = typeof opts.onSessionFinished === 'function' ? opts.onSessionFinished : null;

  let activeSession = null;
  let history = [];
  let seq = 0;

  function current() {
    return activeSession;
  }

  function start(params) {
    const p = params || {};
    // If a session is already running, finish it cleanly before starting a new one
    if (activeSession) {
      finish();
    }

    seq += 1;
    const task = cleanText(p.task, MAX_TASK_LEN) || null;
    const project = cleanText(p.project, MAX_PROJECT_LEN) || null;
    const startedAt = now();
    const durationMs = typeof p.durationMs === 'number' && p.durationMs > 0 ? p.durationMs : null;

    activeSession = {
      id: 'ws-' + seq,
      task: task,
      project: project,
      startedAt: startedAt,
      durationMs: durationMs,
      endsAt: durationMs ? startedAt + durationMs : null,
      aiEvents: [],
      review: null,
      active: true,
    };

    return Object.assign({}, activeSession);
  }

  function recordAiEvent(event) {
    if (!activeSession || !event) return false;
    const cleanEvent = {
      type: event.type || 'event',
      summary: cleanText(event.summary, 160) || null,
      status: event.status || null,
      timestamp: now(),
    };
    activeSession.aiEvents.push(cleanEvent);
    return true;
  }

  function recordReview(reviewResult) {
    if (!activeSession || !reviewResult) return false;
    activeSession.review = {
      summary: cleanText(reviewResult.summary || reviewResult.summaryText, 200),
      filesChanged: typeof reviewResult.filesChanged === 'number' ? reviewResult.filesChanged : null,
      timestamp: now(),
    };
    return true;
  }

  function finish() {
    if (!activeSession) return null;
    const endedAt = now();
    const elapsed = Math.max(0, endedAt - activeSession.startedAt);
    const summaryText = formatSessionSummary(activeSession, endedAt);

    const finishedRecord = {
      id: activeSession.id,
      task: activeSession.task,
      project: activeSession.project,
      startedAt: activeSession.startedAt,
      finishedAt: endedAt,
      elapsedMs: elapsed,
      aiEventsCount: activeSession.aiEvents.length,
      hadReview: Boolean(activeSession.review),
      summaryText: summaryText,
    };

    history.push(finishedRecord);
    if (history.length > MAX_HISTORY) history.shift();

    activeSession = null;
    if (onSessionFinished) {
      onSessionFinished(finishedRecord);
    }
    return finishedRecord;
  }

  function cancel() {
    if (!activeSession) return { ok: false, error: 'Tidak ada sesi kerja aktif.' };
    const id = activeSession.id;
    activeSession = null;
    return { ok: true, id: id };
  }

  function presenceState() {
    if (!activeSession) {
      return { active: false, task: null, project: null, remainingMs: null };
    }
    const remaining = activeSession.endsAt ? Math.max(0, activeSession.endsAt - now()) : null;
    return {
      active: true,
      task: activeSession.task,
      project: activeSession.project,
      remainingMs: remaining,
    };
  }

  return {
    start: start,
    finish: finish,
    cancel: cancel,
    recordAiEvent: recordAiEvent,
    recordReview: recordReview,
    current: current,
    presenceState: presenceState,
    get active() {
      return activeSession !== null;
    },
    get history() {
      return history.slice();
    },
  };
}

module.exports = {
  createWorkSessionManager,
  formatSessionSummary,
};
