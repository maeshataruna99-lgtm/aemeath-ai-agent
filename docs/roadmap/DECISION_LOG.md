# Decision Log — Bilingual Aemeath

## D-001: Supported languages
**Decision:** Support Bahasa Indonesia (`id-ID`) and English (`en-US`) in this milestone.  
**Reason:** Deliver complete bilingual behavior before adding more locales.

## D-002: Selector placement
**Decision:** The language selector appears in Settings only.  
**Constraint:** Do not add a duplicate language selector to the header.

## D-003: Default locale
**Decision:** If there is no valid saved preference, use Indonesian (`id-ID`).  
**Constraint:** Preserve a valid existing saved preference and unrelated settings.

## D-004: Conversation history
**Decision:** Changing locale does not translate, delete, reorder, or recreate existing messages.  
**Behavior:** New assistant responses use the active locale by default.

## D-005: Persona integrity
**Decision:** Keep Aemeath's stable identity, personality, and safety behavior consistent across locales.  
**Implementation direction:** Separate locale instructions from stable persona instructions where practical.

## D-006: Source of truth
**Decision:** Maintain one authoritative active locale and one preference persistence path, reusing existing application patterns.

## D-007: Evidence-based completion
**Decision:** A phase cannot be marked `PASS` without implementation evidence and executed verification results.

## D-008: Agent bridge routes
**Decision:** Aemeath drives AI coding CLIs through one adapter with two views: the chat bubble and terminal mode.  
**Reference:** `docs/roadmap/AGENT_BRIDGE_ROADMAP.md`.

## D-009: No PTY in the first version
**Decision:** Terminal mode renders the `stream-json` adapter as text. No `node-pty`.  
**Constraint:** Reconsider only if a full-screen TUI is required; it adds a native dependency.

## D-010: Resume commands are typed by the owner
**Decision:** Aemeath shows a session id and never writes `claude --resume <id>` into a shell.  
**Reason:** Only owner-typed text may reach a shell (project rule §7).

## D-011: Bridge is an optional module
**Decision:** Core boots and chats with the bridge disabled or removed. The module is off by default.

## D-012: Codex adapter
**Decision:** Build a Codex adapter after the owner installs the Codex CLI. It follows the Claude adapter: prompt on stdin, argument list, no shell, `--json`, and an explicit `--sandbox read-only`.  
**Constraint:** Never read, copy, or log `~/.codex/auth.json`. Sessions are zstd files with no folder in the path, so the first version resumes by the id from `thread.started` and has no session list.  
**Reference:** `docs/roadmap/AGENT_BRIDGE_P4_RESEARCH.md`.  
**Status:** skipped for now by the owner (2026-11-03); tracked in the backlog of `AGENT_BRIDGE_ROADMAP.md`.

## D-013: Antigravity adapter only through an API key
**Decision:** An Antigravity adapter may be built, but only with a Gemini API key. A consumer Antigravity login is never driven by Aemeath: Google's FAQ says wrapping `agy` is unsupported on consumer plans and calls third-party access a Terms of Service violation.  
**Constraint:** The key lives only in encrypted local storage (rule section 6) and reaches the process as an environment variable for that run. The adapter refuses to start without a key.  
**Gates before any code:** `agy` is installed here; running it with no terminal does not hang (reported up to v1.4.10 on Windows); and the owner accepts that Google's FAQ does not say whether a wrapper may use an API key. Until then the read-only session watcher is the only Antigravity feature.  
**Status:** skipped for now by the owner (2026-11-03); tracked in the backlog of `AGENT_BRIDGE_ROADMAP.md`.

## D-014: Claude adapter stays, with credential rules
**Decision:** The Claude adapter stays as built: it runs the unmodified `claude.exe` under the owner's own login.  
**Constraint:** Never read or store files that hold Claude credentials, never pass tokens to the process, and never ship Aemeath with a shared login. Anthropic's pages do not state outright that a personal desktop tool may spawn `claude -p`; this reading is inferred and is the owner's call.

## D-015: Read-only GitHub reader through the gh CLI
**Decision (owner, 2026-11-03):** Aemeath may read build runs, open pull requests and open issues of one repository, through the owner's own `gh` CLI. It is off by default.  
**Constraints:** The repository is one `owner/name` field in Settings, validated strictly. Only three fixed GET endpoints with a limit of five items are used; there is no free-form endpoint. `gh` is started from an argument list, without a shell. Aemeath never reads, stores, or passes a GitHub token or `gh` config; the login stays with `gh`. Results are only displayed, sanitized, and never sent to a model or run as a command. Nothing from the owner's activity is sent: a request carries the repository name and the owner's `gh` login.  
**Not covered:** writing to GitHub, other services (email, chat), and reading other repositories.  
**Reference:** issue 4, `docs/roadmap/AGENT_BRIDGE_ROADMAP.md` (P6).

## D-016: Session names are read from Claude Code title lines
**Decision (owner, 2026-11-03):** The session list shows the name Claude Code gave each session, so a session can be told apart by more than its id.
**Constraints:** Names come only from the `custom-title` and `ai-title` lines of the owner's own transcripts, and a line is parsed only if it starts with one of those markers, so message text is never parsed or kept. Only the end of a file (and a little of its start) is read. A name the owner set wins over a generated one. Names are cleaned, capped at 40 characters, and secret-looking text is hidden. They are shown in the chat box and in `/claude sesi`, never stored, logged, or sent to any model.
**Changes:** This replaces the earlier stance that a transcript is never opened for the session list.

## D-017: Model, effort and permission kind for /claude
**Decision (owner, 2026-11-04):** In Claude mode the model, the effort and the kind of permission are shown and can be chosen from chips.  
**Constraints:** Every choice is picked from a fixed list and checked in the main process again; a window never sends free text to the CLI. Model aliases are `fable`, `opus`, `sonnet`, `haiku`; efforts are `low` to `max`. Three permission kinds are offered: ask first (the default; an edit waits for a typed "ya"), plan only (the CLI plan mode), and auto edit (edit tools allowed in the working folder, with a warning). Shell commands stay denied in all three. The CLI modes `acceptEdits`, `auto`, `dontAsk`, `manual` and `bypassPermissions` are not offered, because acceptEdits lets some shell redirects through and the others allow commands to run unattended. The model and effort are saved; the permission kind is kept in memory only, so every start begins at ask first, and turning the module off or purging its data resets it.  
**Shown:** the model chip shows the full model name the CLI reports at start, not only the alias that was asked for.

## D-018: Terminal inside Claude mode
**Decision (owner, 2026-11-04):** In Claude mode the owner can use the terminal directly, with a popup dialog before the Windows prompt (UAC).
**Design:** A line typed with a leading `!` runs in the same PowerShell session as terminal mode. The first line of a session shows a dialog from the main process with the exact line, then the unchanged consent gate (UAC), then a shell that runs as a normal user. The dialog is an extra step, not a replacement for UAC. The session ends on `!exit`, when Claude mode ends, when the chat box closes, when the module is turned off or its data purged, after the idle time, and when Aemeath quits.
**Constraints (project rule section 7):** Only text the owner typed reaches the shell. Claude cannot run commands: its output never reaches the shell, the `!` line does not go through Claude, and Claude sees neither the line nor its output. Lines and output are not stored or logged. A terminal-mode session of the owner's is never touched by the bridge, and full terminal mode (`/change-mode`) stays unavailable inside Claude mode.

## Change control
Any change to these decisions must be recorded here with the date, rationale, affected acceptance criteria, and approval from the project owner.
