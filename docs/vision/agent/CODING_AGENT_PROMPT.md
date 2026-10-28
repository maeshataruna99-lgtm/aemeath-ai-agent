# Prompt for Coding Agent — Aemeath Vision

You are implementing the Aemeath Vision roadmap in this repository:

https://github.com/maeshataruna99-lgtm/aemeath-ai-agent

Read `roadmap/ROADMAP.md`, `planning/IMPLEMENTATION_PLAN.md`, `planning/ARCHITECTURE.md`, and `checklists/TEST_MATRIX.md` first.

## Non-negotiable workflow

1. Inspect the current branch, commit, files, package scripts, and tests before editing.
2. Run baseline tests and record actual output.
3. Implement one phase at a time in roadmap order.
4. Add/update tests alongside each change.
5. Run relevant tests after each meaningful change.
6. Before marking a checklist item complete, record evidence: changed files, command run, actual result, and any limitations.
7. Never fabricate successful commands, test counts, model capabilities, or CI status.
8. Never mark a phase green while its acceptance criteria fail.
9. Preserve text chat and existing architecture where possible.
10. Keep secrets in the main process and validate all renderer-provided attachment data.
11. Verify official provider/model documentation before building multimodal requests.
12. Do not claim mock tests prove real vision capability.
13. Do not commit or push unless explicitly authorized.

## Implementation requirements

- Support image attachment via file picker.
- Support clipboard image paste without breaking ordinary text paste.
- Show preview and allow removal before sending.
- Keep text and attachments distinct in the internal contract.
- Validate MIME, content/signature where feasible, size, dimensions, and attachment count.
- Revalidate across IPC boundaries.
- Support vision only through a verified compatible provider/model.
- Add context-aware image analysis for OCR, translation, description, visual identification, screenshot debugging, diagrams, and image comparison where supported.
- Keep follow-up image context bounded and documented.
- Avoid logging image data or credentials.
- Implement cancellation, timeout, cleanup, and clear error states.
- Preserve existing persona, chat history behavior, provider error mapping, and text-only flow.

## Required final report per phase

- Phase name and status.
- Summary of behavior implemented.
- Files changed.
- Tests actually run and actual pass/fail results.
- Evidence for each checklist item.
- Known limitations and remaining work.
- Next phase.

Start with Phase P0 only. Do not jump to implementation until the baseline audit has been recorded.
