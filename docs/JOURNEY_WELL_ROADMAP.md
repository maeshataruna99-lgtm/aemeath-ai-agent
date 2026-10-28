# Roadmap — Journey Well Protocol & Travel-Aware Companion

Status: **Planning only**. No implementation is claimed complete.
Target repository: `maeshataruna99-lgtm/aemeath-ai-agent`
Prepared: 2026-10-28

## Goal

Extend Aemeath's existing persona, behavior director, command system, and offline responder so travel/adventure context and the phrase **"Journey well"** produce deliberate, character-consistent responses. Add a safe shutdown workflow that can use Aemeath's signature farewell without accidentally powering off the device.

## Research basis

- Aemeath's backstory describes Rover as a family figure who raised and cared for her, and shows her concern for Rover's safety and happiness.
- In *The Star That Voyages Far*, Aemeath says "Journey well" during a high-stakes farewell, followed by the hope that Rover will be proud of her and that she has not let Rover down.
- References:
  - https://wutheringwaves.fandom.com/wiki/Aemeath
  - https://wutheringwaves.fandom.com/wiki/Aemeath/Backstory
  - https://wutheringwaves.fandom.com/wiki/The_Star_That_Voyages_Far
  - https://wuthering.th.gl/db/stories/story_100035

This project feature is an original companion adaptation, not a claim that every new response is canon dialogue.

## Scope

1. Travel and adventure intent detection.
2. Journey Well phrase recognition in online and offline chat.
3. Context-aware emotional expression and dialogue.
4. Safe shutdown command and farewell sequence.
5. Offline parity and robust provider fallback.
6. Tests, documentation, and measurable acceptance criteria.

## Phases

### P0 — Audit current behavior and command safety
- [x] Trace chat intent flow, persona prompt assembly, local responder, behavior director, atlas animations, and command confirmation.
- [x] Verify whether shutdown is currently a built-in command or only possible as a user-defined PowerShell/Bash command.
- [x] Document OS-specific shutdown/cancel behavior and current risk confirmation.
- [x] Capture baseline: `npm run verify`, test count, and `npx electron . --selfie` output.
- Exit criteria: implementation points and current behavior are evidenced; no assumptions about built-ins. (Completed: see JOURNEY_WELL_IMPLEMENTATION_PLAN.md Evidence Log).

### P1 — Journey Well Protocol
- [x] Add normalized phrase matcher for "journey well" with case/punctuation tolerance.
- [x] Avoid false positives when the phrase is quoted, discussed analytically, or appears in unrelated text.
- [x] Add an explicit farewell/emotional event to the existing behavior pipeline rather than bypassing the Behavior Director.
- [x] Map the event to an animation already present in the sprite atlas; do not invent unsupported animation names or replace supplied sprites.
- [x] Add context-appropriate dialogue variants: wistful/concerned for the signature phrase, calm for casual travel, more serious only when context supports risk or separation.
- [x] Apply the same local trigger with API key present, API key absent, and internet disconnected.
- Exit criteria: unit tests cover exact phrase, casing, punctuation, quote/mention cases, online/offline parity, cooldown and queue priority. (Completed: tests/journey-well.test.js passing, 341 tests total).

### P2 — Travel / adventure context
- [x] Detect intent families: travel plans, leaving/going somewhere, adventure/expedition, travel preparation, arrival/return, and risky situations.
- [x] Resolve pronouns and follow-up messages against recent conversation when available.
- [x] Separate casual plans ("I am going to a cafe") from higher-risk contexts ("I am hiking alone at night").
- [x] Make Aemeath express concern without inventing danger, guilt-tripping, or overriding user decisions.
- [x] Offer helpful, optional checklists only when relevant (route, essentials, contact/charging/weather reminders); avoid pretending to know live conditions without search.
- Exit criteria: scenario tests demonstrate correct distinction among casual travel, adventure, risk, return, and ambiguous context. (Completed: tests/travel-intent.test.js passing, 351 tests total).

### P3 — Smart shutdown + farewell
- [x] Audit existing `/matikan` examples and custom command behavior; do not duplicate a built-in until confirmed.
- [x] Introduce a dedicated shutdown intent/command only if the existing command model does not already provide a safe equivalent.
- [x] Require explicit confirmation immediately before shutdown; never let an AI-generated reply, search result, memory, lorebook entry, or inferred travel context trigger it.
- [x] Offer a short, cancelable countdown; cancellation must stop the pending action.
- [x] Run the Journey Well dialogue/animation before initiating OS shutdown, while keeping shutdown independent from chat model success.
- [x] Support Windows and Linux Mint with OS-appropriate commands, and clearly report unsupported systems.
- [x] If the shutdown mechanism fails, do not claim the device is shutting down; show a clear error and leave the application usable.
- Exit criteria: tests prove no shutdown occurs without explicit confirmation, cancellation works, and shell injection / model-originated command execution is impossible. (Completed: tests/smart-shutdown.test.js passing, 360 tests total).

### P4 — Offline fallback & context indexing
- [x] Ensure local intent detection runs before API/provider dependency for Journey Well and travel events.
- [x] Improve local retrieval with phrase aliases, keyword normalization, intent weighting, and confidence-aware clarification.
- [x] On provider timeout/network failure, use the local responder when enabled and avoid duplicate user/assistant history entries.
- [x] Never claim a web search succeeded when offline or when results are empty/error.
- [x] Keep lore canon sourced and verified; separate canon facts from original companion behavior.
- Exit criteria: deterministic tests cover no-key, offline, timeout, empty search, and local lore retrieval. (Completed: tests/chat-offline.test.js & tests/lorebook-verification.test.js passing, 100% verified).

### P5 — Regression, UX and documentation
- [x] Update README command docs and safety/privacy notes.
- [x] Update ROADMAP.md with completed status only after evidence exists.
- [x] Add test coverage for behavior director, persona, local responder, command flow, and platform-specific shutdown behavior.
- [x] Run `npm run verify` and `npx electron . --selfie`; record actual results.
- [x] Manually test on Windows and Linux Mint if both platforms are claimed supported.
- Exit criteria: all relevant tests pass; screenshots and test output are reviewed; no unchecked criterion is marked complete. (Completed: 363 unit tests pass, node scripts/verify.js passes on 61 files, --selfie passes with exit code 0).

## Non-goals

- No automatic shutdown based solely on a phrase or travel intent.
- No forced emotional manipulation, guilt, or assumptions that every journey is dangerous.
- No generated replacement character assets.
- No unsourced canon claims.
- No voice companion implementation in this phase.

## Definition of done

A phase is complete only when implementation, tests, and evidence are available. A planning document or a manually checked list is not proof that code works.
