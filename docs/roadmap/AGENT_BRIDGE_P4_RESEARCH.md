# P4 research — Codex and Antigravity adapters

Status: **Research notes**. No adapter is implemented.  
Prepared: 2026-11-03

Each statement is marked by where it comes from: **official** (the vendor's own docs or FAQ), **community** (issues, forums, third-party posts), **observed** (checked on the owner's machine), or **inferred**. Pages were read through a fetch tool that summarises long pages, so a few items are marked as summary-based.

## Short answer

| | Codex | Antigravity (`agy`) |
|---|---|---|
| Headless run | Yes (`codex exec`) | Yes (`agy -p`) |
| Structured output | Yes (`--json`) | Yes (`--output-format stream-json`) |
| Resume | Yes (`exec resume`) | Yes (`--conversation <id>`, `-c`) |
| Installed here | **No** CLI on PATH (desktop app only) | **No** `agy` (IDE only) |
| Driving it with the owner's own login | Not addressed in the pages read | **Not supported on consumer plans, and called a Terms of Service violation** |
| Recommendation | Build next, after the CLI is installed | Do not build on a consumer login; keep read-only observation |

## Codex

Official (developers.openai.com, now served from learn.chatgpt.com):

- `codex exec "<task>"` runs once and exits. Progress goes to stderr and only the final agent message to stdout. With no prompt argument the prompt is read from stdin; `-` forces stdin.
- `--json` turns stdout into JSON Lines. Event types: `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.*`, `error`. The session id is `thread_id` in `thread.started` (summary-based). The docs do not name one field as the final answer; agent messages arrive as items with a `text` field. `--output-last-message <file>` writes the final message to a file.
- Resume: `codex exec resume <SESSION_ID> "<prompt>"` or `codex exec resume --last`. `--last` is limited to the current working directory unless `--all` is given. Whether an explicit id is also limited by directory is not stated.
- Sandbox: `--sandbox read-only | workspace-write | danger-full-access`. The default is unclear: one page says read-only, the other says it follows `~/.codex/config.toml`. Always pass the flag explicitly. `--cd <path>` sets the workspace root. A run must be inside a Git repository unless `--skip-git-repo-check` is passed.
- Login: `codex exec` reuses the saved CLI login. API key use is `CODEX_API_KEY`. ChatGPT-managed login in automation is described as an advanced option for trusted runners; API keys are the recommended default.
- Terms of use for wrapping the CLI: **not stated** on the pages read.

Observed on this machine:

- `codex` is not on PATH. OpenAI's desktop app is installed as a Windows Store package; its executables sit in the protected `WindowsApps` folder. The CLI would need to be installed separately (the usual route is the npm package). Not verified.
- `~/.codex/sessions/<year>/rollout-<time>-<uuid>.jsonl.zst` holds sessions as **zstd-compressed** files, so the folder-name approach used for Claude sessions does not carry over. Which folder a session belongs to is not in the path; it would have to come from the local state database, which this project should not open (§8).
- `~/.codex/auth.json` exists. The adapter must never read, copy, or log it.

Implications for an adapter:

- Same shape as the Claude adapter: prompt on stdin, argument list, no shell, normal user, `--json`, explicit `--sandbox read-only`, a parser for the event types above.
- Edit approval cannot reuse the Claude trick. The equivalent is a second run with `--sandbox workspace-write` after a typed "ya".
- Session list: skip in the first version. Capture the id from `thread.started` and resume by id; `resume --last` is acceptable inside the chosen working folder.
- Needs a Git repository as the working folder, or `--skip-git-repo-check`.

## Antigravity

Two products share the name. The **IDE** keeps data under `~/.gemini/antigravity` (the existing watcher reads its `brain` folder). The **CLI** is a separate binary, `agy`, with settings under `~/.gemini/antigravity-cli`. Only the CLI is relevant to an adapter.

Official (antigravity.google/docs):

