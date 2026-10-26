// PreToolUse hook: refuse git commit / gh pr create|edit commands that carry a Co-Authored-By trailer.
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
  const writesHistory = /\bgit\b[^\n]*\bcommit\b/i.test(command) || /\bgh\s+pr\s+(create|edit)\b/i.test(command);
  if (writesHistory && /co-authored-by\s*:/i.test(command)) {
    process.stderr.write(
      'Blocked: this command adds a Co-Authored-By trailer. Remove that line from the commit message or PR body and run it again. The user does not want AI or co-author credits.\n',
    );
    process.exit(2);
  }
  process.exit(0);
});
