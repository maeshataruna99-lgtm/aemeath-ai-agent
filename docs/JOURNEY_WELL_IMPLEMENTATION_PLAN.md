# Implementation Plan — Journey Well Protocol & Travel-Aware Smart Commands

Status: **Not implemented yet**. This document defines the intended engineering approach.
Repository: `maeshataruna99-lgtm/aemeath-ai-agent`

## Current code areas to inspect first

Known from repository documentation/source:
- `src/chat/persona.js`: Aemeath identity, Rover relationship, wiki/companion rules.
- `src/chat/chat-service.js`: provider flow, context/history, search and local fallback.
- `src/chat/local-responder.js`: offline keyword retrieval and small-talk rules.
- `src/chat/text.js`: normalization and keyword helpers.
- `src/behavior/behavior-director.js`: priority, cooldown, queue and proactive behavior.
- `src/atlas.js` and `renderer/pet.js`: sprite atlas animation mapping and dialogue display.
- `src/commands/`: command store/runner and built-in command handling.
- `main.js` and preload bridges: IPC and process/OS integration.
- `tests/`: existing node:test coverage.
- README documents user-configured PowerShell/Bash commands, risky-action confirmation, and a `/matikan` example. P0 must establish whether this is only an example/custom command or a true built-in before changing behavior.

## Architecture principles

1. One event source: use the existing behavior/command orchestration instead of creating a second notification queue.
2. Deterministic local triggers: the signature phrase must work without a model call.
3. Safe separation: chat intent may suggest a shutdown action, but cannot execute it.
4. Source honesty: canon lore retrieval and original roleplay dialogue are different data classes.
5. Graceful fallback: local behavior must survive missing API keys and provider/network failures.
6. Cross-platform honesty: only advertise OS support after tests on that OS.

## Proposed modules and responsibilities

### A. Travel intent resolver
Suggested location: `src/chat/travel-intent.js` (confirm naming conventions before creating).

Return a structured result, for example:
- `intent`: `travel-plan | adventure | departure | return | travel-risk | none`
- `confidence`: bounded numeric value
- `signals`: matched phrases/keywords for test diagnostics
- `needsClarification`: boolean

Do not infer a dangerous situation from a bare mention of travel. Use recent conversation only when available and relevant. Avoid collecting location data automatically.

### B. Journey Well phrase detector
Suggested location: `src/chat/journey-well.js`.

Responsibilities:
- Normalize Unicode, case, whitespace and punctuation.
- Detect exact phrase and conservative variants.
- Distinguish a direct utterance from quoted/discussed text where practical.
- Return an event such as `journey-well-farewell`; do not run OS commands.
- Be deterministic and independently unit-testable.

Potential cases:
- `Journey well` -> signature event.
- `journey WELL!` -> signature event.
- `Aemeath says "Journey well"` -> likely discussion/quote, not necessarily farewell; use intent/context.
- `Have a good journey` -> travel-related sentiment, not exact signature.
- `I saw the phrase Journey Well in a wiki` -> informational mention, not farewell.

### C. Emotional response policy
Prefer a small set of named states rather than unbounded emotion labels:
- `excited`: Rover directly calls Aemeath / friendly greeting.
- `warm-concern`: ordinary travel plan or departure.
- `wistful-concern`: direct Journey Well farewell.
- `serious-support`: user explicitly describes a meaningful risk or distress.
- `neutral-helpful`: technical or unrelated requests.

Emotion changes tone and sprite choice; it must not change factual standards, safety rules, or command permissions. Map only to animation names present in the loaded atlas. If no suitable animation exists, fall back to a valid existing animation.

### D. Smart shutdown flow
The shutdown command must be a state machine:
1. User explicitly requests shutdown using a recognized command.
2. Validate platform and whether a shutdown is already pending.
3. Show what will happen and ask for explicit confirmation.
4. On confirmation, start a short countdown with a visible cancel option.
5. On cancellation, clear the timer and do not call the OS shutdown command.
6. Immediately before execution, show the Journey Well farewell and valid sprite animation.
7. Execute the platform-specific command using a safe argument array / validated script. Never interpolate arbitrary chat text into a shell command.
8. Report success only if the OS command was accepted; otherwise report failure.

Safety requirements:
- No model output, lorebook entry, search result, memory record, or background watcher can trigger shutdown.
- A bare phrase "Journey well" never powers off the computer.
- No shutdown action from a quoted instruction or inferred intent.
- Confirmation expires after a short period.
- Repeated requests cannot queue multiple shutdowns.
- Linux/Windows commands and cancellation behavior must be tested independently.
- Preserve existing high-risk command confirmation and do not weaken it.

