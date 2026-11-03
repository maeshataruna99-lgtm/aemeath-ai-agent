# Roadmap — Agent Bridge on the Modular Core

Status: **Planning only**. No implementation is claimed complete.  
Prepared: 2026-11-03

## Goal

Evolve Aemeath from a read-only observer of AI coding sessions into a front-end that can drive them: start, continue, and stop sessions of Claude Code (first), then Codex and Antigravity, from the chat bubble and from terminal mode. The work is built as an optional module on a small modular core, following the modular companion bundle (package manager, native task engine, bilingual i18n) where it fits this repository.

## Baseline (inspected 2026-11-03)

Repository facts:

- `src/claude-code-provider.js` and `src/session-parser.js` already watch `~/.claude/projects` (and `~/.gemini/antigravity/brain`) and emit turn started/finished/failed and pending-decision events. This is read-only and stays the source for the session list.
- Terminal mode (`src/terminal/terminal-session.js`) is a piped child process that reads output up to a marker line. It is not a PTY, so full-screen TUIs cannot run in it.
- Bilingual i18n is done: `docs/roadmap/PROGRESS.md` lists P1–P3 PASS with single catalogs in `src/i18n/locales/{id-ID,en-US}.json`.
- `package.json` has no runtime dependencies. There is no database, queue, or packaging config.

