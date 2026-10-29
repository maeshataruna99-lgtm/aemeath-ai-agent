# Acceptance Criteria — Bilingual Aemeath

Each criterion must be linked to implementation evidence and a test result. A task is not `PASS` just because a code change exists.

## AC-0: Repository audit
- [ ] Actual app architecture and relevant file paths are documented.
- [ ] Existing settings persistence and migration are understood.
- [ ] Prompt assembly and all assistant response paths are mapped.
- [ ] Existing test/build commands are recorded.
- [ ] Baseline failures are separated from regressions introduced by this work.

## AC-1: Locale foundation
- [ ] Fresh installation with no saved locale starts in Indonesian (`id-ID`).
- [ ] Valid saved locale is respected at startup.
- [ ] Selecting English changes active locale to `en-US`.
- [ ] Selected locale persists after full application restart.
- [ ] Invalid/missing locale recovers safely to Indonesian.
- [ ] Existing settings are preserved.
- [ ] Settings contains the language selector; header does not gain a duplicate selector.
- [ ] Locale state has one authoritative source.
- [ ] Locale change updates in-scope UI without restarting where architecture permits.
- [ ] Automated tests cover default, valid, invalid, persistence, and reload cases.

## AC-2: Chatbot behavior
- [ ] Indonesian mode: new assistant responses are Indonesian by default.
- [ ] English mode: new assistant responses are English by default.
- [ ] Switching language affects the next response without starting a new session.
- [ ] Previously stored messages remain unchanged in content and order.
- [ ] All supported response entry points receive the active locale.
- [ ] Streaming does not duplicate messages, chunks, or listeners after locale changes.
- [ ] Persona identity and safety behavior remain consistent.
- [ ] Explicit translation requests can override the default response language when appropriate.
- [ ] Code, URLs, citations, and quoted source content remain valid.
- [ ] Image understanding and clipboard image upload continue to work.
- [ ] Search/tool-assisted answers continue to work and retain valid citations.
- [ ] Offline/local fallback follows active locale where that response path supports it.

## AC-3: UI coverage
- [ ] Both catalogs contain matching required keys.
- [ ] Automated catalog validation reports zero missing required keys.
- [ ] All audited user-visible strings have a translation in both locales.
- [ ] No unintended Indonesian UI remains in English mode.
- [ ] No unintended English UI remains in Indonesian mode.
- [ ] Settings, guidebook, onboarding, dialogs, menus, tooltips, placeholders, errors, notifications, loading states, and avatar dialogue are covered where present.
- [ ] Interpolation, pluralization, punctuation, and special characters render correctly.
- [ ] English text expansion does not create unacceptable clipping or layout breakage.
- [ ] Intentional untranslated content is documented and excluded from the audit.

## AC-4: Regression and release
- [ ] Relevant unit tests pass.
- [ ] Relevant integration tests pass.
- [ ] Critical end-to-end flows pass in both locales.
- [ ] Locale persists across restart and session restoration.
- [ ] Existing settings and chat history remain readable.
- [ ] Image upload, clipboard upload, search, streaming, and offline fallback have regression coverage.
- [ ] Typecheck/lint/build commands that exist in the project pass, or blockers are documented without misrepresenting status.
- [ ] Packaged app launches and respects locale, where packaging can be tested.
- [ ] No new critical/high-severity issue is known.
- [ ] Test report identifies commit SHA, commands, outcomes, and known limitations.

## Definition of Done
A phase is complete only if:
1. The implementation is present in the repository.
2. Acceptance criteria are covered by tests or explicitly justified manual verification.
3. Checks were actually executed.
4. Results, failures, and exceptions are recorded.
5. Regression risks are reviewed.
6. Another developer can reproduce the result.

Do not mark unexecuted tests as passing.
