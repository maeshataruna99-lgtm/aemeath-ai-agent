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

## Change control
Any change to these decisions must be recorded here with the date, rationale, affected acceptance criteria, and approval from the project owner.
