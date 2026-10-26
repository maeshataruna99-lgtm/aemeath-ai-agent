---
name: commit-message
description: Use before writing any git commit, amend, squash, or merge message. Produces conventional-commit messages that are specific and informative - correct type prefix, imperative English subject within 72 characters, body explaining what and why.
---

# Commit message standard

Every commit message in this repo follows Conventional Commits, written in English.
The full rules live in `.claude/CLAUDE.md` ("Standar pesan commit"); this skill is the
working copy for Claude Code.

## Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Subject rules

- Required type: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
  `ci`, `chore`, `revert`.
- Optional lowercase scope naming the module: `feat(api):`.
- Breaking change: `!` before the colon, e.g. `feat(api)!:`.
- Imperative mood: `add`, not `added` / `adds`.
- Lowercase first word unless it is a proper noun. No trailing period.
- Whole subject line at or under 72 characters (aim for 50).
- Be specific: `chore: bump eslint to 9.12`, never `chore: update` or `wip`.

## Body rules (optional, expected for non-trivial changes)

- Separate it from the subject with one blank line (separate `-m` flags do this
  automatically).
- Explain what changed and why (context, motivation, impact), not a line-by-line how —
  the diff already shows that.
- Wrap lines at 72 characters.

## Footer rules (optional)

- `BREAKING CHANGE: <explanation>` for compatibility-breaking changes.
- Issue/PR references: `Closes #123`, `Refs #45`.
- No credit trailers of any kind; that is the no-coauthored-by skill's job.

## Habits

- One commit, one logical change. Do not mix a feature with unrelated refactors.
- Never commit WIP messages. Finish the change or stash it.
- Do not rewrite old commits just to reformat their messages.

## Examples

```
feat(api): add retry with exponential backoff on 5xx

Upstream returns 5xx sporadically under load, which aborted the sync
job and forced a manual restart. Backoff starts at 500 ms and caps at
30 s so a struggling upstream is not hammered.

Closes #112
```

```
fix: disable submit button while request is in flight

Double-clicks during slow responses created duplicate orders.
```
