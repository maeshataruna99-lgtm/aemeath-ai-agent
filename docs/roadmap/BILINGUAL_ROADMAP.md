# Aemeath Bilingual Implementation Roadmap

## Goal

Deliver complete Indonesian and English experiences across the Aemeath application, including UI, Settings, chatbot responses, avatar/contextual dialogue, errors, loading states, guidebook, and other user-visible strings in scope.

This is **full localization**, not just a language toggle or a translation pass.

## Scope

### Included
- Language preference selection in Settings.
- Locale persistence and safe fallback.
- Centralized translation catalogs and lookup.
- Locale-aware UI across the application.
- Locale-aware chatbot response instructions and all relevant response paths.
- Avatar dialogue and contextual helper text.
- Missing-key detection and translation coverage audit.
- Regression tests for existing functionality.
- Documentation of intentionally untranslated content.

### Explicitly excluded unless source audit proves necessary
- Automatic translation or mutation of historical chat messages.
- Rewriting Aemeath's persona from scratch.
- Replacing the existing Electron architecture.
- Introducing a second settings store or competing locale state.
- Translating source code, code blocks, identifiers, URLs, or quoted material blindly.
- Adding additional languages in this milestone.

## Fixed product decisions

See `DECISION_LOG.md`. These decisions are binding unless the project owner changes them.

## Phase 0 — Repository reconnaissance and baseline

### Tasks
1. Inspect repository instructions, package manifests, app entry points, build scripts, tests, and CI.
2. Map main process, renderer, preload, IPC, settings persistence, chat request flow, prompt/persona assembly, streaming, offline fallback, image input, clipboard upload, and search.
3. Inventory user-visible strings and their source locations.
4. Identify current settings migration behavior and any existing locale-related code.
5. Run existing baseline tests/build where feasible and record exact commands and results.
6. Identify files that should not be changed and security boundaries that must be preserved.
7. Write a concise audit report with actual paths and findings.

### Gate
Do not begin broad implementation until the architecture map and baseline are documented. If the repository cannot be accessed or baseline commands fail for environmental reasons, record that accurately and proceed only where safe.

## Phase 1 — Locale foundation

### Tasks
1. Define a central locale type and supported-locale registry. Recommended values: `id-ID`, `en-US`.
2. Reuse the existing settings persistence mechanism where possible.
3. Default to `id-ID` only when there is no valid saved preference.
4. Preserve existing user settings during migration.
5. Add a single authoritative locale state/service.
6. Add translation catalogs for both locales and a typed or otherwise validated lookup API appropriate to the stack.
7. Define interpolation, pluralization, missing-key behavior, and intentional exceptions.
8. Add language selection in Settings only.
9. Ensure switching locale updates the UI without requiring a full application restart where the current architecture allows.
10. Test locale persistence and recovery.

### Gate
All Phase 1 acceptance criteria pass, with test output and screenshots or equivalent evidence. No broad UI migration is considered complete merely because the selector works.

## Phase 2 — Chatbot language and persona

### Tasks
1. Identify the canonical prompt/persona assembly path.
2. Keep stable persona identity and safety instructions separate from locale-specific response instructions.
3. Pass the active locale through the existing request pipeline rather than inferring it independently in multiple layers.
4. Ensure locale is applied to all relevant response paths: normal, streaming, tool-assisted/search, image/multimodal, error/fallback, and offline/local modes where supported.
5. Preserve existing conversation records and message ordering.
6. Keep user-provided content, citations, URLs, code, and source quotations semantically intact.
7. Verify that explicit translation requests may still request another language when the user clearly asks for it.
8. Avoid over-translating technical terms where English terminology is the correct or conventional form.

### Gate
New assistant responses follow the active locale by default across all supported paths; historical messages remain unchanged; persona regression tests pass.

## Phase 3 — Complete UI localization

### Areas to audit
- Main application navigation and chat controls.
- Settings and preference descriptions.
- Guidebook and help content.
- Onboarding and empty states.
- Buttons, menus, tooltips, labels, accessibility labels, and placeholders.
- Confirmation dialogs and modal content.
- Validation messages, errors, notifications, warnings, and success states.
- Loading, retry, connection, offline, and streaming states.
- Avatar speech, contextual help, and any index/selection explanations.
- Upload and clipboard-related messages.
- Search UI and source/citation labels.
- Any other user-visible text discovered in the audit.

### Tasks
1. Convert in-scope hardcoded strings to stable translation keys.
2. Provide accurate, natural translations in both catalogs.
3. Use interpolation/pluralization APIs rather than concatenating translated fragments.
4. Validate catalog parity and missing keys in tests or CI.
5. Check text expansion, truncation, wrapping, layout, and accessibility in both locales.
6. Document intentional exclusions such as source content, code, user messages, external provider text, and developer-only logs.

### Gate
Zero missing required keys; zero unintended untranslated UI strings in either locale within audited scope; visual checks pass.

## Phase 4 — Regression, packaging, and release verification

### Tasks
1. Run unit, integration, end-to-end, typecheck, lint, and build commands that actually exist in the repository.
2. Test both locales across critical user journeys.
3. Test cold start, restart, settings migration, and session restoration.
4. Test image upload and clipboard image upload, search, streaming, and offline behavior.
5. Test packaged application behavior where supported by the project environment.
6. Audit logs and IPC boundaries for accidental secret exposure.
7. Record known limitations and actual results.
8. Update progress and provide a concise implementation summary with commit/diff references when available.

### Gate
No known critical/high-severity regressions; required checks pass; evidence is recorded. Do not claim release-ready if required checks were not run or are failing.

## Suggested dependency order

`Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4`

Phases may overlap only when the agent can demonstrate that dependencies and acceptance gates remain intact.

## Risks and mitigations

- **Scattered hardcoded strings:** build an inventory first; automate catalog key parity.
- **Prompt drift:** keep persona identity separate from locale instructions.
- **History mutation:** treat persisted messages as immutable for this feature.
- **Locale mismatch in secondary paths:** trace all response entry points and test them individually.
- **Settings migration regressions:** reuse existing storage and test existing user configurations.
- **IPC security regression:** follow existing preload/IPC patterns; do not expose unrestricted APIs.
- **False green status:** require reproducible command output and evidence for each phase.
- **Translation that changes meaning:** review technical terms, quoted content, URLs, and source material explicitly.
