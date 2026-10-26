'use strict';

// Parser for Claude Code session transcripts (JSONL under ~/.claude/projects).
// Pure module: no I/O, no clock, no Electron. Behaviour is unit tested against
// fixtures that mirror lines observed in real transcripts.

function textOf(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block && typeof block.text === 'string') return block.text;
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

function parseLine(line) {
  if (typeof line !== 'string' || line.trim() === '') return null;
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return null; // partial or corrupt line; callers buffer until newline
  }
  if (!obj || typeof obj !== 'object' || typeof obj.type !== 'string') return null;
  const cwd = typeof obj.cwd === 'string' ? obj.cwd : null;

  switch (obj.type) {
    case 'bridge-session':
      return { kind: 'session-open', sessionId: obj.sessionId || null, cwd };
    case 'queue-operation':
      if (obj.operation === 'enqueue') {
        return { kind: 'user-message', text: textOf(obj.content), cwd };
      }
      return null;
    case 'user': {
      // Skip subagent turns, meta entries, hook output and tool results: they
      // are not a human turn and must not wake the pet.
      if (obj.isSidechain || obj.isMeta) return null;
      const text = textOf(obj.message && obj.message.content);
      if (!text || text.startsWith('<')) return null;
      return { kind: 'user-message', text, cwd };
    }
    case 'assistant': {
      const message = obj.message || {};
      const blocks = Array.isArray(message.content) ? message.content : [];
      const text = blocks
        .filter((b) => b && b.type === 'text')
        .map((b) => b.text || '')
        .join('\n')
        .trim();
      if (obj.isApiErrorMessage) {
        return { kind: 'turn-failed', text: text || 'API error', cwd };
      }
      if (message.stop_reason === 'end_turn' || message.stop_reason === 'stop_sequence') {
        return { kind: 'turn-finished', text, cwd };
      }
      return { kind: 'assistant-progress', text, cwd };
    }
    case 'system':
      if (obj.subtype === 'stop_hook_summary') return { kind: 'turn-finished', text: '', cwd };
      if (/error/i.test(obj.subtype || '')) return { kind: 'turn-failed', text: obj.subtype, cwd };
      return null;
    default:
      return null; // attachments, progress and other bookkeeping
  }
}

function createTracker(sessionId, projectDir) {
  return {
    sessionId: sessionId || null,
    projectDir: projectDir || '',
    cwd: null,
    state: 'idle', // idle | running | finished | failed
    startedAt: null,
    finishedAt: null,
    lastUserText: '',
    lastAssistantText: '',
  };
}

// Display name for a session: prefers the real cwd captured from message lines,
// falls back to the munged directory name Claude Code stores on disk.
function projectNameOf(tracker) {
  if (tracker.cwd) {
    const parts = String(tracker.cwd).split(/[\\/]/).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return String(tracker.projectDir || 'unknown');
}

function summarize(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > 280 ? flat.slice(0, 277) + '...' : flat;
}

function emit(tracker, type, summary) {
  const out = {
    type: type,
    sessionId: tracker.sessionId,
    projectDir: tracker.projectDir,
    projectName: projectNameOf(tracker),
  };
  if (type !== 'turn-started') out.summary = summary || '';
  return out;
}

// Folds one parsed event into the tracker state machine and returns the
// transitions that fired (usually zero or one).
function feedEvent(tracker, event, timestamp) {
  const emissions = [];
  if (!event || event.kind === 'session-open') return emissions;
  if (event.cwd && !tracker.cwd) tracker.cwd = event.cwd;

  switch (event.kind) {
    case 'user-message':
      if (event.text) tracker.lastUserText = event.text;
      if (tracker.state !== 'running') {
        tracker.state = 'running';
        tracker.startedAt = timestamp;
        emissions.push(emit(tracker, 'turn-started'));
      }
      break;
    case 'assistant-progress':
      if (event.text) tracker.lastAssistantText = event.text;
      if (tracker.state !== 'running') {
        // Assistant activity without a seen user message (session resumed
        // mid-turn) still counts as a running turn.
        tracker.state = 'running';
        tracker.startedAt = timestamp;
        emissions.push(emit(tracker, 'turn-started'));
      }
      break;
    case 'turn-finished':
      if (event.text) tracker.lastAssistantText = event.text;
      if (tracker.state === 'running') {
        tracker.state = 'finished';
        tracker.finishedAt = timestamp;
        emissions.push(emit(tracker, 'turn-finished', summarize(tracker.lastAssistantText)));
      }
      break;
    case 'turn-failed':
      if (event.text) tracker.lastAssistantText = event.text;
      if (tracker.state === 'running' || tracker.state === 'finished') {
        tracker.state = 'failed';
        tracker.finishedAt = timestamp;
        emissions.push(emit(tracker, 'turn-failed', summarize(event.text || tracker.lastAssistantText)));
      }
      break;
    default:
      break;
  }
  return emissions;
}

module.exports = {
  parseLine: parseLine,
  createTracker: createTracker,
  feedEvent: feedEvent,
  summarize: summarize,
  projectNameOf: projectNameOf,
  textOf: textOf,
};