### E. Offline response path
Before checking provider/key state:
- Detect local-only events (Journey Well, travel intent, built-in commands).
- Use local persona response for greeting/farewell events when appropriate.
- Keep search unavailable status explicit.
- Ensure fallback does not append the same user turn twice.
- Respect the user's existing offline-fallback setting; local command execution and chat fallback are separate capabilities.

### F. Retrieval/indexing improvement
Incremental plan:
1. Add tests for normalization, phrases, aliases and false positives.
2. Add phrase/intent weighting to current keyword scoring.
3. Include recent-turn context only for follow-up resolution; do not blindly concatenate the entire history into search.
4. Add confidence margin between top result and second result.
5. If the margin is too small, ask a concise clarifying question.
6. Keep source metadata on returned results and surface only sources actually used.
7. Consider embeddings/vector search only if measured keyword-search failures justify the added dependency.

## Test matrix

### Journey Well
- exact phrase; case variants; punctuation; extra spaces
- quote/mention vs farewell intent
- English and Indonesian surrounding text
- no API key; network unavailable; provider timeout
- cooldown and queue priority with a pending decision or timer

### Travel intent
- casual trip; work commute; vacation; hike/adventure; departure; return
- explicit risk vs no risk
- short follow-up ("besok jadi berangkat") using valid recent context
- unrelated technical messages containing words like "journey", "route", or "travel"

### Shutdown
- no confirmation -> no OS call
- confirmed request -> one OS call
- cancellation -> zero OS calls
- timeout/expired confirmation -> zero OS calls
- AI-generated text mentions shutdown -> zero OS calls
- shell metacharacters in user input -> cannot alter executed command
- Windows and Linux platform-specific argument validation
- command failure -> clear error, app remains usable

### Regression
- `npm test`
- `npm run verify`
- `npx electron . --selfie`
- existing `/matikan` custom command behavior remains compatible unless a deliberate migration is documented

## Implementation order

1. P0 audit and baseline.
2. P1 Journey Well detector, response policy, atlas mapping, tests.
3. P2 travel intent and contextual responses.
4. P3 shutdown state machine and safety tests.
5. P4 offline fallback and retrieval improvements.
6. P5 docs, visual regression, full verification.

## Evidence log

Keep this section updated only with actual results:
- Baseline test command/result:
  - `node scripts/verify.js`: Verification succeeded: all 58 JavaScript files are syntactically valid.
  - `npm test`: 334 pass, 0 fail, 0 cancelled, 0 skipped, duration 17.2s.
  - `npx electron . --selfie`: Return code 0, complete selfie run passed without memory leaks or errors.
- Existing shutdown implementation audit:
  - Shutdown is **NOT a built-in command**. The built-in command set (`BUILTIN_NAMES` in `command-store.js` and `builtins` in `main.js`) contains: `change-mode`, `change-mode-search`, `search`, `timer`, `todo`, `note`, `stats`, `review`, `memory`, `focus`, `quest`, `daily`, `chronicle`, `feature`.
  - `/matikan` exists as an optional preset template in `renderer/settings.js` for Windows (`shutdown /s /t 60 ...`) and Linux (`shutdown -h +1 ...`), alongside `/batal` (`shutdown /a` and `shutdown -c`).
  - Risk confirmation: `command-store.js` matches `RISKY` keywords (including `shutdown`, `stop-computer`, `reboot`, `poweroff`, `halt`, etc.) and enforces a mandatory 30-second user confirmation prompt (`Ketik "ya" dalam 30 detik untuk melanjutkan.`) before execution.
  - Execution runner: `command-runner.js` executes Windows PowerShell scripts via `powershell.exe -EncodedCommand` (UTF-16LE base64 encoded) and Linux via `bash --noprofile --norc -c`.
- Atlas animations audit:
  - `assets/pet/atlas.json` defines 9 animations: `idle`, `running-right`, `running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, `review`.
  - The `waving` animation (row 3, 4 frames, 6 fps) already exists and is perfectly suited for farewell / Journey Well gestures.
- P1 Journey Well Protocol test command/result:
  - `tests/journey-well.test.js`: 7 passed, 0 failed.
  - Total `npm test`: 341 passed, 0 failed.
  - `node scripts/verify.js`: Verification succeeded: all 59 JavaScript files are syntactically valid.
  - `npx electron . --selfie`: Return code 0, complete selfie run passed without errors or leaks.
- P2 Travel & Adventure Context test command/result:
  - `tests/travel-intent.test.js`: 10 passed, 0 failed.
  - Total `npm test`: 351 passed, 0 failed.
  - `node scripts/verify.js`: Verification succeeded: all 60 JavaScript files are syntactically valid.
  - `npx electron . --selfie`: Return code 0, complete selfie run passed without errors or leaks.
- Windows manual test: pending
- Linux Mint manual test: pending
- Visual verification: pending
- Final commit/PR: pending
