// One place decides whether Aemeath speaks, how important a line is, and in what
// order waiting lines are shown. Before this, every source (chatter, activity
// remarks, session events, timers) pushed into one first-in-first-out queue, so a
// remark about a game could sit in front of an AI session asking for a decision.
//
// Pure and clock-free: the caller passes `now` to every call, which keeps the
// ordering rules testable without Electron and without timers.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AemeathBehavior = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The roadmap's ladder. Lower numbers interrupt higher ones.
  const PRIORITY = {
    decision: 1, // Rover has to answer before the AI session can move
    failure: 2, // an AI session failed or stopped
    direct: 3, // Rover asked for this himself
    productivity: 4, // a timer or a work session ended
    activity: 5, // a remark about what Rover is doing on the desktop
    chatter: 6, // small talk and trivia
  };

  const KIND_PRIORITY = {
    'decision-request': PRIORITY.decision,
    'session-failed': PRIORITY.failure,
    'session-stopped': PRIORITY.failure,
    greeting: PRIORITY.direct,
    // Rover just answered one of her questions, so this is not proactive chatter.
    'memory-saved': PRIORITY.direct,
    'memory-refused': PRIORITY.direct,
    'session-finished': PRIORITY.productivity,
    'timer-done': PRIORITY.productivity,
    'work-session-end': PRIORITY.productivity,
    'activity-remark': PRIORITY.activity,
    // A memory offer is a suggestion, not a task Rover queued: it waits for
    // decisions and timers, obeys the pause switch, Focus Mode and the hourly cap,
    // and Low mode never makes one at all.
    'memory-offer': PRIORITY.activity,
    chatter: PRIORITY.chatter,
    trivia: PRIORITY.chatter,
  };

  // How long a line may wait for its turn before it is no longer worth saying.
  // A remark about a game is stale after a minute; a pending decision is not.
  const PRIORITY_TTL_MS = {
    1: 10 * 60 * 1000,
    2: 10 * 60 * 1000,
    3: 5 * 60 * 1000,
    4: 5 * 60 * 1000,
    5: 60 * 1000,
    6: 20 * 1000,
  };

  const MODES = ['low', 'medium', 'full'];

  const DEFAULTS = {
    // Event-driven remarks per hour. The chatter slider keeps its own cadence,
    // so it is not counted here; see README.
    maxPerHour: 6,
    cooldownMs: 10 * 60 * 1000,
    budgetWindowMs: 60 * 60 * 1000,
    dedupeWindowMs: 30 * 60 * 1000,
    dedupeSimilarity: 0.8,
    maxPending: 6,
  };

  function normalizeText(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u00c0-\u024f\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokens(text) {
    const normalized = normalizeText(text);
    return normalized ? normalized.split(' ') : [];
  }

  // Jaccard overlap: 1 means the same words, 0 means nothing in common.
  function similarity(a, b) {
    const left = new Set(tokens(a));
    const right = new Set(tokens(b));
    if (left.size === 0 || right.size === 0) return 0;
    let shared = 0;
    for (const token of left) if (right.has(token)) shared += 1;
    return shared / (left.size + right.size - shared);
  }

  function createBehaviorDirector(options) {
    const opts = options || {};
    const clock = opts.now || Date.now;

    let mode = MODES.includes(opts.mode) ? opts.mode : 'low';
    let chatterEnabled = opts.chatterEnabled !== false;
    let paused = false;
    let focus = false;
    let idle = false;
    let chatOpen = false;

    let maxPerHour =
      typeof opts.maxPerHour === 'number' && opts.maxPerHour >= 0 ? opts.maxPerHour : DEFAULTS.maxPerHour;
    let cooldownMs =
      typeof opts.cooldownMs === 'number' && opts.cooldownMs >= 0 ? opts.cooldownMs : DEFAULTS.cooldownMs;
    const budgetWindowMs = DEFAULTS.budgetWindowMs;
    const dedupeWindowMs = DEFAULTS.dedupeWindowMs;
    const dedupeSimilarity = DEFAULTS.dedupeSimilarity;
    const maxPending = DEFAULTS.maxPending;

    let active = null;
    let pending = [];
    let budget = []; // show times of event-driven remarks, for the hourly cap
    let shownAt = Object.create(null); // category -> last time it was said
    let recentTexts = []; // { text, at } of anything said proactively
    const stats = { shown: 0, dropped: 0, queued: 0, preempted: 0, merged: 0, evicted: 0, expired: 0 };

    function normalize(event, at) {
      const raw = event || {};
      const text = typeof raw.text === 'string' ? raw.text.trim() : '';
      let priority =
        typeof raw.priority === 'number' && raw.priority >= 1 && raw.priority <= 6
          ? Math.round(raw.priority)
          : KIND_PRIORITY[raw.kind] || PRIORITY.chatter;
      const ttlMs =
        typeof raw.ttlMs === 'number' && raw.ttlMs > 0 ? raw.ttlMs : PRIORITY_TTL_MS[priority] || 20000;
      return {
        kind: typeof raw.kind === 'string' && raw.kind ? raw.kind : 'chatter',
        text: text,
        category: typeof raw.category === 'string' && raw.category ? raw.category : null,
        credit: raw.credit || null,
        sessionId: raw.sessionId || null,
        anim: typeof raw.anim === 'string' && raw.anim ? raw.anim : null,
        animMs: typeof raw.animMs === 'number' && raw.animMs > 0 ? raw.animMs : null,
        // A line may carry one thing Rover can answer on the bubble itself
        // (memory offers). Everything else about it is rebuilt from the event.
        action: raw.action && typeof raw.action === 'object' ? raw.action : null,
        priority: priority,
        at: at,
        deadline: at + ttlMs,
      };
    }

    function drop(reason, item) {
      stats.dropped += 1;
      return { action: 'drop', reason: reason, item: item || null };
    }

    // A line is "proactive" when nothing Rover did asked for it. Those are the
    // only ones the frequency controls may hold back: a timer he set and an AI
    // session that failed still have to be heard while the pause switch is on.
    function isProactive(priority) {
      return priority >= PRIORITY.activity;
    }

    function pruneBudget(at) {
      budget = budget.filter((stamp) => at - stamp < budgetWindowMs);
    }

    function pruneTexts(at) {
      recentTexts = recentTexts.filter((entry) => at - entry.at < dedupeWindowMs);
    }

    function sameCategoryPending(item) {
      if (!item.category || item.priority < PRIORITY.activity) return -1;
      for (let i = 0; i < pending.length; i += 1) {
        const other = pending[i];
        if (other.category === item.category && other.priority >= PRIORITY.activity) return i;
      }
      return -1;
    }

    function worstPendingIndex() {
      let index = 0;
      for (let i = 1; i < pending.length; i += 1) {
        const other = pending[i];
        const worst = pending[index];
        if (other.priority > worst.priority) index = i;
        else if (other.priority === worst.priority && other.deadline < worst.deadline) index = i;
      }
      return index;
    }

    function remember(item, at) {
      if (!isProactive(item.priority)) return;
      if (item.category && item.priority === PRIORITY.activity) shownAt[item.category] = at;
      if (item.priority === PRIORITY.activity) {
        pruneBudget(at);
        budget.push(at);
      }
      if (item.priority >= PRIORITY.activity) {
        pruneTexts(at);
        recentTexts.push({ text: item.text, at: at });
      }
    }

    function activate(item, at) {
      active = item;
      stats.shown += 1;
      remember(item, at);
      return item;
    }

    function similarPending(item) {
      if (item.priority < PRIORITY.activity) return false;
      for (const other of pending) {
        if (other.priority >= PRIORITY.activity && similarity(other.text, item.text) >= dedupeSimilarity) {
          return true;
        }
      }
      return false;
    }

    function queue(item) {
      // Never wait twice with the same words.
      if (similarPending(item)) return drop('duplicate', item);
      // The same kind of activity remark replaces the one already waiting, so a
      // burst of window switches never fills the queue with near-copies.
      const replaceAt = sameCategoryPending(item);
      if (replaceAt >= 0) {
        const replaced = pending[replaceAt];
        pending.splice(replaceAt, 1);
        if (replaced.priority === item.priority) stats.merged += 1;
        else stats.evicted += 1;
      }
      pending.push(item);
      if (pending.length > maxPending) {
        const worst = worstPendingIndex();
        pending.splice(worst, 1);
        stats.evicted += 1;
      }
      stats.queued += 1;
      return { action: 'queue', item: item, reason: 'busy', pending: pending.length };
    }

    function expirePending(at) {
      const keep = [];
      for (const item of pending) {
        if (item.deadline <= at) {
          stats.expired += 1;
          stats.dropped += 1;
        } else {
          keep.push(item);
        }
      }
      pending = keep;
    }

    function bestPending(at) {
      expirePending(at);
      let best = null;
      for (const item of pending) {
        if (!best) {
          best = item;
          continue;
        }
        if (item.priority < best.priority) best = item;
        else if (item.priority === best.priority && item.at < best.at) best = item;
      }
      return best;
    }

    function takeBest(at) {
      const best = bestPending(at);
      if (!best) return null;
      pending = pending.filter((item) => item !== best);
      return best;
    }

    function submit(event, nowArg) {
      const at = typeof nowArg === 'number' ? nowArg : clock();
      const item = normalize(event, at);
      if (!item.text) return drop('empty', item);

      // 1. Rover switched the whole thing off, or asked for quiet.
      if (isProactive(item.priority) && paused) return drop('paused', item);
      // 2. Nothing proactive while he is away; a bubble nobody reads is noise.
      if (isProactive(item.priority) && idle) return drop('idle', item);
      // 3. Focus Mode only holds back routine lines, never a pending decision.
      if (isProactive(item.priority) && focus) return drop('focus', item);
      // 4. Low mode never comments on desktop activity.
      if (item.priority === PRIORITY.activity && mode === 'low') return drop('mode', item);
      // 5. The chatter switch keeps its old meaning.
      if (item.priority === PRIORITY.chatter && !chatterEnabled) return drop('off', item);

      // 6. Do not repeat yourself, from whichever source.
      if (isProactive(item.priority)) {
        pruneTexts(at);
        for (const entry of recentTexts) {
          if (similarity(entry.text, item.text) >= dedupeSimilarity) return drop('duplicate', item);
        }
      }

      // 7. One remark per category per cooldown window.
      if (item.priority === PRIORITY.activity && item.category && cooldownMs > 0) {
        const last = shownAt[item.category];
        if (typeof last === 'number' && at - last < cooldownMs) return drop('cooldown', item);
      }

      // 8. Hourly cap on event-driven remarks.
      if (item.priority === PRIORITY.activity && maxPerHour > 0) {
        pruneBudget(at);
        if (budget.length >= maxPerHour) return drop('budget', item);
      }

      // 9. The chat box is open: hold the line until it closes (its TTL still runs).
      if (isProactive(item.priority) && chatOpen) return queue(item);

      // 10. Show it now if she is quiet, or if it outranks what she is saying.
      if (!active) {
        activate(item, at);
        return { action: 'show', item: item, reason: 'free', pending: pending.length };
      }
      if (item.priority < active.priority) {
        const interrupted = active;
        active = null;
        stats.preempted += 1;
        // A waiting reminder keeps its place; small talk is simply dropped.
        if (interrupted.priority <= PRIORITY.productivity && interrupted.deadline > at) {
          pending.push(interrupted);
        }
        activate(item, at);
        return {
          action: 'preempt',
          item: item,
          interrupted: interrupted,
          reason: 'priority',
          pending: pending.length,
        };
      }
      return queue(item);
    }

    // Called by the renderer when the bubble has been on screen long enough.
    function finish(nowArg) {
      const at = typeof nowArg === 'number' ? nowArg : clock();
      if (!active) return null;
      active = null;
      return tick(at);
    }

    // Next line to show when nothing is on screen.
    function tick(nowArg) {
      const at = typeof nowArg === 'number' ? nowArg : clock();
      if (active) return null;
      const next = takeBest(at);
      if (!next) return null;
      activate(next, at);
      return { item: next };
    }

    function setMode(next) {
      if (!MODES.includes(next) || next === mode) return mode;
      mode = next;
      if (mode === 'low') pending = pending.filter((item) => item.priority !== PRIORITY.activity);
      return mode;
    }

    function setChatterEnabled(on) {
      chatterEnabled = on !== false;
    }

    function setPaused(on) {
      paused = on === true;
      if (paused) pending = pending.filter((item) => !isProactive(item.priority));
    }

    function setFocus(on) {
      focus = on === true;
      if (focus) pending = pending.filter((item) => item.priority < PRIORITY.activity);
    }

    function setIdle(on) {
      idle = on === true;
    }

    function setChatOpen(on) {
      chatOpen = on === true;
    }

    function setLimits(limits) {
      const next = limits || {};
      if (typeof next.maxPerHour === 'number' && next.maxPerHour >= 0) {
        maxPerHour = Math.round(next.maxPerHour);
      }
      if (typeof next.cooldownMs === 'number' && next.cooldownMs >= 0) {
        cooldownMs = next.cooldownMs;
      }
    }

    function clearActive() {
      active = null;
    }

    function reset() {
      active = null;
      pending = [];
      budget = [];
      shownAt = Object.create(null);
      recentTexts = [];
      for (const key of Object.keys(stats)) stats[key] = 0;
    }

    function state() {
      return {
        mode: mode,
        paused: paused,
        focus: focus,
        idle: idle,
        chatOpen: chatOpen,
        chatterEnabled: chatterEnabled,
        maxPerHour: maxPerHour,
        cooldownMin: Math.round(cooldownMs / 60000),
        active: active ? { kind: active.kind, priority: active.priority, text: active.text } : null,
        pending: pending.map((item) => ({
          kind: item.kind,
          category: item.category,
          priority: item.priority,
          text: item.text,
        })),
        stats: Object.assign({}, stats),
        remarksThisHour: budget.length,
      };
    }

    return {
      submit: submit,
      tick: tick,
      finish: finish,
      clearActive: clearActive,
      setMode: setMode,
      setChatterEnabled: setChatterEnabled,
      setPaused: setPaused,
      setFocus: setFocus,
      setIdle: setIdle,
      setChatOpen: setChatOpen,
      setLimits: setLimits,
      reset: reset,
      state: state,
      get pendingCount() {
        return pending.length;
      },
      get busy() {
        return active !== null || pending.length > 0;
      },
    };
  }

  return {
    createBehaviorDirector: createBehaviorDirector,
    PRIORITY: PRIORITY,
    KIND_PRIORITY: KIND_PRIORITY,
    PRIORITY_TTL_MS: PRIORITY_TTL_MS,
    DEFAULTS: DEFAULTS,
    similarity: similarity,
  };
});
