'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOTS = [
  path.join(__dirname, '..', 'src'),
  path.join(__dirname, '..', 'renderer'),
];

const ROOT_FILES = [
  path.join(__dirname, '..', 'main.js'),
  path.join(__dirname, '..', 'preload.js'),
  path.join(__dirname, '..', 'settings-preload.js'),
];

function getJsFiles(dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const allFiles = [...ROOT_FILES];
for (const dir of ROOTS) {
  if (fs.existsSync(dir)) {
    allFiles.push(...getJsFiles(dir));
  }
}

let passed = 0;
let failed = 0;

for (const file of allFiles) {
  const rel = path.relative(path.join(__dirname, '..'), file);
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status === 0) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`Syntax error in ${rel}:\n${res.stderr}`);
  }
}

if (failed > 0) {
  console.error(`Verification failed: ${failed} files have syntax errors, ${passed} passed.`);
  process.exit(1);
} else {
  console.log(`Verification succeeded: all ${passed} JavaScript files are syntactically valid.`);
}
