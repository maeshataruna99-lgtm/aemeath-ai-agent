'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

const { createWorkReviewer } = require('../src/activity/work-reviewer');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-work-reviewer-'));
}

test('work reviewer reports failure when folder is not a git repository', async () => {
  const dir = tempDir();
  try {
    const reviewer = createWorkReviewer({
      spawn: spawn,
      getCwd: () => dir,
    });
    const result = await reviewer.review();
    assert.equal(result.ok, false);
    assert.match(result.text, /belum menemukan repositori git/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('work reviewer inspects a real git repository with modified, untracked, and test files', async () => {
  const dir = tempDir();
  try {
    // 1. Initialize git repo
    execSync('git init', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.name "Tester"', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.email "tester@example.com"', { cwd: dir, stdio: 'ignore' });

    // 2. Initial commit with tracked source and test structure
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'index.js'), '// initial app\n', 'utf8');
    const baseFile = path.join(dir, 'README.md');
    fs.writeFileSync(baseFile, '# Test Project\nInitial line\n', 'utf8');
    execSync('git add .', { cwd: dir, stdio: 'ignore' });
    execSync('git commit -m "initial commit"', { cwd: dir, stdio: 'ignore' });

    const reviewer = createWorkReviewer({
      spawn: spawn,
      getCwd: () => dir,
    });

    // Clean repo check
    const cleanResult = await reviewer.review();
    assert.equal(cleanResult.ok, true);
    assert.match(cleanResult.output, /Working tree bersih/);
    assert.match(cleanResult.text, /Pekerjaanmu rapi banget/);

    // 3. Make modifications: modify baseFile, modify index.js, add untracked file, add test file
    fs.appendFileSync(baseFile, 'Second line added\nThird line added\n', 'utf8');
    fs.appendFileSync(path.join(dir, 'src', 'index.js'), 'const x = 10;\nconsole.log(x);\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'scratch.txt'), 'temporary note\n', 'utf8');
    fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tests', 'app.test.js'), 'const test = 1;\n', 'utf8');

    // Dirty repo check
    const dirtyResult = await reviewer.review();
    assert.equal(dirtyResult.ok, true);
    assert.ok(dirtyResult.metrics.modified >= 1);
    assert.ok(dirtyResult.metrics.untracked >= 2);
    assert.ok(dirtyResult.metrics.testFiles >= 1);
    assert.ok(dirtyResult.metrics.codeFiles >= 1);
    assert.ok(dirtyResult.metrics.addedLines >= 2);
    assert.match(dirtyResult.output, /Berkas berubah:/);
    assert.match(dirtyResult.text, /progres kerjamu/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
