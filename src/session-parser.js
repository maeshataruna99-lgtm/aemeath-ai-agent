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

// Tools that stop the turn until the human answers. Permission prompts are not
// recorded in transcripts, so only these explicit requests can be detected.
const DECISION_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode', 'ask_question']);

function toolResultIds(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter((b) => b && b.type === 'tool_result' && typeof b.tool_use_id === 'string')
    .map((b) => b.tool_use_id);
}

function describeDecision(toolUse) {
  const input = toolUse.input || {};
  if (toolUse.name === 'AskUserQuestion' || toolUse.name === 'ask_question') {
    const first = Array.isArray(input.questions) ? input.questions[0] : null;
    return (first && (first.question || first.header)) || 'Sesi AI mengajukan pertanyaan.';
  }
  return 'Rencana menunggu persetujuanmu.';
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
      const resultIds = toolResultIds(obj.message && obj.message.content);
      if (resultIds.length) return { kind: 'tool-result', toolUseIds: resultIds, cwd };
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
      const toolUses = obj.isSidechain
        ? []
        : blocks
            .filter((b) => b && b.type === 'tool_use' && DECISION_TOOLS.has(b.name))
            .map((b) => ({ id: b.id, name: b.name, input: b.input }));
      return { kind: 'assistant-progress', text, toolUses, cwd };
    }
    case 'system':
      if (obj.subtype === 'stop_hook_summary') return { kind: 'turn-finished', text: '', cwd };
      if (/error/i.test(obj.subtype || '')) return { kind: 'turn-failed', text: obj.subtype, cwd };
      return null;
    case 'USER_INPUT': {
      const raw = textOf(obj.content)
        .replace(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i, '$1')
        .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, '')
        .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/gi, '')
        .trim();
      if (!raw || raw.startsWith('<')) return null;
      return { kind: 'user-message', text: raw, cwd };
    }
    case 'PLANNER_RESPONSE': {
      const text = textOf(obj.content);
      if (obj.status === 'ERROR') {
        return { kind: 'turn-failed', text: text || 'API error', cwd };
      }
      const rawCalls = Array.isArray(obj.tool_calls) ? obj.tool_calls : [];
      const toolUses = rawCalls
        .map((tc, idx) => {
          if (!tc || typeof tc !== 'object') return null;
          const rawName = String(tc.name || (tc.function && tc.function.name) || '');
          const cleanName = rawName.replace(/^default_api:/, '');
          const input = tc.args || tc.arguments || tc.input || (tc.function && tc.function.arguments) || {};
          return {
            id: String(tc.id || 'ag-' + (obj.step_index != null ? obj.step_index : idx)),
            name: cleanName,
            input: typeof input === 'object' && input ? input : {},
          };
        })
        .filter((t) => t && DECISION_TOOLS.has(t.name));
      if (rawCalls.length === 0 && (obj.status === 'DONE' || !obj.status)) {
        return { kind: 'turn-finished', text, cwd };
      }
      return { kind: 'assistant-progress', text, toolUses, cwd };
    }
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
    pendingDecision: null, // { id, tool } while the session waits for the human
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
  if (tracker.cwd) out.cwd = tracker.cwd;
  if (type !== 'turn-started') out.summary = summary || '';
  return out;
}

// Folds one parsed event into the tracker state machine and returns the
// transitions that fired (usually zero or one).
function resolveDecision(tracker, emissions) {
  if (!tracker.pendingDecision) return;
  tracker.pendingDecision = null;
  emissions.push(emit(tracker, 'decision-resolved', ''));
}

function feedEvent(tracker, event, timestamp) {
  const emissions = [];
  if (!event || event.kind === 'session-open') return emissions;
  if (event.cwd && !tracker.cwd) tracker.cwd = event.cwd;
  if (event.kind === 'user-message' || event.kind === 'turn-finished' || event.kind === 'turn-failed') {
    resolveDecision(tracker, emissions);
  }

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
      for (const toolUse of event.toolUses || []) {
        if (tracker.pendingDecision && tracker.pendingDecision.id === toolUse.id) continue;
        tracker.pendingDecision = { id: toolUse.id, tool: toolUse.name };
        emissions.push(emit(tracker, 'decision-requested', summarize(describeDecision(toolUse))));
      }
      break;
    case 'tool-result':
      if (tracker.pendingDecision && event.toolUseIds.includes(tracker.pendingDecision.id)) {
        resolveDecision(tracker, emissions);
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