Claude CLI facts (tested locally, Claude CLI as installed on the owner's machine):

- `claude -p ... --output-format stream-json --verbose` prints one JSON object per line. Every line carries `session_id`. Event types seen: `system` (`hook_started`, `hook_response`, `init`), `assistant`, `user` (tool results), `rate_limit_event`, `result`.
- `--resume <session-id>` continues the same session id; the model recalled a word from the earlier turn.
- A long-lived process with `--input-format stream-json` accepts `{"type":"user","message":{"role":"user","content":"..."}}` lines and answers several turns in one process, same `session_id`.
- Before login, an expired OAuth session came back as `result` with `subtype: "success"` and the error text as the result. Success must not be inferred from `subtype` alone.
- With `--max-turns 1` the run stopped with `error_max_turns`, because the owner's global instructions made the model call Skill tools first. Headless runs load the owner's global config and hooks. Isolation flags are not yet verified.
- `claude.exe` resolves at `~/.local/bin/claude.exe`; `claude.cmd` also exists and needs a shell. The bridge must resolve and spawn the `.exe` with an argument list, no shell.

Not verified: permission-prompt events, tool-use output shape for long runs, Codex (not installed on this machine), Antigravity CLI.

## Decisions

- **A-1.** Two routes share one adapter: (A) Aemeath as front-end in the chat bubble, (B) the same session shown in terminal mode.
- **A-2.** No PTY in the first version. Terminal mode renders the `stream-json` adapter as text. A PTY (`node-pty`) is reconsidered only if a full TUI is needed; it adds a native dependency.
- **A-3.** Aemeath never writes a resume command into the shell. It shows the session id; the owner types `claude --resume <id>` themselves (project rule §7).
- **A-4.** The bridge is an optional module. Core boots and chats with the module disabled or removed.

## How the modular bundle merges

| Bundle item | Treatment here |
|---|---|
| Core stays light, Heavy optional | Adopt. The bridge is the first optional module. |
| Bilingual i18n as P0 | Already done. Kept as a gate: every new string goes through the existing catalogs, no per-module locale store. The bundle's per-namespace file layout is not adopted. |
| Native task engine, no n8n | Adopt, scaled down: local persisted task records, no queue service. |
| Task statuses | Adopt as is. `awaiting_approval` means the owner must type "ya". |
| Capability registry | Adopt minimal: fixed IDs such as `agent.claude.run`, only registered capabilities callable. |
| PostgreSQL, Redis, Docker, workers | Reject for now. Local storage in the app data folder. Whether `node:sqlite` is available in the bundled Electron is unchecked. |
| Package manager with install, update, integrity check | Defer. First version is built-in modules toggled in Settings. Downloaded packages conflict with the project's rule against running code from untrusted sources and need their own decision. |
| Enable, disable, uninstall, purge | Adopt for built-in modules. Purge is a separate, confirmed action. |
| GitHub, email, chat integrations | Defer. They send data off the machine and need new privacy rules first (§8). |
| Scheduler, proactive tasks | Defer until the task runtime is proven. |
| Bundle's AI-agent rules | Not copied. Project rules live only under `.claude/` (§3), and `DECISION_LOG.md` D-007 already requires evidence-based completion. |

## Phases

### P0 — Contracts and remaining research

- Write the `AgentAdapter` contract: `start`, `send`, `resume`, `stop`, event stream.
- Write the task record and capability schema (small subset of the bundle's task record).
- Verify headless isolation from the owner's global config, and permission-prompt behavior.
- Research Codex and Antigravity headless modes and where they store sessions.
- Check terms of use for driving each CLI with the owner's own login.

DoD: contracts reviewed; research notes with sources; decisions recorded in `DECISION_LOG.md` with owner approval.

### P1 — Local task runtime

- Persisted task store with the seven statuses and validated transitions.
- Timeout, cancel, bounded retry, restart recovery, idempotency key.
- Success only after a validated result (never from process start).

DoD: tests for success, failure, timeout, cancel, duplicate request, restart.

### P2 — Claude adapter, vertical slice

- Spawn `claude.exe` with an argument list, no shell, normal user.
- Parse `stream-json`, drop hook noise, detect login failure inside `result`.
- `/claude <text>` for the owner's typed text only; resume and stop.
- Settings toggle for the module, off by default.

DoD: one end-to-end run shown in the bubble; resume works; tests use a fake process, no real model call.

### P3 — UI

- Streaming reply in the bubble, status per task, stop button.
- Session list from the existing watcher plus task records; shows ids (A-3).
- Terminal-mode view of the same adapter (route B).
- Permission requests: shown, answered only by typed "ya".
- All text through i18n keys in both locales.

DoD: UI reflects task state; both locales; no hardcoded strings; missing-key test passes.

### P4 — Codex and Antigravity adapters

One ticket each. Same contract, same tests with fake processes. Research is in `AGENT_BRIDGE_P4_RESEARCH.md`.

**Status: skipped for now (owner, 2026-11-03).** Both adapters move to the backlog below and become issues later. Nothing in P0 to P3 and P5 depends on them.

### P5 — Module lifecycle

- Enable, disable, uninstall for built-in modules; stop owned processes; keep chat history, persona, locale.
- Purge of module data as a separate confirmed action.

### P6 — Expansion

Bundle P4–P5 items (scheduler, integrations, domain packages) only after separate decisions on network and privacy rules.

## Security and privacy gates

- §7: only owner-typed text reaches a CLI or shell; model output, search results, and lorebook text never do. No path writes `commands.json` besides Settings.
- §7: spawn without shell, as a normal user; no admin elevation.
- §8: session content and task output stay local. Nothing is sent to the internet by the bridge itself (the CLIs talk to their own services under the owner's login).
- §8: redact secret-like text before storing or showing it. Window titles and file paths are not stored.
- §6: no tokens or API keys in repo, logs, fixtures, or chat. The bridge never reads or copies CLI credentials.
- Tests never start a real model session or a destructive command; use fakes.

## Open questions

1. ~~Isolation~~ Answered 2026-11-03: `--setting-sources project` gives a clean one-turn run with no hooks and no skill calls. `--bare` is not usable because it drops OAuth login and needs an API key.
2. Permission requests: `--permission-prompts none` denies anything that would prompt, which is the safe default for the first version. Answering prompts over the pipe (`--permission-prompt-tool`) is untested and moves to P3.
3. Do Codex and Antigravity support resumable headless sessions?
4. Is `node:sqlite` usable in the bundled Electron, or should task records stay as JSON files?
5. Should session ids from route B (started outside Aemeath) be adoptable as tasks, or only listed?

## Backlog (to become issues)

Decided, researched, and deliberately not started. File each as an issue when the work is picked up.

### Codex adapter (D-012)

- Blocked on: the owner installs the Codex CLI. `codex` is not on PATH today; only the desktop app is installed.
- Scope: adapter beside `claude-adapter.js` with prompt on stdin, argument list, no shell, `--json`, explicit `--sandbox read-only`. Parser for `thread.started`, `turn.*`, `item.*`, `error`. Resume by the `thread_id` captured from `thread.started`.
- Edit approval: a second run with `--sandbox workspace-write` after a typed "ya", the same pattern as `/claude ya`.
- Not in the first version: a session list (sessions are zstd files with no folder in the path).
- Rules: never read `~/.codex/auth.json`; the working folder must be a Git repository or pass `--skip-git-repo-check`.
- Done when: fake-process tests as for Claude, one real run, and a selfie scenario.
- Source notes: `AGENT_BRIDGE_P4_RESEARCH.md`.

### Antigravity adapter (D-013)

- Blocked on three gates: `agy` installed on this machine; a run with no terminal confirmed not to hang (reported up to v1.4.10 on Windows); and the owner accepting that Google's FAQ does not say whether a wrapper may use an API key.
- Scope: Gemini API key only, never a consumer login. Key stored in encrypted local storage (rule section 6) and passed as an environment variable for one run. The adapter refuses to start without a key.
- Open design points: how the CLI is told to use the key (its settings file needs `modelProvider` set to `gemini`; writing the owner's CLI settings is itself a decision) and whether `stream-json` input can carry a multi-turn session.
- Until then: the existing read-only watcher is the only Antigravity feature.

### Other open items

- Click-level checks in the real Settings window: the purge button and its confirmation, the folder picker, and the stop on toggle-off and on quit. Logic is unit tested; the selfie run covers chat, not these clicks.
- A guard against resuming a session that is live in another window (`/claude lanjut` can pick the session Claude Code is currently writing to).
- P6 (downloadable packages, integrations, scheduler) still waits for separate decisions on network and privacy rules.