- `agy -p "<prompt>"` (aliases `--print`, `--prompt`). `--output-format text|json|stream-json`, `--input-format text|stream-json`. Multi-turn works with stream-json in and out. Resume with `--continue` or `--conversation <id>`; conversations are scoped to the working folder.
- No prompts in headless mode: a tool that needs approval is soft-denied and the run still exits 0. `--dangerously-skip-permissions` exists and must not be used by this project.
- The docs do not state where conversations are stored.
- Login for headless use is cached OAuth from an interactive login, a Gemini API key (`modelProvider` set to `gemini` in the settings file plus `GEMINI_API_KEY`), or Google application default credentials.

**The blocker** (official FAQ, verified by a second read):

- Wrapping `agy` inside third-party coding agents or applications "is not supported under consumer plans".
- Using third-party software to access Antigravity "is a violation of our Terms of Service" and can lead to suspension or termination of the account.
- The FAQ recommends a Gemini Enterprise or Google AI Studio API key for third-party agents. It does not say whether API-key use of headless mode by a wrapper is allowed.
- A forum reply calls the workflow "fully supported"; that author is not identified as Google staff, and the official FAQ says otherwise, so the FAQ is taken as correct.

**A second risk** (community): `agy -p` has been reported to hang with no output when started without a terminal, which is how Aemeath would start it. First reported on 1.0.6; later comments report it again up to 1.4.10 on Windows. The maintainers closed the issue as obsolete without naming a fix.

Implications:

- A consumer Antigravity login must not be driven by Aemeath. That would put the owner's Google account at risk.
- The only documented path is an API key. That needs encrypted local key storage (project rule §6), a second settings file written for the CLI, and an answer to the open FAQ question. It is a separate decision, not an incremental adapter.
- The existing read-only watcher is unaffected: it reads files the IDE writes and sends nothing anywhere.

## Anthropic's rules for the Claude adapter (already built)

Checked because the same question applies to what is already shipped (official, code.claude.com legal and authentication pages):

- Anthropic does not permit third-party developers to route requests through Free, Pro, Max or Ultra plan credentials, or to collect, store, or intermediate Claude.ai credentials or session tokens.
- The same section carves out an end user signing in to the **unmodified Claude Code binary** with their own subscription. Headless `claude -p` is documented as supported for scripts and CI.
- Developers building products on Claude Code or the Agent SDK should use API key authentication.
- The pages do not define "product" and do not say outright that spawning `claude -p` from a personal desktop tool under the user's own login is allowed. That reading is inferred.

The current adapter stays within the carve-out as written: it runs the unmodified `claude.exe`, never reads or stores credentials, and does not distribute any login. Rules to keep: never read `~/.claude` credential files, never pass tokens to the process, and do not ship this to others with a shared login. This project is a personal, non-commercial companion, which fits the "individual use" wording, but that is the owner's call and not legal advice.

## Decisions (approved by the owner, 2026-11-03)

1. **Codex (D-012):** install the CLI, then build the adapter.
2. **Antigravity (D-013):** the owner chose an adapter that uses a Gemini API key. It stays gated: never a consumer login, the key only in encrypted local storage, and no code until `agy` is installed, the no-terminal hang is tested, and the FAQ gap on wrappers using API keys is accepted. Until then, observation only.
3. **Claude (D-014):** keep as is, with the credential rules above recorded.

The full wording is in `DECISION_LOG.md`.

## Sources

- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/cli/reference
- https://antigravity.google/docs/faq/
- https://antigravity.google/docs/cli/headless/
- https://antigravity.google/docs/cli/reference/
- https://antigravity.google/docs/cli/conversations/
- https://github.com/google-antigravity/antigravity-cli/issues/78
- https://github.com/google-antigravity/antigravity-cli/issues/318
- https://discuss.ai.google.dev/t/is-external-orchestration-of-antigravity-cli-headless-mode-supported-with-account-based-usage/183051
- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/authentication
- https://code.claude.com/docs/en/headless
