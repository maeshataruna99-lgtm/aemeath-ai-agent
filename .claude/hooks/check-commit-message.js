// PreToolUse hook: refuse `git commit` commands whose message does not follow the
// commit standard in .claude/CLAUDE.md (Conventional Commits, English, imperative subject
// line of 72 characters or fewer). Only what is visible on the command line is
// checked: -m/--message values and the first line of a -F/--file message file.
// Commits opened in an editor are covered by the commit-message skill instead.
const fs = require('fs');

const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
const SUBJECT_RE = new RegExp(`^(?:${TYPES.join('|')})(?:\\([a-z0-9][a-z0-9._/-]*\\))?!?: \\S.*`);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  let command = '';
  try {
    command = String(JSON.parse(input)?.tool_input?.command ?? '');
  } catch {
    process.exit(0);
  }
  if (!/\bgit\b[^\n]*\bcommit\b/i.test(command)) process.exit(0);

  const subject = extractSubject(command);
  if (subject === null) process.exit(0); // no message visible on the command line
  if (/^(?:merge |revert |fixup! |squash! )/i.test(subject)) process.exit(0); // git's own message styles
  if (/^[$@%]/.test(subject)) process.exit(0); // shell variable, cannot verify

  const problems = [];
  if (!SUBJECT_RE.test(subject)) {
    problems.push(
      `subject must start with a type (${TYPES.join(', ')}) and an optional lowercase scope, e.g. "feat(api): add rate limit"`,
    );
  }
  if (subject.length > 72) {
    problems.push(`subject line is ${subject.length} characters; keep the whole line at 72 or fewer`);
  }
  if (/\.$/.test(subject)) {
    problems.push('subject must not end with a period');
  }
  if (problems.length > 0) {
    process.stderr.write(
      'Blocked: commit message does not follow the standard in .claude/CLAUDE.md (Conventional Commits).\n' +
        problems.map((p) => `  - ${p}\n`).join('') +
        'Fix the message and run the command again.\n',
    );
    process.exit(2);
  }
  process.exit(0);
});

// First -m/--message value, or the first line of a -F/--file message file.
function extractSubject(command) {
  const msgRe = /(?:^|\s)(?:-[a-zA-Z]*m\s*|--message(?:\s*=|\s+))(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/g;
  let first = null;
  let match;
  while ((match = msgRe.exec(command)) !== null) {
    const value =
      match[1] !== undefined
        ? match[1].replace(/\\(["\\])/g, '$1')
        : match[2] !== undefined
          ? match[2]
          : match[3];
    if (first === null) first = value;
  }
  if (first !== null) return first;
  const fileMatch = command.match(/(?:^|\s)(?:-F|--file)\s*=?\s*("([^"]+)"|'([^']+)'|(\S+))/);
  if (fileMatch) {
    const path = fileMatch[2] ?? fileMatch[3] ?? fileMatch[4];
    try {
      return fs.readFileSync(path, 'utf8').split(/\r?\n/)[0];
    } catch {
      return null;
    }
  }
  return null;
}
